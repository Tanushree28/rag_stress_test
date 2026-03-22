# 🧠 Project Specification: Stress-Testing Retrieval-Augmented Generation for Biomedical QA

## 1. Project Goal

To design and evaluate a **robust Retrieval-Augmented Generation (RAG) pipeline** for biomedical question answering under controlled adversarial conditions, including:

- Noisy evidence
- Conflicting information
- Unanswerable scenarios

The system quantifies how retrieval and generation degrade under stress.

---

## 2. System Architecture Overview

The system is divided into **five modular stages (S1–S5):**

1. Corpus Construction
2. Dense Retrieval + Reranking
3. Controlled Evidence Perturbation (Core Contribution ⚡)
4. Answer Generation (LLM)
5. Multi-Level Evaluation

---

## 3. Stage S1: Controlled Biomedical Corpus

### A. Data Sources

- **BioASQ Training Data**
  - Questions + gold snippets
- **PubMed Abstracts (via NCBI EFetch)**
  - Linked using PMIDs

### B. Preprocessing Pipeline

#### 1. Section-Aware Chunking

Split abstracts into:

- Background
- Methods
- Results
- Conclusions

#### 2. Embedding

- Model: **MedCPT Encoder**
- Output: dense vector representations

#### 3. Indexing

- Engine: **FAISS**

Stores:
Vector + Metadata {
PMID,
Section,
ChunkID
}

---

## 4. Stage S2: Dense Retrieval + Reranking

### A. Input

- BioASQ Question

### B. Retrieval Pipeline

#### 1. Query Encoding

- Model: **MedCPT Query Encoder**

#### 2. Dense Retrieval

- FAISS Top-k retrieval (k ≈ 20)

#### 3. Reranking

- Cross-Encoder
- Output: Top-n passages (n ≈ 5)

### C. Output

- Ranked evidence set (Top-n candidates)

---

## 5. Stage S3: Controlled Evidence Perturbation ⚡ (CORE CONTRIBUTION)

This is the **main novelty of your thesis**.

### A. Condition A: Unanswerable

**Goal:** Simulate missing evidence

- Remove answer-containing passages
- Remove gold PMIDs

**Levels:**

- Partial removal
- Full removal

---

### B. Condition B: Conflict

**Goal:** Inject contradictory biomedical evidence

- Add opposing claims:
  - “Drug works” vs “Drug does not work”

**Mix ratios:**

- 50/50
- 70/30 (support vs oppose)

---

### C. Condition C: Noise

**Goal:** Distract the model

- Inject irrelevant passages
- Inject near-miss passages:
  - Same disease, different drug

**Noise intensities:**

- 30%
- 50%
- 70%

---

### D. Baseline (Control Group)

- Clean top-n retrieved passages
- No perturbation

---

### E. Output

- **Stressed Evidence Set**

---

## 6. Stage S4: Generator (LLM)

### A. Model

- **LLaMA 3 8B Instruct (baseline)**

### B. Prompting Strategy

The model must follow strict rules:

1. Answer only using provided evidence
2. Include citation indices
3. If insufficient evidence:
   - Output: `"Insufficient Evidence"`

### C. Output Format

Answer: <generated answer>
Citations: [1], [3], [5]

---

## 7. Stage S5: Multi-Level Evaluation

### A. Retrieval Metrics

- **MAP@k**
  - Measures ranking quality

- **MRR@k**
  - First correct evidence position

- **nDCG@k**
  - Graded relevance + ranking position

---

### B. Groundedness Metrics

- **Supported Claim Rate**
  - % of claims backed by evidence

- **Citation Precision**
  - Are cited passages actually relevant?

- **Abstention Rate**
  - Does model correctly say “Insufficient”?

---

### C. Task-Level Metrics

#### Factoid Questions

- EM (Exact Match)
- F1 Score

#### Yes/No Questions

- Accuracy

#### Summary Questions

- ROUGE-L

---

## 8. Experimental Design

### A. Stress Test Sweeps

| Condition    | Levels        |
| ------------ | ------------- |
| Noise        | 30%, 50%, 70% |
| Conflict     | 50/50, 70/30  |
| Unanswerable | Partial, Full |

---

### B. Comparison Axes

- Clean vs Perturbed
- Retrieval vs Generation degradation
- Model behavior under uncertainty

---

## 9. Expected Contributions

### 🔥 1. Systematic Stress Testing Framework

A reproducible way to evaluate RAG robustness.

### 🔥 2. Failure Mode Analysis

- Hallucination under noise
- Confusion under conflict
- Overconfidence in unanswerable cases

### 🔥 3. Benchmark Extension

Extends BioASQ into robustness evaluation setting

---

## 10. Implementation Stack (Suggested)

### Core

- Python (PyTorch / Local Ollama)

### Retrieval

- FAISS
- MedCPT

### LLM

- local ollama llama3.1:8b

### Data Processing

- pandas / numpy

### Evaluation

- scikit-learn
- rouge-score

---

## 11. Immediate Task (if you were coding this)

### Goal:

Build pipeline skeleton

### Modules to Implement:

- `corpus_builder.py`
- `retriever.py`
- `perturbation_engine.py` ⚡
- `generator.py`
- `evaluator.py`

### Do not do's

dont add emojis

### permissions to ask

ask before using the .env file
after reading the plan what varibles to add in .env discuss that

## permission allowed

access github
make a repo rag_stress_test
create PR, push code,

## add all these permissions to the .claude/settings.json file
