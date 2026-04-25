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
from retriever import retrieve, faiss_max_score, RETRIEVER_MODES

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
    # Add retriever_mode column if missing (ablation tracking)
    cols = {row[1] for row in conn.execute("PRAGMA table_info(experiments)").fetchall()}
    if "retriever_mode" not in cols:
        conn.execute("ALTER TABLE experiments ADD COLUMN retriever_mode TEXT DEFAULT 'hybrid'")
    conn.commit()
    conn.close()


def _save_experiment(record: dict):
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """INSERT INTO experiments
           (timestamp, question_id, question_type, question_body,
            condition, answer, metrics, passages, duration_s, retriever_mode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
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
            record.get("retriever_mode", "hybrid"),
        ),
    )
    conn.commit()
    conn.close()


def _get_cached_result(
    question_id: str, condition: str, retriever_mode: str = "hybrid"
) -> dict | None:
    """Check experiments.db for a previous run of this question+condition+mode."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT answer, metrics, passages, duration_s FROM experiments "
        "WHERE question_id = ? AND condition = ? "
        "AND COALESCE(retriever_mode, 'hybrid') = ? "
        "ORDER BY id DESC LIMIT 1",
        (question_id, condition, retriever_mode),
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
    retriever_mode: str = "hybrid"

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


def _get_passages(question: str, top_k: int = 5, mode: str = "hybrid") -> list[dict]:
    """Get passages from cache or retrieve fresh. Cache key includes mode."""
    cache_key = f"{mode}::{question}"
    if cache_key in _retrieval_cache:
        return _retrieval_cache[cache_key]
    passages = retrieve(question, top_k=top_k, mode=mode)
    if len(_retrieval_cache) < _RETRIEVAL_CACHE_MAX:
        _retrieval_cache[cache_key] = passages
    return passages


def _run_condition(
    question_body: str,
    condition: str,
    passages: list[dict],
    gold_question: dict,
    question_id: str,
    retriever_mode: str = "hybrid",
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
        "retriever_mode": retriever_mode,
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
    """List available perturbation conditions and retriever modes."""
    return {
        "conditions": list(CONDITION_TYPES.keys()),
        "retriever_modes": list(RETRIEVER_MODES),
    }


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
    if req.retriever_mode not in RETRIEVER_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown retriever_mode: {req.retriever_mode}. Valid: {RETRIEVER_MODES}",
        )
    # Check result cache
    if req.use_cache and req.question_id:
        cached = _get_cached_result(req.question_id, req.condition, req.retriever_mode)
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

    passages = _get_passages(req.question, top_k=req.top_k, mode=req.retriever_mode)

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
        "retriever_mode": req.retriever_mode,
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


class ReevalRequest(BaseModel):
    limit: int = Field(default=10_000, ge=1, le=50_000)
    condition: str | None = None
    only_if_passages: bool = True
    dry_run: bool = False


