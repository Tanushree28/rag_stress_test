"""
S5 -- Evaluator
Compute retrieval metrics (MAP@k, MRR@k, nDCG@k),
NLI-based groundedness (Supported Claim Rate, Citation Precision),
and task-specific metrics (factoid, yesno, list, summary).
"""

import logging
import math
import re

import numpy as np
from rouge_score import rouge_scorer
from scipy.special import softmax
from sentence_transformers import CrossEncoder

logger = logging.getLogger(__name__)

NLI_MODEL = "cross-encoder/nli-deberta-v3-base"
NLI_LABELS = ["contradiction", "entailment", "neutral"]

_nli_model = None
_rouge_scorer = None


# ---------------------------------------------------------------------------
# Lazy loaders
# ---------------------------------------------------------------------------

def _get_nli_model():
    global _nli_model
    if _nli_model is None:
        logger.info("Loading NLI model: %s", NLI_MODEL)
        _nli_model = CrossEncoder(NLI_MODEL)
        logger.info("NLI model loaded")
    return _nli_model


def _get_rouge_scorer():
    global _rouge_scorer
    if _rouge_scorer is None:
        _rouge_scorer = rouge_scorer.RougeScorer(
            ["rouge1", "rouge2", "rougeL"], use_stemmer=True
        )
    return _rouge_scorer


# ---------------------------------------------------------------------------
# S5.1 -- Retrieval metrics
# ---------------------------------------------------------------------------

def _precision_at_k(retrieved_pmids: list[str], relevant_pmids: set[str], k: int) -> float:
    top_k = retrieved_pmids[:k]
    if not top_k:
        return 0.0
    return sum(1 for p in top_k if p in relevant_pmids) / len(top_k)


def map_at_k(retrieved_pmids: list[str], relevant_pmids: set[str], k: int = 5) -> float:
    """Mean Average Precision at k."""
    top_k = retrieved_pmids[:k]
    if not relevant_pmids:
        return 0.0
    score = 0.0
    hits = 0
    for i, pmid in enumerate(top_k, 1):
        if pmid in relevant_pmids:
            hits += 1
            score += hits / i
    return score / min(len(relevant_pmids), k)


def mrr_at_k(retrieved_pmids: list[str], relevant_pmids: set[str], k: int = 5) -> float:
    """Mean Reciprocal Rank at k."""
    for i, pmid in enumerate(retrieved_pmids[:k], 1):
        if pmid in relevant_pmids:
            return 1.0 / i
    return 0.0


def ndcg_at_k(retrieved_pmids: list[str], relevant_pmids: set[str], k: int = 5) -> float:
    """Normalized Discounted Cumulative Gain at k."""
    top_k = retrieved_pmids[:k]

    # DCG
    dcg = 0.0
    for i, pmid in enumerate(top_k, 1):
        rel = 1.0 if pmid in relevant_pmids else 0.0
        dcg += rel / math.log2(i + 1)

    # Ideal DCG
    n_rel = min(len(relevant_pmids), k)
    idcg = sum(1.0 / math.log2(i + 1) for i in range(1, n_rel + 1))

    if idcg == 0:
        return 0.0
    return dcg / idcg


def retrieval_metrics(
    passages: list[dict],
    gold_pmids: list[str],
    k: int = 5,
) -> dict:
    """Compute all retrieval metrics for a single query."""
    retrieved_pmids = [p["pmid"] for p in passages[:k]]
    relevant = set(gold_pmids)
    return {
        "map_at_k": map_at_k(retrieved_pmids, relevant, k),
        "mrr_at_k": mrr_at_k(retrieved_pmids, relevant, k),
        "ndcg_at_k": ndcg_at_k(retrieved_pmids, relevant, k),
        "precision_at_k": _precision_at_k(retrieved_pmids, relevant, k),
        "k": k,
        "retrieved": len(retrieved_pmids),
        "relevant_total": len(relevant),
    }


# ---------------------------------------------------------------------------
# S5.2 -- NLI-based groundedness
# ---------------------------------------------------------------------------

