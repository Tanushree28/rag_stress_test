"""
FastAPI backend wrapping the RAG stress-test pipeline.

Endpoints:
  POST /ask           -- full pipeline: retrieve + generate + evaluate
  POST /ask/stream    -- SSE streaming: tokens + metrics
  POST /retrieve      -- retrieval only
  POST /perturb       -- apply perturbation to passages
  POST /evaluate      -- evaluate answer against gold
  POST /compare       -- compare metrics across conditions (parallel)
  POST /compare/stream -- SSE: stream condition results as they complete
  POST /prefetch      -- precompute retrieval for a question
  GET  /questions     -- list available BioASQ questions
  GET  /conditions    -- list available perturbation conditions
  GET  /history       -- experiment history from SQLite
  GET  /corpus/stats  -- corpus size and composition
"""

import json
import logging
import random
import sqlite3
import sys
import time
import uuid
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# Add project root to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import db as corpus_db
from corpus_builder import load_bioasq
from evaluator import evaluate, nli_groundedness, retrieval_metrics, task_metrics
from generator import generate, generate_stream, parse_citations
from perturbation_engine import CONDITION_TYPES, apply_perturbation
from retriever import retrieve, faiss_max_score

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "experiments.db"

# Retrieval cache: stores pre-fetched passages keyed by question body
_retrieval_cache: dict[str, list[dict]] = {}
_RETRIEVAL_CACHE_MAX = 200


# ---------------------------------------------------------------------------
# SQLite setup (experiments DB -- separate from corpus DB)
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


