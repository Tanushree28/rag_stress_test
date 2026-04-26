"""
S2 -- Retriever
Encode query with MedCPT, search FAISS index for top-k,
then merge with SQLite FTS keyword results for hybrid retrieval,
and rerank combined candidates with cross-encoder to top-5.

Chunk metadata loaded from SQLite (db.py) instead of JSON.

Environment variables:
  RAG_FORCE_CPU_ENCODER=1  -- force MedCPT and cross-encoder onto CPU.
    Use this on Colab/CUDA to match Mac-MPS-FP32 embeddings written
    into the FAISS index. CUDA kernels produce slightly different
    floats and will silently miss against the index.
"""

import logging
import os
import re
from pathlib import Path

import faiss
import numpy as np
import torch
from sentence_transformers import CrossEncoder
from transformers import AutoModel, AutoTokenizer

import db

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")
INDEX_PATH = DATA_DIR / "faiss.index"
MEDCPT_QUERY_MODEL = "ncbi/MedCPT-Query-Encoder"
CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Module-level singletons (lazy-loaded)
_query_encoder = None
_query_tokenizer = None
_cross_encoder = None
_faiss_index = None


# ---------------------------------------------------------------------------
# Lazy loaders
# ---------------------------------------------------------------------------

def _select_device() -> str:
    if os.environ.get("RAG_FORCE_CPU_ENCODER") == "1":
        return "cpu"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _get_query_encoder():
    global _query_tokenizer, _query_encoder
    if _query_encoder is None:
        logger.info("Loading MedCPT Query Encoder...")
        _query_tokenizer = AutoTokenizer.from_pretrained(MEDCPT_QUERY_MODEL)
        _query_encoder = AutoModel.from_pretrained(MEDCPT_QUERY_MODEL)
        _query_encoder.eval()
        device = _select_device()
        _query_encoder = _query_encoder.to(device).float()  # explicit FP32
        logger.info("Query encoder loaded (device=%s, dtype=fp32)", device)
    return _query_tokenizer, _query_encoder


def _get_cross_encoder():
    global _cross_encoder
    if _cross_encoder is None:
        logger.info("Loading cross-encoder: %s", CROSS_ENCODER_MODEL)
        _cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL)
        logger.info("Cross-encoder loaded")
    return _cross_encoder


def _get_index():
    global _faiss_index
    if _faiss_index is None:
        logger.info("Loading FAISS index from %s", INDEX_PATH)
        _faiss_index = faiss.read_index(str(INDEX_PATH))
        logger.info("Index loaded: %d vectors", _faiss_index.ntotal)
    return _faiss_index


# ---------------------------------------------------------------------------
# S2.1 -- Query encoding
# ---------------------------------------------------------------------------

def encode_query(query: str) -> np.ndarray:
    """Encode a query string using MedCPT Query Encoder.

    Returns a normalized 1-D float32 embedding.
    """
    tokenizer, model = _get_query_encoder()
    device = next(model.parameters()).device

    encoded = tokenizer(
        query,
        padding=True,
        truncation=True,
        max_length=512,
        return_tensors="pt",
    ).to(device)

    with torch.no_grad():
        outputs = model(**encoded)
        embedding = outputs.last_hidden_state[:, 0, :].cpu().numpy().astype("float32")

    faiss.normalize_L2(embedding)
    return embedding.squeeze(0)


# ---------------------------------------------------------------------------
# S2.2 -- FAISS search
# ---------------------------------------------------------------------------

def search_faiss(query_embedding: np.ndarray, k: int = 100) -> list[dict]:
    """Search FAISS index and return top-k candidate passages.

    Each result dict has the chunk fields plus 'faiss_score' and 'faiss_rank'.
    """
    index = _get_index()
    k = min(k, index.ntotal)

    query_vec = query_embedding.reshape(1, -1).astype("float32")
    scores, indices = index.search(query_vec, k)

    # Batch lookup from SQLite
    valid_indices = [int(idx) for idx in indices[0] if idx >= 0]
    chunk_list = db.get_chunks_by_ids(valid_indices)
    chunk_map = {c["id"]: c for c in chunk_list}

    results = []
    for rank, (score, idx) in enumerate(zip(scores[0], indices[0])):
        idx = int(idx)
        if idx < 0 or idx not in chunk_map:
            continue
        chunk = dict(chunk_map[idx])
        chunk["faiss_score"] = float(score)
        chunk["faiss_rank"] = rank
        results.append(chunk)

    return results


# ---------------------------------------------------------------------------
# S2.2b -- Keyword search (SQLite FTS / LIKE fallback)
# ---------------------------------------------------------------------------

