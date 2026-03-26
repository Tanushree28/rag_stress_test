"""
FastAPI backend wrapping the RAG stress-test pipeline.

Endpoints:
  POST /ask        -- full pipeline: retrieve + generate + evaluate
  POST /retrieve   -- retrieval only
  POST /perturb    -- apply perturbation to passages
  POST /evaluate   -- evaluate answer against gold
  POST /compare    -- compare metrics across conditions
  GET  /questions  -- list available BioASQ questions
  GET  /conditions -- list available perturbation conditions
  GET  /history    -- experiment history from SQLite
"""

import json
import logging
import sqlite3
import sys
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from corpus_builder import load_bioasq
from evaluator import evaluate, nli_groundedness, retrieval_metrics, task_metrics
from generator import generate, parse_citations
from perturbation_engine import CONDITION_TYPES, apply_perturbation
from retriever import retrieve, faiss_max_score

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "experiments.db"

# ---------------------------------------------------------------------------
# SQLite setup
# ---------------------------------------------------------------------------

def _init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS experiments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            question_id TEXT,
            question_type TEXT,
            question_body TEXT,
            condition TEXT NOT NULL,
            answer TEXT,
            metrics TEXT,
            passages TEXT,
            duration_s REAL
        )
    """)
    conn.commit()
    conn.close()


def _save_experiment(record: dict):
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """INSERT INTO experiments
           (timestamp, question_id, question_type, question_body,
            condition, answer, metrics, passages, duration_s)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            record["timestamp"],
            record.get("question_id"),
            record.get("question_type"),
            record.get("question_body"),
            record["condition"],
            record.get("answer"),
            json.dumps(record.get("metrics", {})),
            json.dumps(record.get("passages", [])),
            record.get("duration_s"),
        ),
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

_questions: list[dict] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _questions
    _init_db()
    questions_path = DATA_DIR / "questions.json"
    if questions_path.exists():
        with open(questions_path) as f:
            _questions = json.load(f)
        logger.info("Loaded %d questions from cache", len(_questions))
    else:
        _questions = load_bioasq(max_questions=400)
        logger.info("Loaded %d questions from BioASQ", len(_questions))
        # Persist so perturbation_engine can load them
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(questions_path, "w") as f:
            json.dump(_questions, f)
        logger.info("Saved %d questions to %s", len(_questions), questions_path)
    yield


app = FastAPI(title="RAG Stress-Test API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question: str
    question_id: str | None = None
    condition: str = "clean"
    top_k: int = Field(default=5, ge=1, le=20)

class RetrieveRequest(BaseModel):
    question: str
    top_k: int = Field(default=5, ge=1, le=20)

class PerturbRequest(BaseModel):
    passages: list[dict]
    condition: str
    snippets: list[dict] | None = None

class EvaluateRequest(BaseModel):
    question: str
    answer: str
    passages: list[dict]
    question_id: str | None = None

class CompareRequest(BaseModel):
    question_id: str
    conditions: list[str] = Field(default_factory=lambda: list(CONDITION_TYPES.keys()))


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _find_question(question_id: str) -> dict | None:
    for q in _questions:
        if q["id"] == question_id:
            return q
    return None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/questions")
def list_questions(
    qtype: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """List available BioASQ questions, optionally filtered by type."""
    qs = _questions
    if qtype:
        qs = [q for q in qs if q["type"] == qtype]
    total = len(qs)
    qs = qs[offset : offset + limit]
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "questions": [
            {"id": q["id"], "type": q["type"], "body": q["body"]}
            for q in qs
        ],
    }


@app.get("/conditions")
def list_conditions():
    """List available perturbation conditions."""
    return {"conditions": list(CONDITION_TYPES.keys())}


@app.post("/retrieve")
def retrieve_endpoint(req: RetrieveRequest):
    """Retrieve top-k passages for a query."""
    passages = retrieve(req.question, top_k=req.top_k)
    score = faiss_max_score(req.question)
    return {
        "passages": passages,
        "faiss_top_score": score,
        "count": len(passages),
    }


@app.post("/perturb")
def perturb_endpoint(req: PerturbRequest):
    """Apply a perturbation condition to passages."""
    if req.condition not in CONDITION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown condition: {req.condition}. Valid: {list(CONDITION_TYPES.keys())}",
        )
    perturbed = apply_perturbation(req.passages, req.condition, snippets=req.snippets)
    return {"passages": perturbed, "condition": req.condition, "count": len(perturbed)}