def _get_cached_result(question_id: str, condition: str) -> dict | None:
    """Check experiments.db for a previous run of this question+condition."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT answer, metrics, passages, duration_s FROM experiments "
        "WHERE question_id = ? AND condition = ? ORDER BY id DESC LIMIT 1",
        (question_id, condition),
    ).fetchone()
    conn.close()
    if row:
        return {
            "answer": row["answer"],
            "metrics": json.loads(row["metrics"]) if row["metrics"] else None,
            "passages": json.loads(row["passages"]) if row["passages"] else [],
            "duration_s": row["duration_s"],
        }
    return None


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

_questions: list[dict] = []
_batch_jobs: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _questions
    _init_db()
    corpus_db.init_db()

    questions_path = DATA_DIR / "questions.json"
    if questions_path.exists():
        with open(questions_path) as f:
            _questions = json.load(f)
        logger.info("Loaded %d questions from cache", len(_questions))
    else:
        _questions = load_bioasq(max_questions=400)
        logger.info("Loaded %d questions from BioASQ", len(_questions))
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(questions_path, "w") as f:
            json.dump(_questions, f)
        logger.info("Saved %d questions to %s", len(_questions), questions_path)
    yield


app = FastAPI(title="RAG Stress-Test API", version="0.2.0", lifespan=lifespan)

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
    use_cache: bool = False

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
    use_cache: bool = False

class PrefetchRequest(BaseModel):
    question: str
    top_k: int = Field(default=5, ge=1, le=20)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _find_question(question_id: str) -> dict | None:
    for q in _questions:
        if q["id"] == question_id:
            return q
    return None


def _get_passages(question: str, top_k: int = 5) -> list[dict]:
    """Get passages from cache or retrieve fresh."""
    if question in _retrieval_cache:
        return _retrieval_cache[question]
    passages = retrieve(question, top_k=top_k)
    if len(_retrieval_cache) < _RETRIEVAL_CACHE_MAX:
        _retrieval_cache[question] = passages
    return passages


def _run_condition(
    question_body: str,
    condition: str,
    passages: list[dict],
    gold_question: dict,
    question_id: str,
) -> dict:
    """Run a single condition pipeline: perturb -> generate -> evaluate -> save.
    Designed to be called from ThreadPoolExecutor."""
    start = time.time()
    snippets = gold_question.get("snippets")
    perturbed = apply_perturbation(passages, condition, snippets=snippets, question_body=question_body)
    gen_result = generate(question_body, perturbed)
    metrics = evaluate(question_body, gen_result["answer"], perturbed, gold_question)
    if metrics.get("groundedness"):
        metrics["groundedness"].pop("details", None)
    duration = time.time() - start

    _save_experiment({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "question_id": question_id,
        "question_type": gold_question["type"],
        "question_body": question_body,
        "condition": condition,
        "answer": gen_result["answer"],
        "metrics": metrics,
        "passages": [
            {
                "chunk_id": p.get("chunk_id"),
                "pmid": p.get("pmid"),
                "text": p.get("text", ""),
                "source": p.get("source", ""),
                "rerank_score": p.get("rerank_score"),
                "faiss_score": p.get("faiss_score"),
            }
            for p in perturbed
        ],
        "duration_s": round(duration, 2),
    })

    return {
        "condition": condition,
        "answer": gen_result["answer"],
        "citations": gen_result["citations"],
        "metrics": metrics,
        "duration_s": round(duration, 2),
        "passages": [
            {
                "text": p.get("text", ""),
                "pmid": p.get("pmid", ""),
                "chunk_id": p.get("chunk_id", ""),
                "rerank_score": p.get("rerank_score"),
                "faiss_score": p.get("faiss_score"),
                "source": p.get("source", ""),
            }
            for p in perturbed
        ],
    }


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


@app.get("/corpus/stats")
def corpus_stats():
    """Return corpus size and composition."""
    stats = corpus_db.corpus_stats()
    try:
        import faiss
        index_path = DATA_DIR / "faiss.index"
        if index_path.exists():
            index = faiss.read_index(str(index_path))
            stats["faiss_vectors"] = index.ntotal
    except Exception:
        stats["faiss_vectors"] = None
    return stats


@app.post("/prefetch")
def prefetch_endpoint(req: PrefetchRequest):
    """Precompute retrieval for a question (called on question select)."""
    passages = retrieve(req.question, top_k=req.top_k)
    if len(_retrieval_cache) < _RETRIEVAL_CACHE_MAX:
        _retrieval_cache[req.question] = passages
    return {
        "count": len(passages),
        "faiss_top_score": passages[0].get("faiss_score", passages[0].get("rerank_score", 0)) if passages else 0,
        "cached": True,
    }


@app.post("/retrieve")
def retrieve_endpoint(req: RetrieveRequest):
    """Retrieve top-k passages for a query."""
    passages = _get_passages(req.question, top_k=req.top_k)
    score = passages[0].get("faiss_score", passages[0].get("rerank_score", 0)) if passages else 0
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
    # Check result cache
    if req.use_cache and req.question_id:
        cached = _get_cached_result(req.question_id, req.condition)
        if cached:
            return {
                "answer": cached["answer"],
                "citations": parse_citations(cached["answer"]),
                "passages": cached["passages"],
                "condition": req.condition,
                "metrics": cached["metrics"],
                "duration_s": cached["duration_s"],
                "from_cache": True,
            }

    start = time.time()

    passages = _get_passages(req.question, top_k=req.top_k)

    gold_question = None
    if req.question_id:
        gold_question = _find_question(req.question_id)

    snippets = gold_question.get("snippets") if gold_question else None
    perturbed = apply_perturbation(passages, req.condition, snippets=snippets)

    gen_result = generate(req.question, perturbed)

    metrics = None
    if gold_question:
        metrics = evaluate(req.question, gen_result["answer"], perturbed, gold_question)
        if metrics.get("groundedness"):
            metrics["groundedness"].pop("details", None)

    duration = time.time() - start

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


@app.post("/ask/stream")
def ask_stream_endpoint(req: AskRequest):
    """SSE streaming: tokens arrive as they're generated, metrics at end."""
    passages = _get_passages(req.question, top_k=req.top_k)

    gold_question = None
    if req.question_id:
        gold_question = _find_question(req.question_id)

    snippets = gold_question.get("snippets") if gold_question else None
    perturbed = apply_perturbation(passages, req.condition, snippets=snippets)

    def token_stream():
        full_answer = ""
        for token in generate_stream(req.question, perturbed):
            full_answer += token
            yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"

        # Compute metrics after generation
        metrics = None
        if gold_question:
            metrics = evaluate(req.question, full_answer, perturbed, gold_question)
            if metrics and metrics.get("groundedness"):
                metrics["groundedness"].pop("details", None)

        citations = parse_citations(full_answer)

        yield f"data: {json.dumps({'type': 'complete', 'citations': citations, 'metrics': metrics, 'passages': perturbed})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_stream(), media_type="text/event-stream")


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
    """Run the pipeline across multiple conditions in parallel."""
    gold_question = _find_question(req.question_id)
    if not gold_question:
        raise HTTPException(status_code=404, detail="Question ID not found")

    passages = _get_passages(gold_question["body"], top_k=5)

    # Check cache for each condition if requested
    results = []
    conditions_to_run = []

    if req.use_cache:
        for condition in req.conditions:
            cached = _get_cached_result(req.question_id, condition)
            if cached:
                results.append({
                    "condition": condition,
                    "answer": cached["answer"],
                    "citations": parse_citations(cached["answer"]),
                    "metrics": cached["metrics"],
                    "duration_s": cached["duration_s"],
                    "from_cache": True,
                })
            else:
                conditions_to_run.append(condition)
    else:
        conditions_to_run = list(req.conditions)

    # Run remaining conditions in parallel
    if conditions_to_run:
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {
                pool.submit(
                    _run_condition,
                    gold_question["body"],
                    condition,
                    passages,
                    gold_question,
                    req.question_id,
                ): condition
                for condition in conditions_to_run
            }
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as e:
                    condition = futures[future]
                    logger.error("Condition %s failed: %s", condition, e)
                    results.append({
                        "condition": condition,
                        "error": str(e),
                    })

    # Sort results to match requested order
    order = {c: i for i, c in enumerate(req.conditions)}
    results.sort(key=lambda r: order.get(r.get("condition", ""), 999))

    return {
        "question_id": req.question_id,
        "question": gold_question["body"],
        "question_type": gold_question["type"],
        "results": results,
    }