def _extract_keywords(query: str) -> str:
    """Extract meaningful keywords from a biomedical query for FTS search."""
    # Remove common question words and short words
    stop_words = {
        "what", "which", "how", "does", "is", "are", "was", "were", "the",
        "a", "an", "of", "in", "for", "to", "and", "or", "with", "by",
        "on", "at", "from", "that", "this", "it", "its", "can", "do",
        "has", "have", "been", "be", "not", "no", "but", "so", "if",
        "about", "there", "their", "they", "them", "than", "then",
        "will", "would", "could", "should", "may", "might", "between",
    }
    # Keep words that are likely biomedical terms (longer, capitalized, or specific)
    words = re.findall(r'\b\w+\b', query)
    keywords = []
    for w in words:
        w_lower = w.lower()
        if w_lower in stop_words:
            continue
        if len(w) < 3:
            continue
        keywords.append(w_lower)
    return " ".join(keywords)


def search_keywords(query: str, limit: int = 50) -> list[dict]:
    """Search using keyword matching, return chunk dicts with source='keyword'."""
    keywords = _extract_keywords(query)
    if not keywords:
        return []

    results = db.keyword_search(keywords, limit=limit)
    for r in results:
        r["source"] = r.get("source", "keyword")
    return results


# ---------------------------------------------------------------------------
# S2.3 -- Cross-encoder reranking
# ---------------------------------------------------------------------------

def rerank(query: str, candidates: list[dict], top_k: int = 5) -> list[dict]:
    """Rerank candidates using cross-encoder/ms-marco-MiniLM-L-6-v2.

    Returns top_k candidates sorted by cross-encoder score, with
    'rerank_score' and 'rerank_rank' fields added.
    """
    if not candidates:
        return []

    ce = _get_cross_encoder()
    pairs = [(query, c["text"]) for c in candidates]
    scores = ce.predict(pairs)

    for candidate, score in zip(candidates, scores):
        candidate["rerank_score"] = float(score)

    ranked = sorted(candidates, key=lambda c: c["rerank_score"], reverse=True)
    for i, c in enumerate(ranked):
        c["rerank_rank"] = i

    return ranked[:top_k]


# ---------------------------------------------------------------------------
# S2.4 -- Hybrid retrieval pipeline
# ---------------------------------------------------------------------------

RETRIEVER_MODES = ("hybrid", "faiss_only", "bm25_only", "no_rerank")


def retrieve(
    query: str,
    initial_k: int = 100,
    top_k: int = 5,
    mode: str = "hybrid",
) -> list[dict]:
    """Retrieve top_k passages. Mode controls the ablation:

    - hybrid    : FAISS + BM25 keyword merge -> cross-encoder rerank (default)
    - faiss_only: FAISS candidates only -> cross-encoder rerank
    - bm25_only : SQLite FTS BM25 candidates only -> cross-encoder rerank
    - no_rerank : hybrid merge, keep FAISS-first order, skip cross-encoder
    """
    if mode not in RETRIEVER_MODES:
        raise ValueError(f"Unknown retriever mode: {mode}. Valid: {RETRIEVER_MODES}")

    faiss_candidates: list[dict] = []
    keyword_candidates: list[dict] = []

    if mode in ("hybrid", "faiss_only", "no_rerank"):
        query_embedding = encode_query(query)
        faiss_candidates = search_faiss(query_embedding, k=initial_k)

    if mode in ("hybrid", "bm25_only", "no_rerank"):
        keyword_candidates = search_keywords(query, limit=50)

    # Merge (FAISS first for priority order)
    seen_ids: set = set()
    merged: list[dict] = []
    for c in faiss_candidates:
        cid = c.get("id") or c.get("chunk_id")
        if cid not in seen_ids:
            seen_ids.add(cid)
            merged.append(c)
    for c in keyword_candidates:
        cid = c.get("id") or c.get("chunk_id")
        if cid not in seen_ids:
            seen_ids.add(cid)
            merged.append(c)

    logger.info(
        "Retrieval[%s]: %d FAISS + %d keyword = %d unique for: %s",
        mode, len(faiss_candidates), len(keyword_candidates), len(merged), query[:80],
    )

    if mode == "no_rerank":
        # Keep candidate order (FAISS first), truncate to top_k
        for i, c in enumerate(merged[:top_k]):
            c["rerank_score"] = c.get("faiss_score", 0.0)
            c["rerank_rank"] = i
        return merged[:top_k]

    return rerank(query, merged, top_k=top_k)


# ---------------------------------------------------------------------------
# Live PubMed fallback (for Free Chat mode)
# ---------------------------------------------------------------------------

def faiss_max_score(query: str) -> float:
    """Return the top-1 FAISS score for a query (used to decide fallback)."""
    embedding = encode_query(query)
    index = _get_index()
    scores, _ = index.search(embedding.reshape(1, -1), 1)
    return float(scores[0][0])


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    db.init_db()

    # Quick test: retrieve for a sample BioASQ question
    results = retrieve("Is Hirschsprung disease a mendelian or multifactorial disorder?")
    print(f"\nTop {len(results)} results:")
    for r in results:
        print(
            f"  [{r['rerank_rank']}] score={r['rerank_score']:.4f} "
            f"pmid={r['pmid']} chunk={r['chunk_id']}"
        )
        print(f"       {r['text'][:120]}...")
