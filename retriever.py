"""
S2 -- Retriever
Encode query with MedCPT, search FAISS index for top-20,
rerank with cross-encoder to top-5.
"""


def encode_query(query: str):
    """Encode a query string using MedCPT query encoder."""
    raise NotImplementedError


def search_faiss(query_embedding, k: int = 20):
    """Search FAISS index and return top-k candidate passages."""
    raise NotImplementedError


def rerank(query: str, candidates: list[dict], top_k: int = 5):
    """Rerank candidates using cross-encoder/ms-marco-MiniLM-L-6-v2."""
    raise NotImplementedError


def retrieve(query: str, top_k: int = 5):
    """Full retrieval pipeline: encode -> search -> rerank."""
    raise NotImplementedError


if __name__ == "__main__":
    pass