@app.post("/compare/stream")
def compare_stream_endpoint(req: CompareRequest):
    """SSE streaming: each condition result sent as it completes."""
    gold_question = _find_question(req.question_id)
    if not gold_question:
        raise HTTPException(status_code=404, detail="Question ID not found")

    passages = _get_passages(gold_question["body"], top_k=5)

    def event_generator():
        # Send initial metadata
        yield f"data: {json.dumps({'type': 'start', 'total_conditions': len(req.conditions)})}\n\n"

        # Check cache first
        conditions_to_run = []
        if req.use_cache:
            for condition in req.conditions:
                cached = _get_cached_result(req.question_id, condition)
                if cached:
                    result = {
                        "condition": condition,
                        "answer": cached["answer"],
                        "citations": parse_citations(cached["answer"]),
                        "metrics": cached["metrics"],
                        "duration_s": cached["duration_s"],
                        "from_cache": True,
                        "passages": cached.get("passages", []),
                    }
                    yield f"data: {json.dumps({'type': 'result', 'data': result})}\n\n"
                else:
                    conditions_to_run.append(condition)
        else:
            conditions_to_run = list(req.conditions)

        # Run remaining in parallel, stream as each completes
        if conditions_to_run:
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = {
                    pool.submit(
                        _run_condition,
                        gold_question["body"],
                        condition,
                        passages,
                        gold_question,
                        req.question_id,
                    ): condition
                    for condition in conditions_to_run
                }
                for future in as_completed(futures):
                    try:
                        result = future.result()
                        yield f"data: {json.dumps({'type': 'result', 'data': result})}\n\n"
                    except Exception as e:
                        condition = futures[future]
                        yield f"data: {json.dumps({'type': 'error', 'condition': condition, 'error': str(e)})}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


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


@app.get("/aggregate/degradation")
def degradation_curves():
    """Return per-condition mean + std for degradation curve charts.

    Groups conditions into perturbation families (noise, conflict, unanswerable)
    and orders them by intensity so the frontend can plot proper curves.
    """
    import math

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    all_rows = conn.execute(
        """SELECT condition, question_type, metrics
           FROM experiments
           WHERE metrics IS NOT NULL AND metrics != '{}'"""
    ).fetchall()
    conn.close()

    groups: dict[str, list[dict]] = defaultdict(list)
    for row in all_rows:
        metrics = json.loads(row["metrics"])
        if metrics:
            groups[row["condition"]].append(metrics)

    def compute_stats(values: list[float]) -> dict:
        if not values:
            return {"mean": None, "std": None, "n": 0}
        n = len(values)
        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / n if n > 1 else 0
        return {"mean": mean, "std": math.sqrt(variance), "n": n}

    extractors = {
        "map_at_k": lambda m: m.get("retrieval", {}).get("map_at_k"),
        "mrr_at_k": lambda m: m.get("retrieval", {}).get("mrr_at_k"),
        "ndcg_at_k": lambda m: m.get("retrieval", {}).get("ndcg_at_k"),
        "precision_at_k": lambda m: m.get("retrieval", {}).get("precision_at_k"),
        "scr": lambda m: m.get("groundedness", {}).get("supported_claim_rate"),
        "citation_precision": lambda m: m.get("groundedness", {}).get("citation_precision"),
        "entailment": lambda m: m.get("groundedness", {}).get("avg_entailment_score"),
        "task_score": lambda m: m.get("task", {}).get("score"),
    }

    result = []
    for condition, metrics_list in sorted(groups.items()):
        if not metrics_list:
            continue
        entry: dict = {"condition": condition, "count": len(metrics_list)}
        for metric_name, extractor in extractors.items():
            vals = []
            for m in metrics_list:
                try:
                    v = extractor(m)
                    if v is not None:
                        vals.append(v)
                except (KeyError, TypeError):
                    pass
            entry[metric_name] = compute_stats(vals)
        result.append(entry)

    return {"conditions": result}