@app.post("/ask")
def ask_endpoint(req: AskRequest):
    """Full pipeline: retrieve -> perturb -> generate -> evaluate."""
    start = time.time()

    # Retrieve
    passages = retrieve(req.question, top_k=req.top_k)

    # Find BioASQ question for gold data (if available)
    gold_question = None
    if req.question_id:
        gold_question = _find_question(req.question_id)

    # Perturb
    snippets = gold_question.get("snippets") if gold_question else None
    perturbed = apply_perturbation(passages, req.condition, snippets=snippets)

    # Generate
    gen_result = generate(req.question, perturbed)

    # Evaluate (if gold question available)
    metrics = None
    if gold_question:
        metrics = evaluate(
            req.question,
            gen_result["answer"],
            perturbed,
            gold_question,
        )
        # Strip details from groundedness to reduce payload
        if metrics.get("groundedness"):
            metrics["groundedness"].pop("details", None)

    duration = time.time() - start

    # Save to history
    _save_experiment({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question_id": req.question_id,
        "question_type": gold_question["type"] if gold_question else None,
        "question_body": req.question,
        "condition": req.condition,
        "answer": gen_result["answer"],
        "metrics": metrics,
        "passages": [{"chunk_id": p.get("chunk_id"), "pmid": p.get("pmid")} for p in perturbed],
        "duration_s": round(duration, 2),
    })

    return {
        "answer": gen_result["answer"],
        "citations": gen_result["citations"],
        "passages": perturbed,
        "condition": req.condition,
        "metrics": metrics,
        "duration_s": round(duration, 2),
    }


@app.post("/evaluate")
def evaluate_endpoint(req: EvaluateRequest):
    """Evaluate an answer against gold data."""
    gold_question = None
    if req.question_id:
        gold_question = _find_question(req.question_id)
    if not gold_question:
        raise HTTPException(status_code=404, detail="Question ID not found")

    metrics = evaluate(req.question, req.answer, req.passages, gold_question)
    if metrics.get("groundedness"):
        metrics["groundedness"].pop("details", None)
    return {"metrics": metrics}


@app.post("/compare")
def compare_endpoint(req: CompareRequest):
    """Run the pipeline across multiple conditions and compare metrics."""
    gold_question = _find_question(req.question_id)
    if not gold_question:
        raise HTTPException(status_code=404, detail="Question ID not found")

    results = []
    passages = retrieve(gold_question["body"], top_k=5)

    for condition in req.conditions:
        start = time.time()
        snippets = gold_question.get("snippets")
        perturbed = apply_perturbation(passages, condition, snippets=snippets)
        gen_result = generate(gold_question["body"], perturbed)
        metrics = evaluate(
            gold_question["body"],
            gen_result["answer"],
            perturbed,
            gold_question,
        )
        if metrics.get("groundedness"):
            metrics["groundedness"].pop("details", None)

        duration = time.time() - start

        _save_experiment({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question_id": req.question_id,
            "question_type": gold_question["type"],
            "question_body": gold_question["body"],
            "condition": condition,
            "answer": gen_result["answer"],
            "metrics": metrics,
            "passages": [{"chunk_id": p.get("chunk_id"), "pmid": p.get("pmid")} for p in perturbed],
            "duration_s": round(duration, 2),
        })

        results.append({
            "condition": condition,
            "answer": gen_result["answer"],
            "citations": gen_result["citations"],
            "metrics": metrics,
            "duration_s": round(duration, 2),
        })

    return {
        "question_id": req.question_id,
        "question": gold_question["body"],
        "question_type": gold_question["type"],
        "results": results,
    }


