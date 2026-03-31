"""
S1 -- Corpus Builder
Load BioASQ training data, fetch PubMed abstracts via NCBI EFetch,
expand corpus via ESearch keyword + random sampling,
chunk text, embed with MedCPT, and build FAISS index.

Storage: SQLite via db.py (replaces JSON cache).
"""

import json
import os
import random
import time
import logging
from collections import Counter
from pathlib import Path

import faiss
import numpy as np
import requests
import torch
from dotenv import load_dotenv
from lxml import etree
from tqdm import tqdm
from transformers import AutoModel, AutoTokenizer

import db

load_dotenv()
logger = logging.getLogger(__name__)

NCBI_API_KEY = os.getenv("NCBI_API_KEY", "")
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_BATCH = 200  # PMIDs per request (NCBI limit)
RATE_LIMIT = 0.11 if NCBI_API_KEY else 0.34  # seconds between requests

DATA_DIR = Path("data")
CACHE_PATH = Path("13/outputs/pubmed_cache_v2.json")
INDEX_PATH = DATA_DIR / "faiss.index"
CHUNKS_PATH = DATA_DIR / "chunks.json"  # kept for backward compat during migration
MEDCPT_DOC_MODEL = "ncbi/MedCPT-Article-Encoder"


# ---------------------------------------------------------------------------
# S1.1 -- Load BioASQ
# ---------------------------------------------------------------------------

def load_bioasq(
    path: str = "13/BioASQ-training13b/training13b.json",
    max_questions: int | None = None,
) -> list[dict]:
    """Load BioASQ training JSON and return list of question dicts."""
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
# S1.2 -- Migrate existing JSON cache (one-time)
# ---------------------------------------------------------------------------

def migrate_json_cache_to_sqlite() -> int:
    """Migrate pubmed_cache_v2.json into SQLite. Idempotent."""
    if db.get_meta("json_migration_done") == "true":
        logger.info("JSON cache already migrated")
        return 0

    if not CACHE_PATH.exists():
        logger.info("No JSON cache file found at %s, skipping migration", CACHE_PATH)
        db.set_meta("json_migration_done", "true")
        return 0

    with open(CACHE_PATH) as f:
        cache = json.load(f)

    records = []
    for pmid, entry in cache.items():
        title = entry.get("title", "")
        abstract = entry.get("abstract", "")
        text = entry.get("text", f"{title} {abstract}".strip())
        if not abstract:
            continue
        records.append({
            "pmid": pmid,
            "title": title,
            "abstract": abstract,
            "text": text,
            "source": "bioasq",
        })

    db.upsert_abstracts_batch(records)
    db.set_meta("json_migration_done", "true")
    logger.info("Migrated %d abstracts from JSON cache to SQLite", len(records))
    return len(records)


# ---------------------------------------------------------------------------
# S1.3 -- Fetch PubMed abstracts (SQLite-backed)
# ---------------------------------------------------------------------------

def _parse_efetch_xml(xml_bytes: bytes) -> dict[str, dict]:
    """Parse EFetch XML and return {pmid: {title, abstract, text, mesh_terms}}."""
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

        # Extract MeSH terms
        mesh_terms = []
        for mh in article.findall(".//MeshHeading/DescriptorName"):
            if mh.text:
                mesh_terms.append(mh.text)

        results[pmid] = {
            "pmid": pmid,
            "title": title,
            "abstract": abstract,
            "text": f"{title} {abstract}".strip(),
            "mesh_terms": mesh_terms if mesh_terms else None,
        }
    return results


def _efetch_batch(batch_pmids: list[str]) -> dict[str, dict]:
    """Fetch a single batch of PMIDs via EFetch with retries."""
    params = {
        "db": "pubmed",
        "id": ",".join(batch_pmids),
        "rettype": "xml",
        "retmode": "xml",
    }
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY

    for attempt in range(3):
        try:
            resp = requests.get(EFETCH_URL, params=params, timeout=30)
            resp.raise_for_status()
            return _parse_efetch_xml(resp.content)
        except requests.RequestException as e:
            if attempt == 2:
                logger.warning("Failed batch starting at %s: %s", batch_pmids[0], e)
                return {}
            time.sleep(2 ** attempt)
    return {}


