"""
Test suite for RAG Stress-Test pipeline.

Tests pure logic in each module. External services (NCBI API, Ollama, MedCPT,
FAISS index on disk) are mocked so tests run offline and fast.

Run:  python -m pytest tests.py -v
"""

import json
import math
import os
import sqlite3
import tempfile
import textwrap
from pathlib import Path
from unittest import mock

import numpy as np
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _isolate_db(tmp_path, monkeypatch):
    """Point db.py at a temporary SQLite file for every test."""
    monkeypatch.setattr("db.DB_PATH", tmp_path / "test_corpus.db")
    # Reset thread-local connection so the new path takes effect
    import db as _db
    if hasattr(_db._local, "conn"):
        _db._local.conn = None
    _db.init_db()


@pytest.fixture
def sample_abstracts():
    return [
        {
            "pmid": "111",
            "title": "Alpha study",
            "abstract": "Alpha abstract text about heart disease.",
            "text": "Alpha study Alpha abstract text about heart disease.",
            "source": "bioasq",
        },
        {
            "pmid": "222",
            "title": "Beta study",
            "abstract": "Beta abstract text about diabetes.",
            "text": "Beta study Beta abstract text about diabetes.",
            "source": "bioasq",
        },
        {
            "pmid": "333",
            "title": "Gamma study",
            "abstract": "Gamma abstract text about cancer treatment.",
            "text": "Gamma study Gamma abstract text about cancer treatment.",
            "source": "random_sample",
        },
    ]


@pytest.fixture
def sample_chunks():
    return [
        {"id": 0, "chunk_id": "111_0", "pmid": "111", "title": "Alpha study",
         "text": "Alpha abstract text about heart disease.", "chunk_idx": 0},
        {"id": 1, "chunk_id": "222_0", "pmid": "222", "title": "Beta study",
         "text": "Beta abstract text about diabetes.", "chunk_idx": 0},
        {"id": 2, "chunk_id": "333_0", "pmid": "333", "title": "Gamma study",
         "text": "Gamma abstract text about cancer treatment.", "chunk_idx": 0},
    ]


@pytest.fixture
def sample_question():
    return {
        "id": "q1",
        "type": "yesno",
        "body": "Is aspirin effective for heart disease?",
        "pmids": ["111", "222"],
        "snippets": [
            {"document": "http://www.ncbi.nlm.nih.gov/pubmed/111", "text": "snippet1"},
            {"document": "http://www.ncbi.nlm.nih.gov/pubmed/222", "text": "snippet2"},
        ],
        "ideal_answer": "Yes, aspirin is effective.",
        "exact_answer": "yes",
    }


@pytest.fixture
def sample_passages():
    """Passage dicts as returned by the retriever."""
    return [
        {"id": 0, "chunk_id": "111_0", "pmid": "111", "title": "Alpha",
         "text": "Aspirin reduces heart attacks.", "chunk_idx": 0,
         "faiss_score": 0.95, "faiss_rank": 0, "rerank_score": 8.5, "rerank_rank": 0},
        {"id": 1, "chunk_id": "222_0", "pmid": "222", "title": "Beta",
         "text": "Aspirin thins the blood.", "chunk_idx": 0,
         "faiss_score": 0.88, "faiss_rank": 1, "rerank_score": 7.2, "rerank_rank": 1},
        {"id": 2, "chunk_id": "333_0", "pmid": "333", "title": "Gamma",
         "text": "Cancer treatment options include surgery.", "chunk_idx": 0,
         "faiss_score": 0.60, "faiss_rank": 2, "rerank_score": 2.1, "rerank_rank": 2},
        {"id": 3, "chunk_id": "444_0", "pmid": "444", "title": "Delta",
         "text": "Exercise is beneficial for health.", "chunk_idx": 0,
         "faiss_score": 0.55, "faiss_rank": 3, "rerank_score": 1.8, "rerank_rank": 3},
        {"id": 4, "chunk_id": "555_0", "pmid": "555", "title": "Epsilon",
         "text": "Nutrition plays a key role.", "chunk_idx": 0,
         "faiss_score": 0.50, "faiss_rank": 4, "rerank_score": 1.2, "rerank_rank": 4},
    ]


