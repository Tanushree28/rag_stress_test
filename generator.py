"""
S4 -- Generator
Send retrieved (possibly perturbed) passages + query to LLaMA 3.1:8b
via Ollama with strict citation prompting.
"""

import logging
import re

import ollama

logger = logging.getLogger(__name__)

LLAMA_MODEL = "llama3.1:8b"

SYSTEM_PROMPT = (
    "You are a biomedical question-answering assistant. "
    "Answer the question using ONLY the provided passages. "
    "Cite passages by number [1], [2], etc. "
    "If the passages do not contain enough information to answer, "
    'say "I cannot answer this question based on the provided evidence." '
    "Be concise and precise."
)


def build_prompt(query: str, passages: list[dict]) -> str:
    """Construct the citation-aware user prompt for LLaMA.

    Numbers each passage [1]...[N] so the model can cite them.
    """
    passage_block = []
    for i, p in enumerate(passages, 1):
        title = p.get("title", "")
        text = p.get("text", "")
        header = f"[{i}]"
        if title:
            header += f" {title}"
        passage_block.append(f"{header}\n{text}")

    passages_text = "\n\n".join(passage_block)

    prompt = (
        f"Passages:\n{passages_text}\n\n"
        f"Question: {query}\n\n"
        "Answer (cite passages by number):"
    )
    return prompt


def parse_citations(answer: str) -> list[int]:
    """Extract cited passage numbers from the generated answer."""
    return sorted(set(int(m) for m in re.findall(r"\[(\d+)\]", answer)))


def generate(
    query: str,
    passages: list[dict],
    temperature: float = 0.3,
    max_tokens: int = 512,
) -> dict:
    """Call Ollama LLaMA 3.1:8b and return the generated answer.

    Returns dict with keys:
        answer: generated text
        citations: list of cited passage numbers
        passages_used: count of passages provided
        model: model name
    """
    if not passages:
        return {
            "answer": "I cannot answer this question based on the provided evidence.",
            "citations": [],
            "passages_used": 0,
            "model": LLAMA_MODEL,
        }

    user_prompt = build_prompt(query, passages)

    try:
        response = ollama.chat(
            model=LLAMA_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            options={
                "temperature": temperature,
                "num_predict": max_tokens,
            },
        )
        answer = response["message"]["content"].strip()
    except Exception as e:
        logger.error("Ollama generation failed: %s", e)
        answer = "Generation failed due to an internal error."

    citations = parse_citations(answer)

    logger.info(
        "Generated answer (%d chars, %d citations) for: %s",
        len(answer), len(citations), query[:80],
    )
    return {
        "answer": answer,
        "citations": citations,
        "passages_used": len(passages),
        "model": LLAMA_MODEL,
    }


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    from retriever import retrieve

    query = "Is Hirschsprung disease a mendelian or a multifactorial disorder?"
    passages = retrieve(query)

    print(f"Query: {query}")
    print(f"Passages: {len(passages)}\n")

    result = generate(query, passages)
    print(f"Answer:\n{result['answer']}\n")
    print(f"Citations: {result['citations']}")

    # Test with empty passages (unanswerable)
    print("\n--- Empty passages test ---")
    empty_result = generate(query, [])
    print(f"Answer: {empty_result['answer']}")