def fetch_pubmed_abstracts(
    pmids: list[str],
    source: str = "bioasq",
) -> dict[str, dict]:
    """Fetch abstracts from PubMed via EFetch API, caching in SQLite.

    Returns dict mapping pmid -> {pmid, title, abstract, text}.
    """
    cached = db.get_cached_pmids()
    missing = [p for p in pmids if p not in cached]

    if not missing:
        logger.info("All %d PMIDs found in cache", len(pmids))
        return db.get_abstracts_by_pmids(pmids)

    logger.info("Fetching %d missing abstracts from PubMed", len(missing))
    fetched = 0
    for i in tqdm(range(0, len(missing), EFETCH_BATCH), desc="EFetch"):
        batch = missing[i : i + EFETCH_BATCH]
        parsed = _efetch_batch(batch)
        if parsed:
            records = [{**v, "source": source} for v in parsed.values()]
            db.upsert_abstracts_batch(records)
            fetched += len(records)
        time.sleep(RATE_LIMIT)

    logger.info("Fetched %d new abstracts", fetched)
    return db.get_abstracts_by_pmids(pmids)


# ---------------------------------------------------------------------------
# S1.4 -- PubMed keyword expansion via ESearch
# ---------------------------------------------------------------------------

def _esearch_pmids(query: str, max_results: int = 20) -> list[str]:
    """Search PubMed via ESearch and return list of PMIDs."""
    params = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "retmode": "json",
    }
    if NCBI_API_KEY:
        params["api_key"] = NCBI_API_KEY

    try:
        resp = requests.get(ESEARCH_URL, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        return data.get("esearchresult", {}).get("idlist", [])
    except requests.RequestException as e:
        logger.warning("ESearch failed for query '%s': %s", query[:60], e)
        return []


def expand_corpus_keywords(
    questions: list[dict],
    max_per_question: int = 20,
) -> int:
    """For each BioASQ question, use MeSH terms from gold PMIDs to find
    related-but-not-gold articles via ESearch. Returns count of new PMIDs."""
    cached = db.get_cached_pmids()
    all_new_pmids: set[str] = set()

    logger.info("Running keyword expansion for %d questions", len(questions))
    for q in tqdm(questions, desc="Keyword expansion"):
        gold_pmids = set(q["pmids"])
        mesh_by_pmid = db.get_mesh_terms_for_pmids(q["pmids"])

        # Collect MeSH terms across gold articles, pick top 2-3
        term_counts: Counter = Counter()
        for terms in mesh_by_pmid.values():
            term_counts.update(terms)

        if len(term_counts) < 2:
            # Fallback: use question body keywords
            query = q["body"]
        else:
            top_terms = [t for t, _ in term_counts.most_common(3)]
            query = " AND ".join(f'"{t}"[MeSH]' for t in top_terms)

        new_pmids = _esearch_pmids(query, max_results=max_per_question)
        new_pmids = [p for p in new_pmids if p not in gold_pmids and p not in cached]
        all_new_pmids.update(new_pmids)

        time.sleep(RATE_LIMIT)

    if all_new_pmids:
        logger.info("Keyword expansion found %d new unique PMIDs, fetching...", len(all_new_pmids))
        fetch_pubmed_abstracts(list(all_new_pmids), source="keyword_expansion")

    return len(all_new_pmids)


# ---------------------------------------------------------------------------
# S1.5 -- Random PubMed background sample
# ---------------------------------------------------------------------------

def fetch_random_pubmed_sample(target_count: int = 30000) -> int:
    """Fetch random biomedical abstracts from PubMed across date ranges.
    Returns count of new PMIDs added."""
    cached = db.get_cached_pmids()
    collected: set[str] = set()

    # Sample across monthly date ranges 2020-2025
    months = []
    for year in range(2020, 2026):
        for month in range(1, 13):
            months.append(f"{year}/{month:02d}")

    random.shuffle(months)
    logger.info("Sampling random PubMed abstracts (target=%d)", target_count)

    for month in tqdm(months, desc="Random sampling"):
        if len(collected) >= target_count:
            break

        # First get total count for this month
        params = {
            "db": "pubmed",
            "term": f'("{month}"[PDAT])',
            "retmax": 0,
            "retmode": "json",
        }
        if NCBI_API_KEY:
            params["api_key"] = NCBI_API_KEY

        try:
            resp = requests.get(ESEARCH_URL, params=params, timeout=15)
            resp.raise_for_status()
            total = int(resp.json()["esearchresult"]["count"])
        except (requests.RequestException, KeyError, ValueError):
            continue

        time.sleep(RATE_LIMIT)

        if total < 100:
            continue

        # Fetch PMIDs at random offset
        batch_size = min(500, target_count - len(collected))
        offset = random.randint(0, max(0, total - batch_size))
        params.update({"retmax": batch_size, "retstart": offset})

        try:
            resp = requests.get(ESEARCH_URL, params=params, timeout=15)
            resp.raise_for_status()
            pmids = resp.json()["esearchresult"]["idlist"]
            new_pmids = [p for p in pmids if p not in cached and p not in collected]
            collected.update(new_pmids)
        except (requests.RequestException, KeyError):
            pass

        time.sleep(RATE_LIMIT)

    if collected:
        logger.info("Random sampling found %d new PMIDs, fetching...", len(collected))
        fetch_pubmed_abstracts(list(collected), source="random_sample")

    return len(collected)


# ---------------------------------------------------------------------------
# S1.6 -- Chunk abstracts (SQLite-backed)
# ---------------------------------------------------------------------------

def chunk_abstracts_for_doc(
    pmid: str, doc: dict, max_tokens: int = 256, overlap_tokens: int = 64,
) -> list[dict]:
    """Chunk a single abstract. Returns list of chunk dicts (without id)."""
    words = doc["text"].split()
    title = doc.get("title", "")
    chunks = []

    if len(words) <= max_tokens:
        chunks.append({
            "chunk_id": f"{pmid}_0",
            "pmid": pmid,
            "title": title,
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
                "title": title,
                "text": " ".join(chunk_words),
                "chunk_idx": idx,
            })
            idx += 1
            if start + max_tokens >= len(words):
                break
    return chunks


def chunk_new_abstracts(
    max_tokens: int = 256, overlap_tokens: int = 64,
) -> int:
    """Chunk abstracts that aren't yet in the chunks table. Returns count."""
    unchunked_pmids = db.get_unchunked_pmids()
    if not unchunked_pmids:
        logger.info("No new abstracts to chunk")
        return 0

    logger.info("Chunking %d new abstracts", len(unchunked_pmids))
    next_id = db.get_max_chunk_id() + 1
    all_chunks = []

    for pmid in tqdm(unchunked_pmids, desc="Chunking"):
        doc = db.get_abstract(pmid)
        if not doc:
            continue
        new_chunks = chunk_abstracts_for_doc(pmid, doc, max_tokens, overlap_tokens)
        for c in new_chunks:
            c["id"] = next_id
            next_id += 1
        all_chunks.extend(new_chunks)

    if all_chunks:
        db.insert_chunks(all_chunks)
        logger.info("Created %d new chunks (total: %d)", len(all_chunks), db.get_total_chunks())

    return len(all_chunks)


# ---------------------------------------------------------------------------
# S1.7 -- Embed with MedCPT and build FAISS index
# ---------------------------------------------------------------------------

def _load_medcpt_doc_encoder():
    """Load MedCPT article encoder."""
    tokenizer = AutoTokenizer.from_pretrained(MEDCPT_DOC_MODEL)
    model = AutoModel.from_pretrained(MEDCPT_DOC_MODEL)
    model.eval()
    return tokenizer, model


def _embed_chunks(chunks: list[dict], batch_size: int = 32) -> np.ndarray:
    """Embed a list of chunks with MedCPT. Returns normalized float32 matrix."""
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

    matrix = np.vstack(all_embeddings).astype("float32")
    faiss.normalize_L2(matrix)
    return matrix


def _build_faiss_index(
    embeddings: np.ndarray,
    index_type: str = "hnsw",
) -> faiss.Index:
    """Create a FAISS index from embeddings."""
    dim = embeddings.shape[1]
    if index_type == "hnsw":
        index = faiss.IndexHNSWFlat(dim, 32, faiss.METRIC_INNER_PRODUCT)
        index.hnsw.efConstruction = 200
        index.hnsw.efSearch = 128
    else:
        index = faiss.IndexFlatIP(dim)
    index.add(embeddings)
    return index


def full_embed_and_index(
    index_type: str = "hnsw",
    batch_size: int = 32,
) -> faiss.Index:
    """Full rebuild: embed ALL chunks and create new FAISS index."""
    chunks = db.get_all_chunks()
    if not chunks:
        logger.warning("No chunks to embed")
        return None

    embeddings = _embed_chunks(chunks, batch_size)
    index = _build_faiss_index(embeddings, index_type)

    INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
    faiss.write_index(index, str(INDEX_PATH))

    chunk_ids = [c["id"] for c in chunks]
    db.mark_chunks_embedded(chunk_ids)

    logger.info(
        "FAISS index built: %d vectors, type=%s, saved to %s",
        index.ntotal, index_type, INDEX_PATH,
    )
    return index


def incremental_embed_and_index(
    index_type: str = "hnsw",
    batch_size: int = 32,
) -> faiss.Index:
    """Embed only new (unembedded) chunks and add to existing index."""
    new_chunks = db.get_unembedded_chunks()
    if not new_chunks:
        logger.info("No new chunks to embed")
        if INDEX_PATH.exists():
            return faiss.read_index(str(INDEX_PATH))
        return None

    if INDEX_PATH.exists():
        index = faiss.read_index(str(INDEX_PATH))
        logger.info("Loaded existing index with %d vectors", index.ntotal)
    else:
        logger.info("No existing index, building from scratch")
        return full_embed_and_index(index_type, batch_size)

    embeddings = _embed_chunks(new_chunks, batch_size)
    index.add(embeddings)

    faiss.write_index(index, str(INDEX_PATH))
    db.mark_chunks_embedded([c["id"] for c in new_chunks])

    logger.info(
        "Incremental update: added %d vectors, total now %d",
        len(new_chunks), index.ntotal,
    )
    return index


# Legacy wrapper for backward compatibility
def embed_and_index(
    chunks: list[dict],
    batch_size: int = 32,
    index_path: Path = INDEX_PATH,
    chunks_path: Path = CHUNKS_PATH,
) -> faiss.Index:
    """Legacy embed_and_index that works with in-memory chunk lists.
    Used during transition period."""
    embeddings = _embed_chunks(chunks, batch_size)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)

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
# Main -- build corpus
# ---------------------------------------------------------------------------