# ===================================================================
# db.py
# ===================================================================

class TestDB:
    def test_init_db_creates_tables(self):
        import db
        conn = db.get_connection()
        tables = {r[0] for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        assert {"abstracts", "chunks", "negation_cache", "build_meta"} <= tables

    def test_upsert_and_get_abstract(self, sample_abstracts):
        import db
        db.upsert_abstracts_batch(sample_abstracts)
        result = db.get_abstract("111")
        assert result is not None
        assert result["title"] == "Alpha study"
        assert result["source"] == "bioasq"

    def test_get_cached_pmids(self, sample_abstracts):
        import db
        db.upsert_abstracts_batch(sample_abstracts)
        cached = db.get_cached_pmids()
        assert cached == {"111", "222", "333"}

    def test_get_abstracts_by_pmids(self, sample_abstracts):
        import db
        db.upsert_abstracts_batch(sample_abstracts)
        result = db.get_abstracts_by_pmids(["111", "333"])
        assert len(result) == 2
        assert "111" in result
        assert "333" in result

    def test_get_abstracts_by_pmids_empty(self):
        import db
        assert db.get_abstracts_by_pmids([]) == {}

    def test_insert_and_get_chunks(self, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)
        assert db.get_total_chunks() == 3
        chunk = db.get_chunk_by_id(0)
        assert chunk["pmid"] == "111"

    def test_get_chunks_by_ids(self, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)
        results = db.get_chunks_by_ids([0, 2])
        pmids = {c["pmid"] for c in results}
        assert pmids == {"111", "333"}

    def test_mark_chunks_embedded(self, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)
        db.mark_chunks_embedded([0, 1])
        unembedded = db.get_unembedded_chunks()
        assert len(unembedded) == 1
        assert unembedded[0]["id"] == 2

    def test_get_unchunked_pmids(self, sample_abstracts, sample_chunks):
        import db
        db.upsert_abstracts_batch(sample_abstracts)
        # Only chunk pmid 111
        db.insert_chunks([sample_chunks[0]])
        unchunked = db.get_unchunked_pmids()
        assert set(unchunked) == {"222", "333"}

    def test_negation_cache(self):
        import db
        assert db.get_negation("abc123") is None
        db.save_negation("abc123", "negated text")
        assert db.get_negation("abc123") == "negated text"

    def test_build_meta(self):
        import db
        assert db.get_meta("some_key") is None
        db.set_meta("some_key", "some_value")
        assert db.get_meta("some_key") == "some_value"
        db.set_meta("some_key", "updated")
        assert db.get_meta("some_key") == "updated"

    def test_corpus_stats(self, sample_abstracts, sample_chunks):
        import db
        db.upsert_abstracts_batch(sample_abstracts)
        db.insert_chunks(sample_chunks)
        db.mark_chunks_embedded([0])
        stats = db.corpus_stats()
        assert stats["total_abstracts"] == 3
        assert stats["total_chunks"] == 3
        assert stats["embedded_chunks"] == 1
        assert stats["abstracts_by_source"]["bioasq"] == 2
        assert stats["abstracts_by_source"]["random_sample"] == 1

    def test_get_random_chunks_excluding(self, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)
        results = db.get_random_chunks_excluding({"111"}, 10)
        pmids = {c["pmid"] for c in results}
        assert "111" not in pmids
        assert len(results) == 2

    def test_mesh_terms(self):
        import db
        db.upsert_abstract(
            "999", "Test", "Abstract", "Test Abstract", "bioasq",
            mesh_terms=["Heart Diseases", "Aspirin"],
        )
        terms = db.get_mesh_terms_for_pmids(["999"])
        assert "999" in terms
        assert "Heart Diseases" in terms["999"]


# ===================================================================
# corpus_builder.py -- pure functions
# ===================================================================

class TestCorpusBuilder:

    def test_parse_efetch_xml(self):
        from corpus_builder import _parse_efetch_xml
        xml = textwrap.dedent("""\
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>12345</PMID>
              <Article>
                <ArticleTitle>Test Title</ArticleTitle>
                <Abstract>
                  <AbstractText>This is the abstract.</AbstractText>
                </Abstract>
              </Article>
              <MeshHeadingList>
                <MeshHeading><DescriptorName>Aspirin</DescriptorName></MeshHeading>
              </MeshHeadingList>
            </MedlineCitation>
          </PubmedArticle>
        </PubmedArticleSet>
        """).encode()
        result = _parse_efetch_xml(xml)
        assert "12345" in result
        assert result["12345"]["title"] == "Test Title"
        assert result["12345"]["abstract"] == "This is the abstract."
        assert "Aspirin" in result["12345"]["mesh_terms"]

    def test_parse_efetch_xml_labeled_abstract(self):
        from corpus_builder import _parse_efetch_xml
        xml = textwrap.dedent("""\
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>99999</PMID>
              <Article>
                <ArticleTitle>Labeled Abstract</ArticleTitle>
                <Abstract>
                  <AbstractText Label="BACKGROUND">Background text.</AbstractText>
                  <AbstractText Label="METHODS">Methods text.</AbstractText>
                </Abstract>
              </Article>
            </MedlineCitation>
          </PubmedArticle>
        </PubmedArticleSet>
        """).encode()
        result = _parse_efetch_xml(xml)
        assert "BACKGROUND: Background text." in result["99999"]["abstract"]
        assert "METHODS: Methods text." in result["99999"]["abstract"]

    def test_parse_efetch_xml_no_abstract_skipped(self):
        from corpus_builder import _parse_efetch_xml
        xml = textwrap.dedent("""\
        <PubmedArticleSet>
          <PubmedArticle>
            <MedlineCitation>
              <PMID>00000</PMID>
              <Article>
                <ArticleTitle>No Abstract</ArticleTitle>
              </Article>
            </MedlineCitation>
          </PubmedArticle>
        </PubmedArticleSet>
        """).encode()
        result = _parse_efetch_xml(xml)
        assert "00000" not in result

    def test_chunk_short_abstract(self):
        from corpus_builder import chunk_abstracts_for_doc
        doc = {"text": "Short text here.", "title": "Title"}
        chunks = chunk_abstracts_for_doc("111", doc, max_tokens=256)
        assert len(chunks) == 1
        assert chunks[0]["chunk_id"] == "111_0"
        assert chunks[0]["text"] == "Short text here."

    def test_chunk_long_abstract(self):
        from corpus_builder import chunk_abstracts_for_doc
        words = ["word"] * 600
        doc = {"text": " ".join(words), "title": "Long"}
        chunks = chunk_abstracts_for_doc("222", doc, max_tokens=256, overlap_tokens=64)
        assert len(chunks) > 1
        # Each chunk should have at most 256 words
        for c in chunks:
            assert len(c["text"].split()) <= 256
        # Chunks should overlap
        assert chunks[0]["chunk_idx"] == 0
        assert chunks[1]["chunk_idx"] == 1

    def test_load_bioasq(self, tmp_path):
        from corpus_builder import load_bioasq
        data = {
            "questions": [
                {
                    "id": "q1",
                    "type": "yesno",
                    "body": "Is X true?",
                    "documents": [
                        "http://www.ncbi.nlm.nih.gov/pubmed/111",
                        "http://www.ncbi.nlm.nih.gov/pubmed/222/",
                    ],
                    "snippets": [{"text": "snip"}],
                    "ideal_answer": "Yes",
                    "exact_answer": "yes",
                },
                {
                    "id": "q2",
                    "type": "factoid",
                    "body": "What is Y?",
                    "documents": [],
                    "snippets": [],
                    "ideal_answer": "Y is Z",
                },
            ]
        }
        path = tmp_path / "bioasq.json"
        path.write_text(json.dumps(data))
        questions = load_bioasq(str(path))
        assert len(questions) == 2
        assert questions[0]["pmids"] == ["111", "222"]
        assert questions[1]["pmids"] == []

    def test_load_bioasq_max_questions(self, tmp_path):
        from corpus_builder import load_bioasq
        data = {"questions": [
            {"id": f"q{i}", "type": "yesno", "body": f"Q{i}?", "documents": []}
            for i in range(10)
        ]}
        path = tmp_path / "bioasq.json"
        path.write_text(json.dumps(data))
        questions = load_bioasq(str(path), max_questions=3)
        assert len(questions) == 3


# ===================================================================
# generator.py
# ===================================================================

class TestGenerator:
    def test_build_prompt(self):
        from generator import build_prompt
        passages = [
            {"title": "Study A", "text": "Aspirin helps."},
            {"title": "", "text": "Exercise is good."},
        ]
        prompt = build_prompt("Is aspirin useful?", passages)
        assert "[1] Study A" in prompt
        assert "Aspirin helps." in prompt
        assert "[2]" in prompt
        assert "Exercise is good." in prompt
        assert "Question: Is aspirin useful?" in prompt

    def test_parse_citations(self):
        from generator import parse_citations
        assert parse_citations("According to [1] and [3], yes.") == [1, 3]
        assert parse_citations("No citations here.") == []
        assert parse_citations("[2] [2] [5]") == [2, 5]

    def test_generate_empty_passages(self):
        from generator import generate
        result = generate("Any question?", [])
        assert "cannot answer" in result["answer"].lower()
        assert result["citations"] == []
        assert result["passages_used"] == 0

    @mock.patch("generator.ollama")
    def test_generate_with_passages(self, mock_ollama):
        from generator import generate
        mock_ollama.chat.return_value = {
            "message": {"content": "Based on [1], aspirin works. [2] confirms this."}
        }
        passages = [
            {"title": "A", "text": "Aspirin reduces risk."},
            {"title": "B", "text": "Confirmed by trials."},
        ]
        result = generate("Does aspirin work?", passages)
        assert result["citations"] == [1, 2]
        assert result["passages_used"] == 2
        assert mock_ollama.chat.called

    @mock.patch("generator.ollama")
    def test_generate_handles_ollama_failure(self, mock_ollama):
        from generator import generate
        mock_ollama.chat.side_effect = Exception("connection refused")
        result = generate("question?", [{"title": "X", "text": "text"}])
        assert "failed" in result["answer"].lower()


# ===================================================================
# perturbation_engine.py
# ===================================================================

class TestPerturbationEngine:

    def test_inject_noise_replaces_correct_count(self, sample_passages, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)

        from perturbation_engine import inject_noise
        result = inject_noise(sample_passages, noise_ratio=0.5, near_miss=True)
        assert len(result) == len(sample_passages)
        noise_count = sum(1 for p in result if p.get("is_noise"))
        expected = max(1, math.floor(len(sample_passages) * 0.5))
        assert noise_count <= expected

    def test_inject_noise_does_not_mutate_original(self, sample_passages, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)

        from perturbation_engine import inject_noise
        original_texts = [p["text"] for p in sample_passages]
        inject_noise(sample_passages, noise_ratio=0.3)
        assert [p["text"] for p in sample_passages] == original_texts

    @mock.patch("perturbation_engine._negate_with_llama")
    def test_inject_conflict(self, mock_negate, sample_passages):
        mock_negate.side_effect = lambda t: f"NEGATED: {t}"
        from perturbation_engine import inject_conflict
        result = inject_conflict(sample_passages, conflict_ratio=0.5)
        conflict_count = sum(1 for p in result if p.get("is_conflict"))
        expected = max(1, math.floor(len(sample_passages) * 0.5))
        assert conflict_count == expected
        for p in result:
            if p.get("is_conflict"):
                assert p["text"].startswith("NEGATED:")
                assert "original_text" in p

    def test_make_unanswerable_full(self, sample_passages, sample_question):
        from perturbation_engine import make_unanswerable
        result = make_unanswerable(
            sample_passages, mode="full", snippets=sample_question["snippets"]
        )
        remaining_pmids = {p["pmid"] for p in result}
        # PMIDs 111 and 222 are answer-bearing and should be removed
        assert "111" not in remaining_pmids
        assert "222" not in remaining_pmids

    def test_make_unanswerable_partial(self, sample_passages, sample_question):
        from perturbation_engine import make_unanswerable
        full_result = make_unanswerable(
            sample_passages, mode="full", snippets=sample_question["snippets"]
        )
        partial_result = make_unanswerable(
            sample_passages, mode="partial", snippets=sample_question["snippets"]
        )
        # Partial should keep more passages than full
        assert len(partial_result) >= len(full_result)

    def test_make_unanswerable_no_snippets(self, sample_passages):
        from perturbation_engine import make_unanswerable
        result = make_unanswerable(sample_passages, mode="full", snippets=None)
        assert len(result) == len(sample_passages)

    def test_apply_perturbation_clean(self, sample_passages):
        from perturbation_engine import apply_perturbation
        result = apply_perturbation(sample_passages, "clean")
        assert len(result) == len(sample_passages)
        # Should be copies, not same objects
        assert result[0] is not sample_passages[0]

    def test_apply_perturbation_unknown_raises(self, sample_passages):
        from perturbation_engine import apply_perturbation
        with pytest.raises(ValueError, match="Unknown condition"):
            apply_perturbation(sample_passages, "nonexistent_condition")

    def test_condition_types_all_valid(self):
        from perturbation_engine import CONDITION_TYPES
        expected = {
            "noise_30", "noise_50", "noise_70",
            "conflict_50", "conflict_70",
            "unanswerable_partial", "unanswerable_full",
            "clean",
        }
        assert set(CONDITION_TYPES.keys()) == expected

    def test_is_answer_bearing(self):
        from perturbation_engine import _is_answer_bearing
        passage = {"pmid": "111"}
        snippets = [
            {"document": "http://www.ncbi.nlm.nih.gov/pubmed/111"},
            {"document": "http://www.ncbi.nlm.nih.gov/pubmed/999"},
        ]
        assert _is_answer_bearing(passage, snippets) is True
        assert _is_answer_bearing({"pmid": "000"}, snippets) is False


# ===================================================================
# evaluator.py
# ===================================================================

class TestEvaluator:

    # -- Retrieval metrics --

    def test_map_at_k_perfect(self):
        from evaluator import map_at_k
        retrieved = ["a", "b", "c"]
        relevant = {"a", "b", "c"}
        assert map_at_k(retrieved, relevant, k=3) == pytest.approx(1.0)

    def test_map_at_k_partial(self):
        from evaluator import map_at_k
        # Only second result is relevant
        retrieved = ["x", "a", "y"]
        relevant = {"a"}
        score = map_at_k(retrieved, relevant, k=3)
        # hit at position 2: precision = 1/2, AP = (1/2)/1 = 0.5
        assert score == pytest.approx(0.5)

    def test_map_at_k_none(self):
        from evaluator import map_at_k
        assert map_at_k(["x", "y"], {"a", "b"}, k=2) == 0.0

    def test_map_at_k_empty_relevant(self):
        from evaluator import map_at_k
        assert map_at_k(["a"], set(), k=1) == 0.0

    def test_mrr_at_k(self):
        from evaluator import mrr_at_k
        assert mrr_at_k(["x", "a", "b"], {"a", "b"}, k=5) == pytest.approx(0.5)
        assert mrr_at_k(["a", "x"], {"a"}, k=5) == pytest.approx(1.0)
        assert mrr_at_k(["x", "y"], {"a"}, k=2) == 0.0

    def test_ndcg_at_k_perfect(self):
        from evaluator import ndcg_at_k
        retrieved = ["a", "b"]
        relevant = {"a", "b"}
        assert ndcg_at_k(retrieved, relevant, k=2) == pytest.approx(1.0)

    def test_ndcg_at_k_partial(self):
        from evaluator import ndcg_at_k
        # relevant item at position 2 instead of 1
        retrieved = ["x", "a"]
        relevant = {"a"}
        score = ndcg_at_k(retrieved, relevant, k=2)
        assert 0.0 < score < 1.0

    def test_retrieval_metrics_returns_all_keys(self, sample_passages):
        from evaluator import retrieval_metrics
        result = retrieval_metrics(sample_passages, ["111", "222"], k=5)
        assert "map_at_k" in result
        assert "mrr_at_k" in result
        assert "ndcg_at_k" in result
        assert "precision_at_k" in result
        assert result["k"] == 5

    # -- Task metrics --

    def test_evaluate_yesno_correct(self):
        from evaluator import evaluate_yesno
        result = evaluate_yesno("Yes, aspirin is effective.", "yes")
        assert result["correct"] is True
        assert result["score"] == 1.0

    def test_evaluate_yesno_incorrect(self):
        from evaluator import evaluate_yesno
        result = evaluate_yesno("No, it does not work.", "yes")
        assert result["correct"] is False
        assert result["score"] == 0.0

    def test_evaluate_yesno_ambiguous(self):
        from evaluator import evaluate_yesno
        result = evaluate_yesno("It is unclear.", "yes")
        assert result["predicted"] == "unknown"
        assert result["score"] == 0.0

    def test_evaluate_factoid_match(self):
        from evaluator import evaluate_factoid
        result = evaluate_factoid("The answer is aspirin.", ["aspirin", "ASA"])
        assert result["score"] == 1.0
        assert result["matched"] == "aspirin"

    def test_evaluate_factoid_no_match(self):
        from evaluator import evaluate_factoid
        result = evaluate_factoid("The answer is ibuprofen.", ["aspirin"])
        assert result["score"] == 0.0

    def test_evaluate_list(self):
        from evaluator import evaluate_list
        gold = [["aspirin", "ASA"], ["ibuprofen"], ["naproxen"]]
        answer = "The drugs include aspirin and ibuprofen."
        result = evaluate_list(answer, gold)
        assert result["recall"] == pytest.approx(2 / 3)
        assert result["score"] > 0  # F1 > 0

    def test_evaluate_list_empty(self):
        from evaluator import evaluate_list
        result = evaluate_list("No drugs.", [["aspirin"]])
        assert result["score"] == 0.0

    def test_evaluate_summary(self):
        from evaluator import evaluate_summary
        result = evaluate_summary(
            "Aspirin is effective for heart disease.",
            "Aspirin is effective for preventing heart disease.",
        )
        assert result["rouge1_f"] > 0
        assert result["rougeL_f"] > 0
        assert result["task_metric"] == "rouge"

    def test_task_metrics_dispatches(self):
        from evaluator import task_metrics
        yesno_q = {"type": "yesno", "exact_answer": "yes"}
        result = task_metrics("Yes it is.", yesno_q)
        assert result["task_metric"] == "accuracy"

        factoid_q = {"type": "factoid", "exact_answer": ["aspirin"]}
        result = task_metrics("aspirin", factoid_q)
        assert result["task_metric"] == "strict_accuracy"

    # -- Helper functions --

    def test_strip_citations(self):
        from evaluator import _strip_citations
        assert _strip_citations("Based on [1] and [2,3], yes.") == "Based on and , yes."

    def test_split_sentences(self):
        from evaluator import _split_sentences
        text = "First sentence. Second sentence! Third is here?"
        result = _split_sentences(text)
        assert len(result) == 3

    def test_split_sentences_filters_short(self):
        from evaluator import _split_sentences
        text = "OK. This is a proper sentence."
        result = _split_sentences(text)
        assert len(result) == 1  # "OK" is too short


# ===================================================================
# retriever.py -- rerank logic (mock model)
# ===================================================================

class TestRetriever:

    def test_rerank_empty(self):
        from retriever import rerank
        with mock.patch("retriever._get_cross_encoder") as mock_ce:
            assert rerank("query", [], top_k=5) == []
            mock_ce.assert_not_called()

    def test_rerank_sorts_by_score(self):
        from retriever import rerank
        candidates = [
            {"text": "low relevance", "pmid": "1"},
            {"text": "high relevance", "pmid": "2"},
            {"text": "medium relevance", "pmid": "3"},
        ]
        mock_ce = mock.MagicMock()
        mock_ce.predict.return_value = [1.0, 9.0, 5.0]
        with mock.patch("retriever._get_cross_encoder", return_value=mock_ce):
            result = rerank("query", candidates, top_k=2)
        assert len(result) == 2
        assert result[0]["pmid"] == "2"  # highest score
        assert result[1]["pmid"] == "3"  # second highest
        assert result[0]["rerank_rank"] == 0
        assert result[1]["rerank_rank"] == 1

    def test_rerank_top_k_limits(self):
        from retriever import rerank
        candidates = [{"text": f"text{i}", "pmid": str(i)} for i in range(10)]
        mock_ce = mock.MagicMock()
        mock_ce.predict.return_value = list(range(10))
        with mock.patch("retriever._get_cross_encoder", return_value=mock_ce):
            result = rerank("query", candidates, top_k=3)
        assert len(result) == 3


# ===================================================================
# Integration-style: perturbation dispatch round-trip
# ===================================================================

class TestPerturbationDispatch:

    @mock.patch("perturbation_engine._negate_with_llama", side_effect=lambda t: f"NEG:{t}")
    def test_all_named_conditions_run(self, mock_negate, sample_passages, sample_question, sample_chunks):
        import db
        db.insert_chunks(sample_chunks)

        from perturbation_engine import apply_perturbation, CONDITION_TYPES
        for name in CONDITION_TYPES:
            result = apply_perturbation(
                sample_passages, name, snippets=sample_question["snippets"]
            )
            assert isinstance(result, list)
            # All conditions should return a non-None list
            assert all(isinstance(p, dict) for p in result)


# ===================================================================
# NLI groundedness (mock model)
# ===================================================================

class TestNLIGroundedness:

    @mock.patch("evaluator._get_nli_model")
    def test_nli_groundedness_basic(self, mock_get_nli):
        from evaluator import nli_groundedness
        mock_model = mock.MagicMock()
        # 2 sentences x 1 passage = 2 pairs
        # logits: [contradiction, entailment, neutral]
        mock_model.predict.return_value = np.array([
            [-5.0, 5.0, -5.0],   # sentence 1 entailed
            [5.0, -5.0, -5.0],   # sentence 2 contradicted
        ])
        mock_get_nli.return_value = mock_model

        result = nli_groundedness(
            "First claim is supported. Second claim is not.",
            [{"text": "Evidence for first claim."}],
        )
        assert result["supported_claim_rate"] == pytest.approx(0.5)
        assert len(result["details"]) == 2
        assert result["details"][0]["supported"] is True
        assert result["details"][1]["supported"] is False

    def test_nli_groundedness_empty_inputs(self):
        from evaluator import nli_groundedness
        result = nli_groundedness("", [])
        assert result["supported_claim_rate"] == 0.0
        assert result["citation_precision"] == 0.0

    def test_nli_groundedness_no_passages(self):
        from evaluator import nli_groundedness
        result = nli_groundedness("Some answer.", [])
        assert result["supported_claim_rate"] == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
