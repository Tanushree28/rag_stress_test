"""Standalone ablation runner for Colab.

Runs the full RAG stress-test pipeline across 3 retriever ablation modes
(faiss_only, bm25_only, no_rerank) for n questions per type x 8 conditions.
Writes results to data/experiments_ablation.db (separate from main DB so
nothing gets mixed up). Designed to be invoked via:

    python run_ablation.py --n_per_type 25 --modes faiss_only,bm25_only,no_rerank

Reuses retriever.py / generator.py / evaluator.py / perturbation_engine.py
exactly as they're imported by api/main.py -- same code path, same metrics.
"""

import argparse
import json
import logging
import random
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path

import db as corpus_db
from evaluator import evaluate
from generator import generate
from perturbation_engine import CONDITION_TYPES, apply_perturbation
from retriever import RETRIEVER_MODES, retrieve

logger = logging.getLogger("ablation")

DATA_DIR = Path("data")
ABL_DB = DATA_DIR / "experiments_ablation.db"


def init_ablation_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(ABL_DB))
    conn.execute(
        """CREATE TABLE IF NOT EXISTS experiments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            question_id TEXT,
            question_type TEXT,
            question_body TEXT,
            condition TEXT NOT NULL,
            answer TEXT,
            metrics TEXT,
            passages TEXT,
            duration_s REAL,
            retriever_mode TEXT
        )"""
    )
    conn.commit()
    conn.close()


def save_row(record: dict):
    conn = sqlite3.connect(str(ABL_DB))
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
            record.get("retriever_mode"),
        ),
    )
    conn.commit()
    conn.close()


def already_done(question_id: str, condition: str, mode: str) -> bool:
    conn = sqlite3.connect(str(ABL_DB))
    row = conn.execute(
        "SELECT 1 FROM experiments WHERE question_id=? AND condition=? AND retriever_mode=? LIMIT 1",
        (question_id, condition, mode),
    ).fetchone()
    conn.close()
    return row is not None


def sample_questions(questions: list, n_per_type: int, seed: int) -> list:
    rng = random.Random(seed)
    by_type: dict[str, list] = {}
    for q in questions:
        by_type.setdefault(q["type"], []).append(q)
    out = []
    for qtype in ["factoid", "list", "yesno", "summary"]:
        pool = by_type.get(qtype, [])
        rng.shuffle(pool)
        out.extend(pool[:n_per_type])
    return out


def run(modes: list[str], n_per_type: int, conditions: list[str], seed: int):
    init_ablation_db()
    corpus_db.init_db()

    questions_path = DATA_DIR / "questions.json"
    with open(questions_path) as f:
        all_questions = json.load(f)
    sampled = sample_questions(all_questions, n_per_type, seed=seed)
    logger.info("Sampled %d questions (%d/type)", len(sampled), n_per_type)

    total_runs = len(modes) * len(sampled) * len(conditions)
    completed = skipped = failed = 0
    started = time.time()

    for mode in modes:
        logger.info("=== Retriever mode: %s ===", mode)
        for qi, q in enumerate(sampled):
            try:
                passages = retrieve(q["body"], top_k=5, mode=mode)
            except Exception as e:
                logger.warning("Retrieve failed for q=%s mode=%s: %s", q["id"], mode, e)
                failed += len(conditions)
                continue
            snippets = q.get("snippets")
            for condition in conditions:
                if already_done(q["id"], condition, mode):
                    skipped += 1
                    continue
                t0 = time.time()
                try:
                    perturbed = apply_perturbation(
                        passages, condition, snippets=snippets, question_body=q["body"]
                    )
                    gen_result = generate(q["body"], perturbed)
                    metrics = evaluate(q["body"], gen_result["answer"], perturbed, q)
                    if metrics.get("groundedness"):
                        metrics["groundedness"].pop("details", None)
                    save_row({
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                        "question_id": q["id"],
                        "question_type": q["type"],
                        "question_body": q["body"],
                        "condition": condition,
                        "answer": gen_result["answer"],
                        "metrics": metrics,
                        "passages": [
                            {"chunk_id": p.get("chunk_id"), "pmid": p.get("pmid"),
                             "text": p.get("text", "")}
                            for p in perturbed
                        ],
                        "duration_s": round(time.time() - t0, 2),
                        "retriever_mode": mode,
                    })
                    completed += 1
                except Exception as e:
                    logger.warning("Run failed q=%s cond=%s mode=%s: %s",
                                   q["id"], condition, mode, e)
                    failed += 1

            done = completed + skipped + failed
            if (qi + 1) % 5 == 0 or qi == len(sampled) - 1:
                elapsed = time.time() - started
                rate = completed / elapsed if elapsed > 0 else 0
                remaining = (total_runs - done) / rate if rate > 0 else 0
                logger.info(
                    "[%s] q %d/%d -- done=%d skipped=%d failed=%d -- "
                    "%.1f runs/s -- ETA %.1f min",
                    mode, qi + 1, len(sampled), completed, skipped, failed,
                    rate, remaining / 60,
                )

    elapsed = time.time() - started
    logger.info("ALL DONE in %.1f min: completed=%d skipped=%d failed=%d -> %s",
                elapsed / 60, completed, skipped, failed, ABL_DB)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s: %(message)s",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--n_per_type", type=int, default=25)
    parser.add_argument(
        "--modes",
        type=str,
        default="faiss_only,bm25_only,no_rerank",
        help="Comma-separated retriever modes to run",
    )
    parser.add_argument(
        "--conditions",
        type=str,
        default=",".join(CONDITION_TYPES.keys()),
        help="Comma-separated perturbation conditions",
    )
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    modes = [m.strip() for m in args.modes.split(",") if m.strip()]
    for m in modes:
        if m not in RETRIEVER_MODES:
            raise SystemExit(f"Unknown retriever_mode: {m}. Valid: {RETRIEVER_MODES}")
    conditions = [c.strip() for c in args.conditions.split(",") if c.strip()]
    for c in conditions:
        if c not in CONDITION_TYPES:
            raise SystemExit(f"Unknown condition: {c}")

    run(modes=modes, n_per_type=args.n_per_type, conditions=conditions, seed=args.seed)
