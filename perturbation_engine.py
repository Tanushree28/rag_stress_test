"""
S3 -- Perturbation Engine
Apply noise, conflict, and unanswerable conditions to retrieved passages.

Conditions:
  - Noise 30/50/70%: replace passages with irrelevant or near-miss content
  - Conflict 50/50, 70/30: replace gold passages with LLaMA-negated contradictions
  - Unanswerable partial/full: remove answer-bearing passages
"""

import json
import logging
import math
import random
from pathlib import Path

import ollama

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")
CHUNKS_PATH = DATA_DIR / "chunks.json"
QUESTIONS_PATH = DATA_DIR / "questions.json"
LLAMA_MODEL = "llama3.1:8b"

_all_chunks = None
_all_questions = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_all_chunks() -> list[dict]:
    global _all_chunks
    if _all_chunks is None:
        with open(CHUNKS_PATH) as f:
            _all_chunks = json.load(f)
    return _all_chunks


def _load_all_questions() -> list[dict]:
    global _all_questions
    if _all_questions is None:
        with open(QUESTIONS_PATH) as f:
            _all_questions = json.load(f)
    return _all_questions


def _get_near_miss_chunks(query_pmids: set[str], n: int) -> list[dict]:
    """Get chunks from other questions that share disease keywords but
    are NOT from the current question's PMIDs (near-miss noise)."""
    all_chunks = _load_all_chunks()
    candidates = [c for c in all_chunks if c["pmid"] not in query_pmids]
    if len(candidates) <= n:
        return candidates
    return random.sample(candidates, n)


def _get_irrelevant_chunks(query_pmids: set[str], n: int) -> list[dict]:
    """Get random chunks unrelated to the current question."""
    all_chunks = _load_all_chunks()
    candidates = [c for c in all_chunks if c["pmid"] not in query_pmids]
    if len(candidates) <= n:
        return candidates
    return random.sample(candidates, n)


def _negate_with_llama(text: str) -> str:
    """Use LLaMA 3.1:8b to rewrite a passage to contradict its main claim."""
    prompt = (
        "Rewrite the following biomedical passage so that it contradicts "
        "its main claim. Keep the passage plausible, roughly the same length, "
        "and in a scientific tone. Do NOT add any explanation or preamble -- "
        "output only the rewritten passage.\n\n"
        f"Original passage:\n{text}"
    )
    try:
        response = ollama.chat(
            model=LLAMA_MODEL,
            messages=[{"role": "user", "content": prompt}],
            options={"temperature": 0.5, "num_predict": 512},
        )
        return response["message"]["content"].strip()
    except Exception as e:
        logger.warning("LLaMA negation failed: %s", e)
        return text

# ---------------------------------------------------------------------------
# S3.1 -- Noise injection
# ---------------------------------------------------------------------------

def inject_noise(
    passages: list[dict],
    noise_ratio: float,
    near_miss: bool = True,
) -> list[dict]:
    """Replace a fraction of passages with irrelevant or near-miss content.

    Args:
        passages: list of retrieved passage dicts
        noise_ratio: fraction to replace (0.3, 0.5, or 0.7)
        near_miss: if True, use near-miss chunks; else purely random

    Returns:
        New list with some passages replaced. Replaced passages get
        'is_noise': True and 'noise_type': 'near_miss' or 'irrelevant'.
    """
    passages = [dict(p) for p in passages]  # shallow copy
    n_replace = max(1, math.floor(len(passages) * noise_ratio))
    query_pmids = {p["pmid"] for p in passages}

    if near_miss:
        replacements = _get_near_miss_chunks(query_pmids, n_replace)
        noise_type = "near_miss"
    else:
        replacements = _get_irrelevant_chunks(query_pmids, n_replace)
        noise_type = "irrelevant"

    # Replace from the bottom-ranked passages upward
    indices_to_replace = list(range(len(passages) - 1, -1, -1))[:n_replace]
    for i, idx in enumerate(indices_to_replace):
        if i < len(replacements):
            replacement = dict(replacements[i])
            replacement["is_noise"] = True
            replacement["noise_type"] = noise_type
            replacement["original_rank"] = idx
            passages[idx] = replacement

    random.shuffle(passages)
    logger.info(
        "Noise injected: %d/%d passages replaced (%s, ratio=%.0f%%)",
        min(n_replace, len(replacements)), len(passages), noise_type, noise_ratio * 100,
    )
    return passages


# ---------------------------------------------------------------------------
# S3.2 -- Conflict injection
# ---------------------------------------------------------------------------

def inject_conflict(
    passages: list[dict],
    conflict_ratio: float,
) -> list[dict]:
    """Replace a fraction of gold passages with LLaMA-negated contradictions.

    Args:
        passages: list of retrieved passage dicts
        conflict_ratio: fraction of passages to negate (0.5 or 0.7)

    Returns:
        New list with some passages negated. Negated passages get
        'is_conflict': True and 'original_text' preserving the original.
    """
    passages = [dict(p) for p in passages]
    n_negate = max(1, math.floor(len(passages) * conflict_ratio))

    # Negate top-ranked passages (most likely to contain the answer)
    for i in range(min(n_negate, len(passages))):
        original_text = passages[i]["text"]
        negated_text = _negate_with_llama(original_text)
        passages[i] = dict(passages[i])
        passages[i]["text"] = negated_text
        passages[i]["is_conflict"] = True
        passages[i]["original_text"] = original_text

    logger.info(
        "Conflict injected: %d/%d passages negated (ratio=%.0f%%)",
        min(n_negate, len(passages)), len(passages), conflict_ratio * 100,
    )
    return passages


