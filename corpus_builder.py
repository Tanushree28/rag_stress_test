"""
S1 -- Corpus Builder
Load BioASQ training data, fetch PubMed abstracts via NCBI EFetch,
chunk text, embed with MedCPT, and build FAISS index.
"""

import json
import os
import time
import logging
from pathlib import Path

import faiss
import numpy as np
import requests
import torch
from dotenv import load_dotenv
from lxml import etree
from tqdm import tqdm
from transformers import AutoModel, AutoTokenizer

load_dotenv()
logger = logging.getLogger(__name__)

NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
EFETCH_BATCH = 200  # PMIDs per request (NCBI limit)
RATE_LIMIT = 0.11 if NCBI_API_KEY else 0.34  # seconds between requests

DATA_DIR = Path("data")
CACHE_PATH = Path("13/outputs/pubmed_cache_v2.json")
INDEX_PATH = DATA_DIR / "faiss.index"
CHUNKS_PATH = DATA_DIR / "chunks.json"
MEDCPT_DOC_MODEL = "ncbi/MedCPT-Article-Encoder"


# ---------------------------------------------------------------------------
# S1.1 -- Load BioASQ
# ---------------------------------------------------------------------------

def load_bioasq(
    path: str = "13/BioASQ-training13b/training13b.json",
    max_questions: int | None = None,
) -> list[dict]:
    """Load BioASQ training JSON and return list of question dicts.

    Each dict has keys: id, type, body, documents (PMIDs), snippets,
    ideal_answer, exact_answer.
    """
    with open(path) as f:
        raw = json.load(f)["questions"]

    questions = []
    for q in raw:
        pmids = [url.rstrip("/").split("/")[-1] for url in q.get("documents", [])]
        questions.append({
            "id": q["id"],
            "type": q["type"],
            "body": q["body"],
            "pmids": pmids,
            "snippets": q.get("snippets", []),
            "ideal_answer": q.get("ideal_answer", ""),
            "exact_answer": q.get("exact_answer", None),
        })

    if max_questions:
        questions = questions[:max_questions]

    logger.info("Loaded %d BioASQ questions", len(questions))
    return questions


# ---------------------------------------------------------------------------
# S1.2 -- Fetch PubMed abstracts
# ---------------------------------------------------------------------------

def _parse_efetch_xml(xml_bytes: bytes) -> dict[str, dict]:
    """Parse EFetch XML and return {pmid: {title, abstract, ...}}."""
    root = etree.fromstring(xml_bytes)
    results = {}
    for article in root.findall(".//PubmedArticle"):
        pmid_el = article.find(".//PMID")
        if pmid_el is None:
            continue
        pmid = pmid_el.text

        title_el = article.find(".//ArticleTitle")
        title = title_el.text if title_el is not None and title_el.text else ""

        abstract_parts = []
        for at in article.findall(".//AbstractText"):
            label = at.get("Label", "")
            text = "".join(at.itertext()).strip()
            if label:
                text = f"{label}: {text}"
            abstract_parts.append(text)
        abstract = " ".join(abstract_parts)

        if not abstract:
            continue

        results[pmid] = {
            "pmid": pmid,
            "title": title,
            "abstract": abstract,
            "text": f"{title} {abstract}".strip(),
        }
    return results


def fetch_pubmed_abstracts(
    pmids: list[str],
    cache_path: str | Path = CACHE_PATH,
) -> dict[str, dict]:
    """Fetch abstracts from PubMed via EFetch API, with local JSON cache.

    Returns dict mapping pmid -> {pmid, title, abstract, text}.
    """
    cache_path = Path(cache_path)
    cache: dict[str, dict] = {}
    if cache_path.exists():
        with open(cache_path) as f:
            cache = json.load(f)
        logger.info("Loaded %d cached abstracts", len(cache))

    missing = [p for p in pmids if p not in cache]
    if not missing:
        logger.info("All %d PMIDs found in cache", len(pmids))
        return {p: cache[p] for p in pmids if p in cache}

    logger.info("Fetching %d missing abstracts from PubMed", len(missing))
    fetched = 0
    for i in tqdm(range(0, len(missing), EFETCH_BATCH), desc="EFetch"):
        batch = missing[i : i + EFETCH_BATCH]
        params = {
            "db": "pubmed",
            "id": ",".join(batch),
            "rettype": "xml",
            "retmode": "xml",
        }
        if NCBI_API_KEY:
            params["api_key"] = NCBI_API_KEY

        for attempt in range(3):
            try:
                resp = requests.get(EFETCH_URL, params=params, timeout=30)
                resp.raise_for_status()
                break
            except requests.RequestException as e:
                if attempt == 2:
                    logger.warning("Failed batch starting at %s: %s", batch[0], e)
                    break
                time.sleep(2 ** attempt)

        if resp.status_code == 200:
            parsed = _parse_efetch_xml(resp.content)
            cache.update(parsed)
            fetched += len(parsed)

        time.sleep(RATE_LIMIT)

    # Save updated cache
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cache_path, "w") as f:
        json.dump(cache, f)
    logger.info("Fetched %d new abstracts, cache now has %d", fetched, len(cache))

    return {p: cache[p] for p in pmids if p in cache}


