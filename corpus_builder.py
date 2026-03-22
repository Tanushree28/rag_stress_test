"""
S1 -- Corpus Builder
Load BioASQ training data, fetch PubMed abstracts via NCBI EFetch,
chunk text, embed with MedCPT, and build FAISS index.
"""


def load_bioasq(path: str = "13/BioASQ-training13b/training13b.json"):
    """Load BioASQ training JSON and return list of question dicts."""
    raise NotImplementedError


def fetch_pubmed_abstracts(pmids: list[str], cache_path: str = "13/outputs/pubmed_cache_v2.json"):
    """Fetch abstracts from PubMed via EFetch API, with local cache."""
    raise NotImplementedError


def chunk_abstracts(abstracts: dict[str, str], max_tokens: int = 256):
    """Split abstracts into overlapping chunks."""
    raise NotImplementedError


def embed_and_index(chunks: list[dict]):
    """Embed chunks with MedCPT and build FAISS index."""
    raise NotImplementedError


if __name__ == "__main__":
    pass