# ---------------------------------------------------------------------------
# S3.3 -- Unanswerable
# ---------------------------------------------------------------------------

def _is_answer_bearing(passage: dict, snippets: list[dict]) -> bool:
    """Check if a passage is answer-bearing by matching against gold snippets."""
    passage_pmid = passage.get("pmid", "")
    snippet_pmids = {
        s.get("document", "").rstrip("/").split("/")[-1]
        for s in snippets
    }
    return passage_pmid in snippet_pmids


def make_unanswerable(
    passages: list[dict],
    mode: str = "full",
    snippets: list[dict] | None = None,
) -> list[dict]:
    """Remove answer-bearing passages.

    Args:
        passages: list of retrieved passage dicts
        mode: 'full' removes all answer-bearing, 'partial' removes half
        snippets: gold snippets from BioASQ question (for PMID matching)

    Returns:
        Filtered list with answer-bearing passages removed.
        Removed entries get 'was_removed': True in a separate metadata return.
    """
    if not snippets:
        logger.warning("No snippets provided; returning passages unchanged")
        return [dict(p) for p in passages]

    answer_bearing = []
    non_answer = []
    for p in passages:
        p_copy = dict(p)
        if _is_answer_bearing(p, snippets):
            answer_bearing.append(p_copy)
        else:
            non_answer.append(p_copy)

    if mode == "full":
        removed = answer_bearing
        kept = non_answer
    elif mode == "partial":
        n_remove = max(1, len(answer_bearing) // 2)
        removed = answer_bearing[:n_remove]
        kept = non_answer + answer_bearing[n_remove:]
    else:
        raise ValueError(f"Unknown unanswerable mode: {mode}")

    for p in removed:
        p["was_removed"] = True

    logger.info(
        "Unanswerable (%s): removed %d/%d answer-bearing passages, %d remain",
        mode, len(removed), len(answer_bearing), len(kept),
    )
    return kept


# ---------------------------------------------------------------------------
# S3.4 -- Dispatch
# ---------------------------------------------------------------------------

CONDITION_TYPES = {
    "noise_30": {"type": "noise", "noise_ratio": 0.3, "near_miss": True},
    "noise_50": {"type": "noise", "noise_ratio": 0.5, "near_miss": True},
    "noise_70": {"type": "noise", "noise_ratio": 0.7, "near_miss": True},
    "conflict_50": {"type": "conflict", "conflict_ratio": 0.5},
    "conflict_70": {"type": "conflict", "conflict_ratio": 0.7},
    "unanswerable_partial": {"type": "unanswerable", "mode": "partial"},
    "unanswerable_full": {"type": "unanswerable", "mode": "full"},
    "clean": {"type": "clean"},
}


def apply_perturbation(
    passages: list[dict],
    condition: str | dict,
    snippets: list[dict] | None = None,
) -> list[dict]:
    """Apply a named perturbation condition to passages.

    Args:
        passages: retrieved passage dicts
        condition: either a condition name string (e.g. 'noise_50')
                   or a dict with 'type' and parameters
        snippets: gold snippets (needed for unanswerable conditions)

    Returns:
        Perturbed passage list.
    """
    if isinstance(condition, str):
        if condition not in CONDITION_TYPES:
            raise ValueError(
                f"Unknown condition '{condition}'. "
                f"Valid: {list(CONDITION_TYPES.keys())}"
            )
        condition = CONDITION_TYPES[condition]

    ctype = condition["type"]

    if ctype == "clean":
        return [dict(p) for p in passages]
    elif ctype == "noise":
        return inject_noise(
            passages,
            noise_ratio=condition["noise_ratio"],
            near_miss=condition.get("near_miss", True),
        )
    elif ctype == "conflict":
        return inject_conflict(
            passages,
            conflict_ratio=condition["conflict_ratio"],
        )
    elif ctype == "unanswerable":
        return make_unanswerable(
            passages,
            mode=condition["mode"],
            snippets=snippets,
        )
    else:
        raise ValueError(f"Unknown condition type: {ctype}")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    from retriever import retrieve
    from corpus_builder import load_bioasq

    questions = load_bioasq(max_questions=5)
    q = questions[0]
    print(f"Question: {q['body']}")
    print(f"Type: {q['type']}, PMIDs: {len(q['pmids'])}")

    passages = retrieve(q["body"])
    print(f"\nClean passages: {len(passages)}")

    # Test noise injection
    noisy = apply_perturbation(passages, "noise_50")
    noise_count = sum(1 for p in noisy if p.get("is_noise"))
    print(f"Noise 50%: {noise_count}/{len(noisy)} replaced")

    # Test unanswerable
    unanswerable = apply_perturbation(passages, "unanswerable_full", snippets=q["snippets"])
    print(f"Unanswerable full: {len(unanswerable)} passages remain (from {len(passages)})")

    # Test conflict (1 passage only to keep it quick)
    print("\nTesting conflict injection on 1 passage...")
    conflict_test = apply_perturbation(passages[:1], "conflict_50")
    if conflict_test and conflict_test[0].get("is_conflict"):
        print(f"Original: {conflict_test[0]['original_text'][:120]}...")
        print(f"Negated:  {conflict_test[0]['text'][:120]}...")