# ---------------------------------------------------------------------------
# S1.3 -- Chunk abstracts
# ---------------------------------------------------------------------------

def chunk_abstracts(
    abstracts: dict[str, dict],
    max_tokens: int = 256,
    overlap_tokens: int = 64,
) -> list[dict]:
    """Split abstracts into overlapping word-level chunks.

    Returns list of {chunk_id, pmid, title, text, chunk_idx}.
    """
    chunks = []
    for pmid, doc in abstracts.items():
        words = doc["text"].split()
        if len(words) <= max_tokens:
            chunks.append({
                "chunk_id": f"{pmid}_0",
                "pmid": pmid,
                "title": doc.get("title", ""),
                "text": doc["text"],
                "chunk_idx": 0,
            })
        else:
            step = max_tokens - overlap_tokens
            idx = 0
            for start in range(0, len(words), step):
                chunk_words = words[start : start + max_tokens]
                chunks.append({
                    "chunk_id": f"{pmid}_{idx}",
                    "pmid": pmid,
                    "title": doc.get("title", ""),
                    "text": " ".join(chunk_words),
                    "chunk_idx": idx,
                })
                idx += 1
                if start + max_tokens >= len(words):
                    break

    logger.info("Created %d chunks from %d abstracts", len(chunks), len(abstracts))
    return chunks


# ---------------------------------------------------------------------------
# S1.4 -- Embed with MedCPT and build FAISS index
# ---------------------------------------------------------------------------

def _load_medcpt_doc_encoder():
    """Load MedCPT article encoder."""
    tokenizer = AutoTokenizer.from_pretrained(MEDCPT_DOC_MODEL)
    model = AutoModel.from_pretrained(MEDCPT_DOC_MODEL)
    model.eval()
    return tokenizer, model


def embed_and_index(
    chunks: list[dict],
    batch_size: int = 32,
    index_path: Path = INDEX_PATH,
    chunks_path: Path = CHUNKS_PATH,
) -> faiss.Index:
    """Embed chunks with MedCPT and build FAISS index.

    Saves index to index_path and chunk metadata to chunks_path.
    Returns the FAISS index.
    """
    tokenizer, model = _load_medcpt_doc_encoder()
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(device)

    all_embeddings = []
    texts = [c["text"] for c in chunks]

    logger.info("Embedding %d chunks with MedCPT (device=%s)", len(chunks), device)
    for i in tqdm(range(0, len(texts), batch_size), desc="Embedding"):
        batch_texts = texts[i : i + batch_size]
        encoded = tokenizer(
            batch_texts,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(device)
        with torch.no_grad():
            outputs = model(**encoded)
            embeddings = outputs.last_hidden_state[:, 0, :]  # CLS token
        all_embeddings.append(embeddings.cpu().numpy())

    embeddings_matrix = np.vstack(all_embeddings).astype("float32")
    faiss.normalize_L2(embeddings_matrix)

    dim = embeddings_matrix.shape[1]
    index = faiss.IndexFlatIP(dim)  # inner product on normalized = cosine
    index.add(embeddings_matrix)

    index_path.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(index_path))

    with open(chunks_path, "w") as f:
        json.dump(chunks, f)

    logger.info(
        "FAISS index built: %d vectors, dim=%d, saved to %s",
        index.ntotal, dim, index_path,
    )
    return index


# ---------------------------------------------------------------------------
# Main -- build corpus from scratch or subset
# ---------------------------------------------------------------------------

def build_corpus(max_questions: int | None = 400):
    """End-to-end: load BioASQ -> fetch abstracts -> chunk -> embed -> index."""
    questions = load_bioasq(max_questions=max_questions)

    # Collect unique PMIDs
    all_pmids = list({pmid for q in questions for pmid in q["pmids"]})
    logger.info("Unique PMIDs to fetch: %d", len(all_pmids))

    abstracts = fetch_pubmed_abstracts(all_pmids)
    logger.info("Retrieved %d / %d abstracts", len(abstracts), len(all_pmids))

    chunks = chunk_abstracts(abstracts)
    index = embed_and_index(chunks)

    # Save question subset for downstream stages
    questions_path = DATA_DIR / "questions.json"
    with open(questions_path, "w") as f:
        json.dump(questions, f)
    logger.info("Saved %d questions to %s", len(questions), questions_path)

    return questions, chunks, index


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    build_corpus(max_questions=400)