@app.get("/aggregate/crosstab")
def crosstab_stats():
    """Return condition x question_type cross-tabulation of avg metrics.

    Useful for seeing which question types are most affected by each condition.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    all_rows = conn.execute(
        """SELECT condition, question_type, metrics
           FROM experiments
           WHERE metrics IS NOT NULL AND metrics != '{}'
           AND question_type IS NOT NULL"""
    ).fetchall()
    conn.close()

    # Group by (condition, question_type)
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in all_rows:
        key = (row["condition"], row["question_type"])
        metrics = json.loads(row["metrics"])
        if metrics:
            groups[key].append(metrics)

    result = []
    for (condition, qtype), metrics_list in sorted(groups.items()):
        if not metrics_list:
            continue

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
            "condition": condition,
            "question_type": qtype,
            "count": len(metrics_list),
            "avg_map": safe_avg(lambda m: m["retrieval"]["map_at_k"]),
            "avg_scr": safe_avg(lambda m: m["groundedness"]["supported_claim_rate"]),
            "avg_task_score": safe_avg(lambda m: m["task"]["score"]),
            "avg_ndcg": safe_avg(lambda m: m["retrieval"]["ndcg_at_k"]),
        })

    return {"rows": result}


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
            passages = _get_passages(q["body"], top_k=req.top_k)
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


# ---------------------------------------------------------------------------
# Batch experiment (background job across all conditions)
# ---------------------------------------------------------------------------

def _run_batch_experiment(
    job_id: str,
    sampled_questions: list[dict],
    conditions: list[str],
    top_k: int,
) -> None:
    """Background task: run all question x condition pairs and save results."""
    job = _batch_jobs[job_id]
    try:
        for q in sampled_questions:
            # Retrieve once per question, then reuse across all conditions.
            passages = retrieve(q["body"], top_k=top_k)
            snippets = q.get("snippets")
            for condition in conditions:
                try:
                    start = time.time()
                    perturbed = apply_perturbation(passages, condition, snippets=snippets)
                    gen_result = generate(q["body"], perturbed)
                    metrics = evaluate(q["body"], gen_result["answer"], perturbed, q)
                    if metrics.get("groundedness"):
                        metrics["groundedness"].pop("details", None)
                    duration = time.time() - start
                    _save_experiment({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "question_id": q["id"],
                        "question_type": q["type"],
                        "question_body": q["body"],
                        "condition": condition,
                        "answer": gen_result["answer"],
                        "metrics": metrics,
                        "passages": [
                            {"chunk_id": p.get("chunk_id"), "pmid": p.get("pmid")}
                            for p in perturbed
                        ],
                        "duration_s": round(duration, 2),
                    })
                    job["completed"] += 1
                except Exception:
                    job["failed"] += 1
        job["status"] = "done"
    except Exception:
        job["status"] = "error"


class BatchExperimentRequest(BaseModel):
    n_per_type: int = Field(default=25, ge=1, le=100)
    conditions: list[str] = Field(
        default_factory=lambda: list(CONDITION_TYPES.keys())
    )
    top_k: int = Field(default=5, ge=1, le=20)


@app.post("/batch/experiment")
def start_batch_experiment(
    req: BatchExperimentRequest,
    background_tasks: BackgroundTasks,
):
    """Start a background batch experiment across question types and conditions."""
    for condition in req.conditions:
        if condition not in CONDITION_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown condition: {condition}",
            )

    question_types = ["factoid", "list", "yesno", "summary"]
    sampled: list[dict] = []
    for qtype in question_types:
        pool = [q for q in _questions if q["type"] == qtype]
        random.shuffle(pool)
        sampled.extend(pool[: req.n_per_type])

    total_runs = len(sampled) * len(req.conditions)
    job_id = str(uuid.uuid4())
    _batch_jobs[job_id] = {
        "status": "running",
        "completed": 0,
        "total": total_runs,
        "failed": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    background_tasks.add_task(
        _run_batch_experiment, job_id, sampled, req.conditions, req.top_k
    )

    return {"job_id": job_id, **_batch_jobs[job_id]}


@app.get("/batch/experiment/{job_id}")
def get_batch_experiment_status(job_id: str):
    """Poll the status of a background batch experiment."""
    job = _batch_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, **job}