def _split_sentences(text: str) -> list[str]:
    """Simple sentence splitter."""
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def nli_groundedness(answer: str, passages: list[dict]) -> dict:
    """Score groundedness using cross-encoder/nli-deberta-v3-base.

    Returns:
        supported_claim_rate: fraction of answer sentences entailed by any passage
        citation_precision: fraction of cited passages that entail at least one claim
        avg_entailment_score: mean entailment probability across all (sentence, passage) pairs
        details: per-sentence NLI results
    """
    if not passages or not answer:
        return {
            "supported_claim_rate": 0.0,
            "citation_precision": 0.0,
            "avg_entailment_score": 0.0,
            "details": [],
        }

    nli = _get_nli_model()
    sentences = _split_sentences(answer)
    if not sentences:
        return {
            "supported_claim_rate": 0.0,
            "citation_precision": 0.0,
            "avg_entailment_score": 0.0,
            "details": [],
        }

    passage_texts = [p["text"] for p in passages]

    # Score all (sentence, passage) pairs
    pairs = []
    pair_map = []  # (sent_idx, pass_idx)
    for si, sent in enumerate(sentences):
        for pi, ptext in enumerate(passage_texts):
            pairs.append((ptext, sent))  # (premise, hypothesis)
            pair_map.append((si, pi))

    raw_scores = nli.predict(pairs)  # shape: (n_pairs, 3) logits for 3-class NLI

    # Apply softmax to convert logits to probabilities
    # nli-deberta-v3-base outputs: [contradiction, entailment, neutral]
    if hasattr(raw_scores[0], "__len__"):
        probs = softmax(np.array(raw_scores), axis=1)
    else:
        probs = np.array(raw_scores).reshape(-1, 1)

    # Parse scores into per-sentence results
    details = []
    passage_supports = set()
    supported_count = 0

    for si, sent in enumerate(sentences):
        sent_result = {"sentence": sent, "supported": False, "best_passage": -1, "best_score": 0.0}
        for pi in range(len(passage_texts)):
            idx = si * len(passage_texts) + pi
            entailment_score = float(probs[idx][1])

            if entailment_score > sent_result["best_score"]:
                sent_result["best_score"] = entailment_score
                sent_result["best_passage"] = pi

        if sent_result["best_score"] > 0.5:
            sent_result["supported"] = True
            supported_count += 1
            passage_supports.add(sent_result["best_passage"])

        details.append(sent_result)

    supported_claim_rate = supported_count / len(sentences) if sentences else 0.0
    citation_precision = len(passage_supports) / len(passage_texts) if passage_texts else 0.0

    all_entailment = []
    for si in range(len(sentences)):
        for pi in range(len(passage_texts)):
            idx = si * len(passage_texts) + pi
            all_entailment.append(float(probs[idx][1]))

    return {
        "supported_claim_rate": supported_claim_rate,
        "citation_precision": citation_precision,
        "avg_entailment_score": float(np.mean(all_entailment)) if all_entailment else 0.0,
        "details": details,
    }


# ---------------------------------------------------------------------------
# S5.3 -- Task-specific metrics
# ---------------------------------------------------------------------------

def _normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def evaluate_yesno(answer: str, gold: str) -> dict:
    """Evaluate yes/no question: check if answer contains the gold label."""
    answer_lower = answer.lower()
    gold_lower = gold.lower().strip()
    predicted = "yes" if "yes" in answer_lower else "no" if "no" in answer_lower else "unknown"
    correct = predicted == gold_lower
    return {"task_metric": "accuracy", "predicted": predicted, "gold": gold_lower, "correct": correct, "score": 1.0 if correct else 0.0}


def evaluate_factoid(answer: str, gold_answers: list[str]) -> dict:
    """Evaluate factoid: check if any gold answer appears in the generated answer."""
    answer_norm = _normalize(answer)
    for g in gold_answers:
        if _normalize(g) in answer_norm:
            return {"task_metric": "strict_accuracy", "score": 1.0, "matched": g}
    # Lenient: check MRR-style
    return {"task_metric": "strict_accuracy", "score": 0.0, "matched": None}