def build_corpus(
    max_questions: int | None = None,
    expand_keywords: bool = True,
    random_sample_size: int = 30000,
    index_type: str = "hnsw",
    incremental: bool = True,
):
    """End-to-end corpus build:
    1. Init DB + migrate JSON cache
    2. Load BioASQ, fetch gold PMIDs
    3. Keyword expansion via ESearch
    4. Random PubMed background sample
    5. Chunk new abstracts
    6. Embed and index (incremental or full)
    7. Save questions
    """
    db.init_db()

    # Step 0: Migrate existing JSON cache
    migrate_json_cache_to_sqlite()

    # Step 1: Load BioASQ and fetch gold abstracts
    questions = load_bioasq(max_questions=max_questions)
    all_pmids = list({pmid for q in questions for pmid in q["pmids"]})
    logger.info("Unique gold PMIDs: %d", len(all_pmids))
    fetch_pubmed_abstracts(all_pmids, source="bioasq")

    # Step 2: Keyword expansion
    if expand_keywords:
        expand_corpus_keywords(questions, max_per_question=20)

    # Step 3: Random background sample
    if random_sample_size > 0:
        fetch_random_pubmed_sample(target_count=random_sample_size)

    # Step 4: Chunk all new abstracts
    chunk_new_abstracts()

    # Step 5: Embed and index
    if incremental and INDEX_PATH.exists():
        index = incremental_embed_and_index(index_type)
    else:
        index = full_embed_and_index(index_type)

    # Step 6: Save questions for downstream stages
    questions_path = DATA_DIR / "questions.json"
    with open(questions_path, "w") as f:
        json.dump(questions, f)
    logger.info("Saved %d questions to %s", len(questions), questions_path)

    stats = db.corpus_stats()
    logger.info("Corpus stats: %s", stats)
    return questions, index


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    build_corpus(max_questions=400, expand_keywords=True, random_sample_size=30000)
