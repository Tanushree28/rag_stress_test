"""
S3 -- Perturbation Engine
Apply noise, conflict, and unanswerable conditions to retrieved passages.
"""


def inject_noise(passages: list[dict], noise_ratio: float, near_miss: bool = True):
    """Replace a fraction of passages with irrelevant or near-miss content."""
    raise NotImplementedError


def inject_conflict(passages: list[dict], conflict_ratio: float):
    """Replace a fraction of gold passages with LLaMA-negated contradictions."""
    raise NotImplementedError


def make_unanswerable(passages: list[dict], mode: str = "full"):
    """Remove answer-bearing passages (partial or full removal)."""
    raise NotImplementedError


def apply_perturbation(passages: list[dict], condition: dict):
    """Dispatch to the appropriate perturbation function."""
    raise NotImplementedError


if __name__ == "__main__":
    pass
