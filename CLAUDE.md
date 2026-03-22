# CLAUDE.md — RAG Stress-Test Project

## Project Summary

Thesis project: stress-test a biomedical RAG pipeline using BioASQ Challenge 13 data. Quantifies how retrieval and generation degrade under 3 adversarial conditions (noise, conflict, unanswerable).

## Permissions

- Access GitHub
- Create repo: `rag_stress_test`
- Create PRs, push code
- Read/write `.env` file (discuss variables before adding)
- No emojis in code or output

## API Keys (.env)

```
NCBI_API_KEY=            # Required — free from ncbi.nlm.nih.gov/account (10 req/sec)
HUGGINGFACE_TOKEN=       # Optional — only if MedCPT model download requires auth
```

No LLM API key needed — LLaMA 3.1:8b runs locally via Ollama.

## Architecture: 5-Stage Pipeline

| Stage | Module | Purpose |
|-------|--------|---------|
| S1 | `corpus_builder.py` | Load BioASQ, fetch PubMed via NCBI EFetch, chunk, embed (MedCPT), index (FAISS) |
| S2 | `retriever.py` | Query encode (MedCPT), FAISS top-20, cross-encoder rerank to top-5 |
| S3 | `perturbation_engine.py` | Apply noise/conflict/unanswerable conditions |
| S4 | `generator.py` | LLaMA 3.1:8b via Ollama, strict citation prompting |
| S5 | `evaluator.py` | MAP@k, MRR@k, nDCG@k, NLI-based groundedness, task metrics |
| API | `api/main.py` | FastAPI wrapping pipeline (5 endpoints) |
| UI | `frontend/` | Next.js + Tailwind + shadcn/ui + Recharts |

## Key Design Decisions

- **Conflict injection**: Local LLaMA negates gold snippets ("Rewrite to contradict main claim")
- **Near-miss noise**: Retrieve passages from *other* BioASQ questions sharing disease keywords
- **Cross-encoder**: `cross-encoder/ms-marco-MiniLM-L-6-v2`
- **NLI model** (for groundedness metrics): `cross-encoder/nli-deberta-v3-base`
- **State management**: Zustand (not plain React state)
- **Experiment history**: SQLite via FastAPI

## Two Operating Modes (Frontend)

1. **Evaluation Mode** — BioASQ question with gold answer → full metrics
2. **Free Chat Mode** — any biomedical question → retrieval + generation, no task metrics; live PubMed fallback if FAISS similarity below threshold

## Data

- `13/BioASQ-training13b/training13b.json` — 45MB, 5,389 questions + PMIDs (use ~400 question subset for dev)
- `13/outputs/pubmed_cache_v2.json` — partial PubMed abstract cache (9.9MB)
- `13/Task13BGoldenEnriched/` — gold answers for Phase B evaluation

## Perturbation Conditions

| Condition | Levels |
|-----------|--------|
| Noise | 30%, 50%, 70% (irrelevant + near-miss passages) |
| Conflict | 50/50, 70/30 (LLaMA-negated gold snippets) |
| Unanswerable | Partial removal, Full removal of answer-bearing passages |

## Stack

- Python, PyTorch, FAISS, MedCPT, sentence-transformers
- Ollama (llama3.1:8b), FastAPI, SQLite
- Next.js, React, Tailwind CSS, shadcn/ui, Recharts, Zustand
