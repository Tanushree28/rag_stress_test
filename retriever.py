"""
S2 -- Retriever
Encode query with MedCPT, search FAISS index for top-20,
rerank with cross-encoder to top-5.
"""

import json
import logging
from pathlib import Path

import faiss
import numpy as np
import torch
from sentence_transformers import CrossEncoder
from transformers import AutoModel, AutoTokenizer

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")
INDEX_PATH = DATA_DIR / "faiss.index"
CHUNKS_PATH = DATA_DIR / "chunks.json"
MEDCPT_QUERY_MODEL = "ncbi/MedCPT-Query-Encoder"
CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Module-level singletons (lazy-loaded)
_query_encoder = None
_query_tokenizer = None
_cross_encoder = None
_faiss_index = None
_chunks = None


# ---------------------------------------------------------------------------
# Lazy loaders
# ---------------------------------------------------------------------------

def _get_query_encoder():
    global _query_tokenizer, _query_encoder
    if _query_encoder is None:
        logger.info("Loading MedCPT Query Encoder...")
        _query_tokenizer = AutoTokenizer.from_pretrained(MEDCPT_QUERY_MODEL)
        _query_encoder = AutoModel.from_pretrained(MEDCPT_QUERY_MODEL)
        _query_encoder.eval()
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        _query_encoder = _query_encoder.to(device)
        logger.info("Query encoder loaded (device=%s)", device)
    return _query_tokenizer, _query_encoder


def _get_cross_encoder():
    global _cross_encoder
    if _cross_encoder is None:
        logger.info("Loading cross-encoder: %s", CROSS_ENCODER_MODEL)
        _cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL)
        logger.info("Cross-encoder loaded")
    return _cross_encoder


def _get_index_and_chunks():
    global _faiss_index, _chunks
    if _faiss_index is None:
        logger.info("Loading FAISS index from %s", INDEX_PATH)
        _faiss_index = faiss.read_index(str(INDEX_PATH))
        with open(CHUNKS_PATH) as f:
            _chunks = json.load(f)
        logger.info(
            "Index loaded: %d vectors, %d chunks", _faiss_index.ntotal, len(_chunks)
        )
    return _faiss_index, _chunks


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

def search_faiss(query_embedding: np.ndarray, k: int = 20) -> list[dict]:
    """Search FAISS index and return top-k candidate passages.

    Each result dict has the chunk fields plus 'faiss_score' and 'faiss_rank'.
    """
    index, chunks = _get_index_and_chunks()
    k = min(k, index.ntotal)

    query_vec = query_embedding.reshape(1, -1).astype("float32")
    scores, indices = index.search(query_vec, k)

    results = []
    for rank, (score, idx) in enumerate(zip(scores[0], indices[0])):
        if idx < 0:
            continue
        chunk = dict(chunks[idx])
        chunk["faiss_score"] = float(score)
        chunk["faiss_rank"] = rank
        results.append(chunk)

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
# S2.4 -- Full retrieval pipeline
# ---------------------------------------------------------------------------

def retrieve(query: str, initial_k: int = 20, top_k: int = 5) -> list[dict]:
    """Full retrieval pipeline: encode -> FAISS search -> cross-encoder rerank.

    Returns top_k passages with scores from both stages.
    """
    query_embedding = encode_query(query)
    candidates = search_faiss(query_embedding, k=initial_k)
    results = rerank(query, candidates, top_k=top_k)

    logger.info(
        "Retrieved %d -> reranked to %d for: %s",
        len(candidates), len(results), query[:80],
    )
    return results


# ---------------------------------------------------------------------------
# Live PubMed fallback (for Free Chat mode)
# ---------------------------------------------------------------------------

def faiss_max_score(query: str) -> float:
    """Return the top-1 FAISS score for a query (used to decide fallback)."""
    embedding = encode_query(query)
    index, _ = _get_index_and_chunks()
    scores, _ = index.search(embedding.reshape(1, -1), 1)
    return float(scores[0][0])


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Quick test: retrieve for a sample BioASQ question
    results = retrieve("Is Hirschsprung disease a mendelian or multifactorial disorder?")
    print(f"\nTop {len(results)} results:")
    for r in results:
        print(
            f"  [{r['rerank_rank']}] score={r['rerank_score']:.4f} "
            f"pmid={r['pmid']} chunk={r['chunk_id']}"
        )
        print(f"       {r['text'][:120]}...")