@app.post("/reevaluate")
def reevaluate_endpoint(req: ReevalRequest):
    """Recompute groundedness (entailment, SCR, citation precision) on
    already-stored experiments using the corrected evaluator.

    Leaves retrieval + task metrics untouched (they were not broken).
    Useful when re-running the full LLM pipeline would be expensive.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    where = ["metrics IS NOT NULL", "answer IS NOT NULL", "passages IS NOT NULL"]
    params: list = []
    if req.condition:
        where.append("condition = ?")
        params.append(req.condition)
    sql = f"SELECT id, answer, passages, metrics FROM experiments WHERE {' AND '.join(where)} LIMIT ?"
    rows = conn.execute(sql, params + [req.limit]).fetchall()

    updated = 0
    skipped = 0
    hydrated = 0
    errors = 0
    corpus_conn = corpus_db.get_connection()
    for row in rows:
        try:
            passages = json.loads(row["passages"]) if row["passages"] else []
            # Hydrate missing text by looking up chunk_id in corpus.db
            missing = [p for p in passages if not p.get("text") and p.get("chunk_id")]
            if missing:
                chunk_ids = [p["chunk_id"] for p in missing]
                placeholders = ",".join("?" * len(chunk_ids))
                crows = corpus_conn.execute(
                    f"SELECT chunk_id, text, title FROM chunks WHERE chunk_id IN ({placeholders})",
                    chunk_ids,
                ).fetchall()
                cmap = {r["chunk_id"]: r for r in crows}
                for p in missing:
                    c = cmap.get(p["chunk_id"])
                    if c:
                        p["text"] = c["text"]
                        p.setdefault("title", c["title"])
                        hydrated += 1

            if req.only_if_passages and not any(p.get("text") for p in passages):
                skipped += 1
                continue
            metrics = json.loads(row["metrics"]) if row["metrics"] else {}
            ground = nli_groundedness(row["answer"] or "", passages)
            ground.pop("details", None)
            metrics["groundedness"] = ground
            if not req.dry_run:
                conn.execute(
                    "UPDATE experiments SET metrics = ? WHERE id = ?",
                    (json.dumps(metrics), row["id"]),
                )
            updated += 1
        except Exception:
            errors += 1
    if not req.dry_run:
        conn.commit()
    conn.close()
    return {
        "scanned": len(rows),
        "updated": updated,
        "hydrated_passages": hydrated,
        "skipped_no_text": skipped,
        "errors": errors,
        "dry_run": req.dry_run,
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
def aggregate_stats(
    group_by: str = "condition",
    retriever_mode: str | None = None,
    normalize: str | None = None,
):
    """Aggregate metrics grouped by condition or question_type.

    If group_by == 'retriever_mode', cross-tabulates metrics by retriever mode
    (useful for the ablation table).
    """
    if group_by not in ("condition", "question_type", "retriever_mode"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Invalid group_by. Must be 'condition', 'question_type', "
                "or 'retriever_mode'."
            ),
        )

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    base_sql = (
        "SELECT condition, question_type, metrics, "
        "COALESCE(retriever_mode, 'hybrid') AS retriever_mode "
        "FROM experiments WHERE metrics IS NOT NULL AND metrics != '{}'"
    )
    params: list = []
    if retriever_mode:
        base_sql += " AND COALESCE(retriever_mode, 'hybrid') = ?"
        params.append(retriever_mode)
    all_rows = conn.execute(base_sql, params).fetchall()
    conn.close()

    # For macro-average (normalize=by_type) we need question_type alongside
    # the main grouping key.
    groups: dict = defaultdict(list)
    for row in all_rows:
        key = row[group_by]
        metrics = json.loads(row["metrics"])
        if not metrics:
            continue
        if normalize == "by_type" and group_by != "question_type":
            qt = row["question_type"] or "unknown"
            groups[(key, qt)].append(metrics)
        else:
            groups[key].append(metrics)

    extractors = {
        "avg_map": lambda m: m["retrieval"]["map_at_k"],
        "avg_mrr": lambda m: m["retrieval"]["mrr_at_k"],
        "avg_ndcg": lambda m: m["retrieval"]["ndcg_at_k"],
        "avg_precision": lambda m: m["retrieval"]["precision_at_k"],
        "avg_scr": lambda m: m["groundedness"]["supported_claim_rate"],
        "avg_cp": lambda m: m["groundedness"]["citation_precision"],
        "avg_entailment": lambda m: m["groundedness"]["avg_entailment_score"],
        "avg_task_score": lambda m: m["task"]["score"],
    }

    def safe_mean(metrics_list, extractor):
        vals = []
        for m in metrics_list:
            try:
                v = extractor(m)
                if v is not None:
                    vals.append(v)
            except (KeyError, TypeError):
                pass
        return sum(vals) / len(vals) if vals else None

    result = []
    if normalize == "by_type" and group_by != "question_type":
        # (condition, question_type) -> metrics_list; macro-avg across types.
        per_cond_type: dict[str, dict[str, list[float]]] = defaultdict(
            lambda: defaultdict(list)
        )
        per_cond_count: dict[str, int] = defaultdict(int)
        for (cond, qt), metrics_list in groups.items():
            if cond is None:
                continue
            per_cond_count[cond] += len(metrics_list)
            for mname, extractor in extractors.items():
                mean_qt = safe_mean(metrics_list, extractor)
                if mean_qt is not None:
                    per_cond_type[cond][mname].append(mean_qt)

        for cond in sorted(per_cond_count.keys()):
            entry = {"group": cond, "count": per_cond_count[cond]}
            for mname in extractors.keys():
                per_type_means = per_cond_type[cond][mname]
                entry[mname] = (
                    sum(per_type_means) / len(per_type_means)
                    if per_type_means
                    else None
                )
            entry["n_types"] = len(per_cond_type[cond].get("avg_map", []))
            result.append(entry)
    else:
        for key, metrics_list in sorted(groups.items()):
            if not metrics_list or key is None:
                continue
            entry = {"group": key, "count": len(metrics_list)}
            for mname, extractor in extractors.items():
                entry[mname] = safe_mean(metrics_list, extractor)
            result.append(entry)

    return {"group_by": group_by, "normalize": normalize, "groups": result}


@app.get("/aggregate/degradation")
def degradation_curves(
    bootstrap: int = 1000,
    seed: int = 42,
    retriever_mode: str | None = None,
    normalize: str | None = None,
):
    """Return per-condition mean, std, and bootstrap 95% CI for each metric.

    Args:
        bootstrap: number of bootstrap resamples (0 disables CI computation).
        seed: RNG seed for reproducible CIs.
    """
    import math

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    base_sql = (
        "SELECT condition, question_type, metrics "
        "FROM experiments WHERE metrics IS NOT NULL AND metrics != '{}'"
    )
    params: list = []
    if retriever_mode:
        base_sql += " AND COALESCE(retriever_mode, 'hybrid') = ?"
        params.append(retriever_mode)
    all_rows = conn.execute(base_sql, params).fetchall()
    conn.close()

    # Collect by condition, and also by (condition, question_type) for macro-avg.
    groups: dict[str, list[dict]] = defaultdict(list)
    groups_qt: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in all_rows:
        metrics = json.loads(row["metrics"])
        if not metrics:
            continue
        groups[row["condition"]].append(metrics)
        qt = row["question_type"] or "unknown"
        groups_qt[(row["condition"], qt)].append(metrics)

    rng = random.Random(seed)

    def bootstrap_ci(values: list[float], iters: int) -> tuple[float, float] | tuple[None, None]:
        if iters <= 0 or len(values) < 2:
            return (None, None)
        n = len(values)
        means = []
        for _ in range(iters):
            sample = [values[rng.randrange(n)] for _ in range(n)]
            means.append(sum(sample) / n)
        means.sort()
        lo = means[int(0.025 * iters)]
        hi = means[int(0.975 * iters) - 1]
        return (lo, hi)

    def compute_stats(values: list[float]) -> dict:
        if not values:
            return {"mean": None, "std": None, "n": 0, "ci95_lo": None, "ci95_hi": None}
        n = len(values)
        mean = sum(values) / n
        variance = sum((v - mean) ** 2 for v in values) / n if n > 1 else 0
        lo, hi = bootstrap_ci(values, bootstrap)
        return {
            "mean": mean,
            "std": math.sqrt(variance),
            "n": n,
            "ci95_lo": lo,
            "ci95_hi": hi,
        }

    def macro_stats(value_lists: list[list[float]]) -> dict:
        """Macro-average across question-type buckets.

        Mean of per-type means, std is the std across per-type means,
        and CI is a stratified bootstrap that resamples within each type
        then averages the per-type means.
        """
        nonempty = [v for v in value_lists if v]
        if not nonempty:
            return {"mean": None, "std": None, "n": 0, "ci95_lo": None, "ci95_hi": None}
        per_type_means = [sum(v) / len(v) for v in nonempty]
        total_n = sum(len(v) for v in nonempty)
        mean = sum(per_type_means) / len(per_type_means)
        if len(per_type_means) > 1:
            variance = sum((pt - mean) ** 2 for pt in per_type_means) / len(per_type_means)
            std = math.sqrt(variance)
        else:
            std = 0.0
        # Stratified bootstrap for CI
        if bootstrap > 0 and total_n >= 2:
            boot_means = []
            for _ in range(bootstrap):
                per_type_resampled = []
                for vlist in nonempty:
                    n = len(vlist)
                    sample = [vlist[rng.randrange(n)] for _ in range(n)]
                    per_type_resampled.append(sum(sample) / n)
                boot_means.append(sum(per_type_resampled) / len(per_type_resampled))
            boot_means.sort()
            lo = boot_means[int(0.025 * bootstrap)]
            hi = boot_means[int(0.975 * bootstrap) - 1]
        else:
            lo, hi = None, None
        return {
            "mean": mean,
            "std": std,
            "n": total_n,
            "n_types": len(per_type_means),
            "ci95_lo": lo,
            "ci95_hi": hi,
        }

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

    # Build the list of question_types per condition so we can iterate buckets
    conditions_to_types: dict[str, list[str]] = defaultdict(list)
    for (cond, qt) in groups_qt.keys():
        conditions_to_types[cond].append(qt)

    result = []
    for condition, metrics_list in sorted(groups.items()):
        if not metrics_list:
            continue
        entry: dict = {"condition": condition, "count": len(metrics_list)}
        for metric_name, extractor in extractors.items():
            if normalize == "by_type":
                value_lists: list[list[float]] = []
                for qt in conditions_to_types[condition]:
                    qt_vals = []
                    for m in groups_qt[(condition, qt)]:
                        try:
                            v = extractor(m)
                            if v is not None:
                                qt_vals.append(v)
                        except (KeyError, TypeError):
                            pass
                    value_lists.append(qt_vals)
                entry[metric_name] = macro_stats(value_lists)
            else:
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

    return {"conditions": result, "normalize": normalize}


@app.get("/aggregate/significance")
def significance_tests(baseline: str = "clean", test: str = "wilcoxon"):
    """Paired significance tests of each condition vs the baseline.

    Pairs experiments by question_id so we compare matched observations.
    Reports Wilcoxon signed-rank p-value (default) or paired t-test, plus
    Cohen's d effect size on the paired differences.
    """
    try:
        from scipy import stats as sp_stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"scipy required: {e}")

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """SELECT question_id, condition, metrics FROM experiments
           WHERE metrics IS NOT NULL AND metrics != '{}'
             AND question_id IS NOT NULL"""
    ).fetchall()
    conn.close()

    # question_id -> condition -> metrics (last one wins per pair)
    per_q: dict[str, dict[str, dict]] = defaultdict(dict)
    for r in rows:
        m = json.loads(r["metrics"])
        if m:
            per_q[r["question_id"]][r["condition"]] = m

    metric_extractors = {
        "map_at_k": lambda m: m.get("retrieval", {}).get("map_at_k"),
        "ndcg_at_k": lambda m: m.get("retrieval", {}).get("ndcg_at_k"),
        "mrr_at_k": lambda m: m.get("retrieval", {}).get("mrr_at_k"),
        "scr": lambda m: m.get("groundedness", {}).get("supported_claim_rate"),
        "citation_precision": lambda m: m.get("groundedness", {}).get("citation_precision"),
        "entailment": lambda m: m.get("groundedness", {}).get("avg_entailment_score"),
        "task_score": lambda m: m.get("task", {}).get("score"),
    }

    # Collect conditions that appear
    conditions = set()
    for cmap in per_q.values():
        conditions.update(cmap.keys())
    conditions.discard(baseline)

    results = []
    for cond in sorted(conditions):
        cond_entry = {"condition": cond, "baseline": baseline, "metrics": {}}
        for mname, extractor in metric_extractors.items():
            base_vals: list[float] = []
            cond_vals: list[float] = []
            for qid, cmap in per_q.items():
                if baseline in cmap and cond in cmap:
                    bv = extractor(cmap[baseline])
                    cv = extractor(cmap[cond])
                    if bv is not None and cv is not None:
                        base_vals.append(float(bv))
                        cond_vals.append(float(cv))
            n = len(base_vals)
            entry: dict = {"n_pairs": n}
            if n >= 2:
                diffs = [c - b for c, b in zip(cond_vals, base_vals)]
                mean_diff = sum(diffs) / n
                var = sum((d - mean_diff) ** 2 for d in diffs) / (n - 1)
                sd = var ** 0.5
                entry["mean_diff"] = mean_diff
                entry["cohens_d"] = mean_diff / sd if sd > 0 else None
                entry["mean_baseline"] = sum(base_vals) / n
                entry["mean_condition"] = sum(cond_vals) / n
                try:
                    if test == "ttest":
                        stat, p = sp_stats.ttest_rel(cond_vals, base_vals)
                        entry["test"] = "paired_t"
                    else:
                        # Wilcoxon needs non-zero differences
                        nonzero = [(c, b) for c, b in zip(cond_vals, base_vals) if c != b]
                        if len(nonzero) < 2:
                            entry["test"] = "wilcoxon"
                            entry["statistic"] = None
                            entry["p_value"] = None
                            cond_entry["metrics"][mname] = entry
                            continue
                        cv2, bv2 = zip(*nonzero)
                        stat, p = sp_stats.wilcoxon(cv2, bv2, zero_method="wilcox")
                        entry["test"] = "wilcoxon"
                    entry["statistic"] = float(stat)
                    entry["p_value"] = float(p)
                except Exception as e:
                    entry["error"] = str(e)
            cond_entry["metrics"][mname] = entry
        results.append(cond_entry)

    return {"baseline": baseline, "test": test, "results": results}


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
    retriever_mode: str = "hybrid"


@app.post("/batch/run")
def batch_run(req: BatchRunRequest):
    """Run /ask on multiple questions with a given condition."""
    if req.condition not in CONDITION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown condition: {req.condition}",
        )
    if req.retriever_mode not in RETRIEVER_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown retriever_mode: {req.retriever_mode}. Valid: {RETRIEVER_MODES}",
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
            passages = _get_passages(q["body"], top_k=req.top_k, mode=req.retriever_mode)
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
                "retriever_mode": req.retriever_mode,
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
    skip_existing: bool = True,
    retriever_mode: str = "hybrid",
) -> None:
    """Background task: run all question x condition pairs and save results."""
    job = _batch_jobs[job_id]
    try:
        for q in sampled_questions:
            # Retrieve once per question, then reuse across all conditions.
            passages = retrieve(q["body"], top_k=top_k, mode=retriever_mode)
            snippets = q.get("snippets")
            for condition in conditions:
                if skip_existing and _get_cached_result(q["id"], condition, retriever_mode):
                    job["skipped"] += 1
                    continue
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
                        "retriever_mode": retriever_mode,
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
    skip_existing: bool = True
    retriever_mode: str = "hybrid"


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
    if req.retriever_mode not in RETRIEVER_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown retriever_mode: {req.retriever_mode}. Valid: {RETRIEVER_MODES}",
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
        "skipped": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }

    background_tasks.add_task(
        _run_batch_experiment,
        job_id,
        sampled,
        req.conditions,
        req.top_k,
        req.skip_existing,
        req.retriever_mode,
    )

    return {"job_id": job_id, **_batch_jobs[job_id]}


@app.get("/batch/experiment/{job_id}")
def get_batch_experiment_status(job_id: str):
    """Poll the status of a background batch experiment."""
    job = _batch_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job_id, **job}
