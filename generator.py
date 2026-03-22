"""
S4 -- Generator
Send retrieved (possibly perturbed) passages + query to LLaMA 3.1:8b
via Ollama with strict citation prompting.
"""


def build_prompt(query: str, passages: list[dict]):
    """Construct the citation-aware prompt for LLaMA."""
    raise NotImplementedError


def generate(query: str, passages: list[dict]):
    """Call Ollama LLaMA 3.1:8b and return the generated answer."""
    raise NotImplementedError


if __name__ == "__main__":
    pass