def evaluate_list(answer: str, gold_lists: list[list[str]]) -> dict:
    """Evaluate list question: compute F1 over gold answer items."""
    answer_norm = _normalize(answer)
    # gold_lists is list of synonym lists; count a hit if any synonym matches
    tp = 0
    matched = []
    for synonyms in gold_lists:
        for syn in synonyms:
            if _normalize(syn) in answer_norm:
                tp += 1
                matched.append(syn)
                break

    precision = tp / max(1, len(gold_lists))  # approximate
    recall = tp / len(gold_lists) if gold_lists else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    return {"task_metric": "list_f1", "score": f1, "precision": precision, "recall": recall, "matched": matched}


def evaluate_summary(answer: str, gold_answers: list[str] | str) -> dict:
    """Evaluate summary question: compute ROUGE scores."""
    scorer = _get_rouge_scorer()
    if isinstance(gold_answers, list):
        gold_text = " ".join(gold_answers)
    else:
        gold_text = gold_answers

    scores = scorer.score(gold_text, answer)
    return {
        "task_metric": "rouge",
        "rouge1_f": scores["rouge1"].fmeasure,
        "rouge2_f": scores["rouge2"].fmeasure,
        "rougeL_f": scores["rougeL"].fmeasure,
        "score": scores["rougeL"].fmeasure,
    }


def task_metrics(answer: str, question: dict) -> dict:
    """Dispatch to the appropriate task metric based on question type."""
    qtype = question["type"]
    gold = question.get("exact_answer") or question.get("ideal_answer", "")

    if qtype == "yesno":
        return evaluate_yesno(answer, gold if isinstance(gold, str) else str(gold))
    elif qtype == "factoid":
        gold_list = gold if isinstance(gold, list) else [gold]
        return evaluate_factoid(answer, gold_list)
    elif qtype == "list":
        gold_lists = gold if isinstance(gold, list) else [[gold]]
        return evaluate_list(answer, gold_lists)
    elif qtype == "summary":
        ideal = question.get("ideal_answer", "")
        return evaluate_summary(answer, ideal)
    else:
        return {"task_metric": "unknown", "score": 0.0}


# ---------------------------------------------------------------------------
# S5.4 -- Full evaluation
# ---------------------------------------------------------------------------

def evaluate(
    query: str,
    answer: str,
    passages: list[dict],
    question: dict,
    k: int = 5,
) -> dict:
    """Run full evaluation suite and return metrics dict.

    Args:
        query: the question text
        answer: generated answer text
        passages: retrieved passages (possibly perturbed)
        question: full BioASQ question dict (with pmids, snippets, type, etc.)
        k: cutoff for retrieval metrics

    Returns:
        Dict with retrieval_metrics, groundedness, task_metrics.
    """
    # Retrieval metrics
    ret_metrics = retrieval_metrics(passages, question.get("pmids", []), k=k)

    # Groundedness
    ground = nli_groundedness(answer, passages)

    # Task-specific
    task = task_metrics(answer, question)

    return {
        "retrieval": ret_metrics,
        "groundedness": ground,
        "task": task,
    }


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    from corpus_builder import load_bioasq
    from retriever import retrieve
    from generator import generate

    questions = load_bioasq(max_questions=5)
    q = questions[0]
    print(f"Question [{q['type']}]: {q['body']}")

    passages = retrieve(q["body"])
    result = generate(q["body"], passages)
    print(f"\nAnswer: {result['answer'][:200]}...")

    metrics = evaluate(q["body"], result["answer"], passages, q)

    print(f"\n--- Retrieval ---")
    for k, v in metrics["retrieval"].items():
        print(f"  {k}: {v}")

    print(f"\n--- Groundedness ---")
    print(f"  Supported Claim Rate: {metrics['groundedness']['supported_claim_rate']:.3f}")
    print(f"  Citation Precision:   {metrics['groundedness']['citation_precision']:.3f}")
    print(f"  Avg Entailment:       {metrics['groundedness']['avg_entailment_score']:.3f}")

    print(f"\n--- Task ({q['type']}) ---")
    for k, v in metrics["task"].items():
        if k != "details":
            print(f"  {k}: {v}")
