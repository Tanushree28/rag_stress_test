"""
S5 -- Evaluator
Compute retrieval metrics (MAP@k, MRR@k, nDCG@k),
NLI-based groundedness, and task-specific metrics.
"""


def map_at_k(retrieved: list, relevant: list, k: int = 5):
    """Mean Average Precision at k."""
    raise NotImplementedError


def mrr_at_k(retrieved: list, relevant: list, k: int = 5):
    """Mean Reciprocal Rank at k."""
    raise NotImplementedError


def ndcg_at_k(retrieved: list, relevant: list, k: int = 5):
    """Normalized Discounted Cumulative Gain at k."""
    raise NotImplementedError


def nli_groundedness(answer: str, passages: list[dict]):
    """Score groundedness using cross-encoder/nli-deberta-v3-base."""
    raise NotImplementedError


def evaluate(query: str, answer: str, passages: list[dict], gold: dict):
    """Run full evaluation suite and return metrics dict."""
    raise NotImplementedError


if __name__ == "__main__":
    pass