@app.get("/history")
def history_endpoint(
    limit: int = 50,
    offset: int = 0,
    condition: str | None = None,
    question_type: str | None = None,
    question_id: str | None = None,
):
    """Get experiment history from SQLite with optional filters."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    where_clauses: list[str] = []
    params: list = []
    if condition:
        where_clauses.append("condition = ?")
        params.append(condition)
    if question_type:
        where_clauses.append("question_type = ?")
        params.append(question_type)
    if question_id:
        where_clauses.append("question_id = ?")
        params.append(question_id)

    where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

    total = conn.execute(
        f"SELECT COUNT(*) FROM experiments{where_sql}", params
    ).fetchone()[0]

    rows = conn.execute(
        f"SELECT * FROM experiments{where_sql} ORDER BY id DESC LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()
    conn.close()

    experiments = []
    for row in rows:
        exp = dict(row)
        exp["metrics"] = json.loads(exp["metrics"]) if exp["metrics"] else None
        exp["passages"] = json.loads(exp["passages"]) if exp["passages"] else []
        experiments.append(exp)

    return {"total": total, "offset": offset, "limit": limit, "experiments": experiments}


@app.get("/aggregate/stats")
def aggregate_stats(group_by: str = "condition"):
    """Aggregate metrics grouped by condition or question_type."""
    if group_by not in ("condition", "question_type"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid group_by: {group_by}. Must be 'condition' or 'question_type'.",
        )

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    all_rows = conn.execute(
        """SELECT condition, question_type, metrics
           FROM experiments
           WHERE metrics IS NOT NULL AND metrics != '{}'"""
    ).fetchall()
    conn.close()

    from collections import defaultdict

    groups: dict[str, list[dict]] = defaultdict(list)
    for row in all_rows:
        key = row[group_by]
        metrics = json.loads(row["metrics"])
        if metrics:
            groups[key].append(metrics)

    result = []
    for key, metrics_list in sorted(groups.items()):
        if not metrics_list or key is None:
            continue
        count = len(metrics_list)

        def safe_avg(extractor):
            vals = []
            for m in metrics_list:
                try:
                    v = extractor(m)
                    if v is not None:
                        vals.append(v)
                except (KeyError, TypeError):
                    pass
            return sum(vals) / len(vals) if vals else None

        result.append({
            "group": key,
            "count": count,
            "avg_map": safe_avg(lambda m: m["retrieval"]["map_at_k"]),
            "avg_mrr": safe_avg(lambda m: m["retrieval"]["mrr_at_k"]),
            "avg_ndcg": safe_avg(lambda m: m["retrieval"]["ndcg_at_k"]),
            "avg_precision": safe_avg(lambda m: m["retrieval"]["precision_at_k"]),
            "avg_scr": safe_avg(lambda m: m["groundedness"]["supported_claim_rate"]),
            "avg_cp": safe_avg(lambda m: m["groundedness"]["citation_precision"]),
            "avg_entailment": safe_avg(lambda m: m["groundedness"]["avg_entailment_score"]),
            "avg_task_score": safe_avg(lambda m: m["task"]["score"]),
        })

    return {"group_by": group_by, "groups": result}


class BatchRunRequest(BaseModel):
    question_ids: list[str]
    condition: str = "clean"
    top_k: int = Field(default=5, ge=1, le=20)


@app.post("/batch/run")
def batch_run(req: BatchRunRequest):
    """Run /ask on multiple questions with a given condition."""
    if req.condition not in CONDITION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown condition: {req.condition}",
        )

    results = []
    completed = 0
    failed = 0

    for qid in req.question_ids:
        q = _find_question(qid)
        if not q:
            results.append({"question_id": qid, "error": "not found"})
            failed += 1
            continue

        try:
            start = time.time()
            passages = retrieve(q["body"], top_k=req.top_k)
            snippets = q.get("snippets")
            perturbed = apply_perturbation(passages, req.condition, snippets=snippets)
            gen_result = generate(q["body"], perturbed)
            metrics = evaluate(q["body"], gen_result["answer"], perturbed, q)
            if metrics.get("groundedness"):
                metrics["groundedness"].pop("details", None)
            duration = time.time() - start

            _save_experiment({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "question_id": qid,
                "question_type": q["type"],
                "question_body": q["body"],
                "condition": req.condition,
                "answer": gen_result["answer"],
                "metrics": metrics,
                "passages": [
                    {"chunk_id": p.get("chunk_id"), "pmid": p.get("pmid")}
                    for p in perturbed
                ],
                "duration_s": round(duration, 2),
            })

            results.append({
                "question_id": qid,
                "condition": req.condition,
                "task_score": metrics["task"]["score"],
                "duration_s": round(duration, 2),
            })
            completed += 1
        except Exception as e:
            results.append({"question_id": qid, "error": str(e)})
            failed += 1

    return {
        "condition": req.condition,
        "total": len(req.question_ids),
        "completed": completed,
        "failed": failed,
        "results": results,
    }
