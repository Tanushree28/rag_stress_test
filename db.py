"""
Shared SQLite storage layer for corpus data (abstracts, chunks, caches).

Database: data/corpus.db (separate from data/experiments.db).
All modules (corpus_builder, retriever, perturbation_engine, api) import from here.
"""

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path("data/corpus.db")

_local = threading.local()


def get_connection() -> sqlite3.Connection:
    """Return a thread-local SQLite connection with WAL mode."""
    if not hasattr(_local, "conn") or _local.conn is None:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.row_factory = sqlite3.Row
        _local.conn = conn
    return _local.conn


def init_db() -> None:
    """Create tables if they don't exist. Idempotent."""
    conn = get_connection()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS abstracts (
            pmid TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            abstract TEXT NOT NULL,
            text TEXT NOT NULL,
            source TEXT NOT NULL,
            fetched_at TEXT NOT NULL,
            mesh_terms TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_abstracts_source ON abstracts(source);

        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY,
            chunk_id TEXT UNIQUE NOT NULL,
            pmid TEXT NOT NULL,
            title TEXT NOT NULL,
            text TEXT NOT NULL,
            chunk_idx INTEGER NOT NULL,
            embedded INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_chunks_pmid ON chunks(pmid);
        CREATE INDEX IF NOT EXISTS idx_chunks_embedded ON chunks(embedded);

        CREATE TABLE IF NOT EXISTS negation_cache (
            original_hash TEXT PRIMARY KEY,
            negated_text TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS build_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    """)
    # FTS5 virtual table for keyword search (if not exists)
    try:
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts
            USING fts5(text, content=chunks, content_rowid=id);
        """)
    except Exception:
        pass  # FTS5 might already exist or not be available
    conn.commit()


# ---------------------------------------------------------------------------
# Abstracts
# ---------------------------------------------------------------------------

def upsert_abstract(
    pmid: str,
    title: str,
    abstract: str,
    text: str,
    source: str,
    mesh_terms: list[str] | None = None,
) -> None:
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO abstracts (pmid, title, abstract, text, source, fetched_at, mesh_terms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (pmid, title, abstract, text, source,
         datetime.now(timezone.utc).isoformat(),
         json.dumps(mesh_terms) if mesh_terms else None),
    )
    conn.commit()


def upsert_abstracts_batch(records: list[dict]) -> None:
    """Batch insert/replace abstracts. Each dict needs: pmid, title, abstract, text, source.
    Optional: mesh_terms (list[str])."""
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        (r["pmid"], r["title"], r["abstract"], r["text"], r["source"], now,
         json.dumps(r["mesh_terms"]) if r.get("mesh_terms") else None)
        for r in records
    ]
    conn.executemany(
        "INSERT OR REPLACE INTO abstracts (pmid, title, abstract, text, source, fetched_at, mesh_terms) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    conn.commit()


def get_abstract(pmid: str) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM abstracts WHERE pmid = ?", (pmid,)).fetchone()
    return dict(row) if row else None


def get_cached_pmids() -> set[str]:
    conn = get_connection()
    rows = conn.execute("SELECT pmid FROM abstracts").fetchall()
    return {r["pmid"] for r in rows}


def get_abstracts_by_pmids(pmids: list[str]) -> dict[str, dict]:
    """Return {pmid: row_dict} for the requested PMIDs."""
    conn = get_connection()
    if not pmids:
        return {}
    result = {}
    batch_size = 900  # Stay under SQLite's 999 variable limit
    for i in range(0, len(pmids), batch_size):
        batch = pmids[i : i + batch_size]
        placeholders = ",".join("?" * len(batch))
        rows = conn.execute(
            f"SELECT * FROM abstracts WHERE pmid IN ({placeholders})", batch
        ).fetchall()
        for r in rows:
            result[r["pmid"]] = dict(r)
    return result


def get_mesh_terms_for_pmids(pmids: list[str]) -> dict[str, list[str]]:
    """Return {pmid: [mesh_term, ...]} for PMIDs that have mesh_terms."""
    conn = get_connection()
    if not pmids:
        return {}
    rows = []
    batch_size = 900
    for i in range(0, len(pmids), batch_size):
        batch = pmids[i : i + batch_size]
        placeholders = ",".join("?" * len(batch))
        rows.extend(conn.execute(
            f"SELECT pmid, mesh_terms FROM abstracts WHERE pmid IN ({placeholders}) AND mesh_terms IS NOT NULL",
            batch,
        ).fetchall())
    result = {}
    for r in rows:
        terms = json.loads(r["mesh_terms"])
        if terms:
            result[r["pmid"]] = terms
    return result


def get_unchunked_pmids() -> list[str]:
    """Return PMIDs in abstracts but not yet in chunks."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT a.pmid FROM abstracts a "
        "LEFT JOIN chunks c ON a.pmid = c.pmid "
        "WHERE c.pmid IS NULL"
    ).fetchall()
    return [r["pmid"] for r in rows]


# ---------------------------------------------------------------------------
# Chunks
# ---------------------------------------------------------------------------

def get_max_chunk_id() -> int:
    """Return the current maximum chunk id, or -1 if no chunks exist."""
    conn = get_connection()
    row = conn.execute("SELECT MAX(id) as max_id FROM chunks").fetchone()
    val = row["max_id"]
    return val if val is not None else -1


def insert_chunks(chunks: list[dict]) -> None:
    """Insert chunks with explicit id values. Each dict: id, chunk_id, pmid, title, text, chunk_idx."""
    conn = get_connection()
    conn.executemany(
        "INSERT OR IGNORE INTO chunks (id, chunk_id, pmid, title, text, chunk_idx, embedded) "
        "VALUES (?, ?, ?, ?, ?, ?, 0)",
        [(c["id"], c["chunk_id"], c["pmid"], c["title"], c["text"], c["chunk_idx"]) for c in chunks],
    )
    conn.commit()


def get_chunk_by_id(faiss_idx: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM chunks WHERE id = ?", (faiss_idx,)).fetchone()
    return dict(row) if row else None


def get_chunks_by_ids(faiss_idxs: list[int]) -> list[dict]:
    """Batch lookup chunks by FAISS indices. Returns list of dicts."""
    conn = get_connection()
    if not faiss_idxs:
        return []
    placeholders = ",".join("?" * len(faiss_idxs))
    rows = conn.execute(
        f"SELECT * FROM chunks WHERE id IN ({placeholders})", faiss_idxs
    ).fetchall()
    return [dict(r) for r in rows]


def get_all_chunks() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM chunks ORDER BY id").fetchall()
    return [dict(r) for r in rows]


def get_unembedded_chunks() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM chunks WHERE embedded = 0 ORDER BY id"
    ).fetchall()
    return [dict(r) for r in rows]


def mark_chunks_embedded(chunk_ids: list[int]) -> None:
    conn = get_connection()
    if not chunk_ids:
        return
    batch_size = 900
    for i in range(0, len(chunk_ids), batch_size):
        batch = chunk_ids[i : i + batch_size]
        placeholders = ",".join("?" * len(batch))
        conn.execute(
            f"UPDATE chunks SET embedded = 1 WHERE id IN ({placeholders})", batch
        )
    conn.commit()


def get_total_chunks() -> int:
    conn = get_connection()
    row = conn.execute("SELECT COUNT(*) as cnt FROM chunks").fetchone()
    return row["cnt"]


def get_random_chunks_excluding(exclude_pmids: set[str], n: int) -> list[dict]:
    """Get n random chunks not from exclude_pmids. Used by perturbation engine."""
    conn = get_connection()
    if not exclude_pmids:
        rows = conn.execute(
            "SELECT * FROM chunks ORDER BY RANDOM() LIMIT ?", (n,)
        ).fetchall()
    else:
        # Use a temp table for large exclusion lists to avoid variable limit
        exclude_list = list(exclude_pmids)
        if len(exclude_list) <= 900:
            placeholders = ",".join("?" * len(exclude_list))
            rows = conn.execute(
                f"SELECT * FROM chunks WHERE pmid NOT IN ({placeholders}) ORDER BY RANDOM() LIMIT ?",
                exclude_list + [n],
            ).fetchall()
        else:
            conn.execute("CREATE TEMP TABLE IF NOT EXISTS _exclude_pmids (pmid TEXT PRIMARY KEY)")
            conn.execute("DELETE FROM _exclude_pmids")
            batch_size = 900
            for i in range(0, len(exclude_list), batch_size):
                batch = exclude_list[i : i + batch_size]
                conn.executemany("INSERT OR IGNORE INTO _exclude_pmids VALUES (?)", [(p,) for p in batch])
            rows = conn.execute(
                "SELECT * FROM chunks WHERE pmid NOT IN (SELECT pmid FROM _exclude_pmids) ORDER BY RANDOM() LIMIT ?",
                (n,),
            ).fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Negation cache
# ---------------------------------------------------------------------------

def get_negation(original_hash: str) -> str | None:
    conn = get_connection()
    row = conn.execute(
        "SELECT negated_text FROM negation_cache WHERE original_hash = ?",
        (original_hash,),
    ).fetchone()
    return row["negated_text"] if row else None


def save_negation(original_hash: str, negated_text: str) -> None:
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO negation_cache (original_hash, negated_text, created_at) "
        "VALUES (?, ?, ?)",
        (original_hash, negated_text, datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Build metadata
# ---------------------------------------------------------------------------

def get_meta(key: str) -> str | None:
    conn = get_connection()
    row = conn.execute("SELECT value FROM build_meta WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else None


def set_meta(key: str, value: str) -> None:
    conn = get_connection()
    conn.execute(
        "INSERT OR REPLACE INTO build_meta (key, value) VALUES (?, ?)",
        (key, value),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------

def corpus_stats() -> dict:
    """Return summary statistics about the corpus."""
    conn = get_connection()
    abstract_counts = conn.execute(
        "SELECT source, COUNT(*) as cnt FROM abstracts GROUP BY source"
    ).fetchall()
    total_abstracts = conn.execute("SELECT COUNT(*) as cnt FROM abstracts").fetchone()["cnt"]
    total_chunks = get_total_chunks()
    embedded_chunks = conn.execute(
        "SELECT COUNT(*) as cnt FROM chunks WHERE embedded = 1"
    ).fetchone()["cnt"]
    return {
        "abstracts_by_source": {r["source"]: r["cnt"] for r in abstract_counts},
        "total_abstracts": total_abstracts,
        "total_chunks": total_chunks,
        "embedded_chunks": embedded_chunks,
    }


# ---------------------------------------------------------------------------
# Full-text keyword search (FTS5)
# ---------------------------------------------------------------------------

def rebuild_fts() -> None:
    """Rebuild the FTS5 index from scratch. Call after loading new chunks."""
    conn = get_connection()
    try:
        conn.execute("INSERT INTO chunks_fts(chunks_fts) VALUES('rebuild')")
        conn.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning("FTS rebuild failed: %s", e)


def keyword_search(query: str, limit: int = 50) -> list[dict]:
    """Search chunks using SQLite FTS5 (BM25 ranking).

    Returns list of dicts with chunk fields + 'bm25_score'.
    Falls back to LIKE search if FTS is not available.
    """
    conn = get_connection()

    # Split into individual keywords for OR search
    words = query.split()

    try:
        # FTS5 with OR semantics so any keyword match counts
        fts_query = " OR ".join(words)
        rows = conn.execute(
            "SELECT c.*, rank AS bm25_score "
            "FROM chunks_fts fts "
            "JOIN chunks c ON c.id = fts.rowid "
            "WHERE chunks_fts MATCH ? "
            "ORDER BY rank "
            "LIMIT ?",
            (fts_query, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    except Exception:
        # Fallback: LIKE search for each keyword, merge results
        if not words:
            return []
        words.sort(key=len, reverse=True)
        seen_ids = set()
        results = []
        for keyword in words[:3]:  # Top 3 longest keywords
            if len(keyword) < 3:
                continue
            rows = conn.execute(
                "SELECT *, 0 as bm25_score FROM chunks WHERE LOWER(text) LIKE ? LIMIT ?",
                (f"%{keyword.lower()}%", limit),
            ).fetchall()
            for r in rows:
                if r["id"] not in seen_ids:
                    seen_ids.add(r["id"])
                    results.append(dict(r))
        return results[:limit]
