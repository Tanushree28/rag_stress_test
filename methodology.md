# Chapter 3: Methodology

## 3.1 Overview of Research Design

This chapter describes the methodology employed to investigate the robustness of a Retrieval-Augmented Generation (RAG) pipeline under controlled adversarial conditions in the biomedical question-answering domain. The central research question asks how retrieval quality and answer generation degrade when the evidence presented to a language model is systematically corrupted through noise injection, factual conflict, and evidence removal.

To answer this question, the study implements a modular, five-stage pipeline that progresses from corpus construction through dense retrieval, controlled perturbation, answer generation, and multi-level evaluation. Each stage is designed as an independent module with well-defined inputs and outputs, enabling precise isolation of failure modes at each layer of the system. The pipeline processes questions from the BioASQ Challenge 13 biomedical question-answering benchmark, retrieves relevant PubMed abstracts using domain-specialized dense encoders, applies one of seven adversarial perturbation conditions (plus a clean baseline), generates answers using a locally hosted large language model, and evaluates the results across retrieval, groundedness, and task-specific metrics.

The experimental design follows a controlled comparison structure: for each question, the system first retrieves passages under unperturbed conditions to establish a baseline, then applies each perturbation condition independently to the same retrieved set, generating and evaluating answers under each condition. This design ensures that observed differences in output quality can be attributed directly to the perturbation rather than to variation in retrieval behavior across runs.

The remainder of this chapter describes each stage in detail, beginning with the dataset and preprocessing pipeline, proceeding through the retrieval, perturbation, and generation modules, and concluding with the evaluation framework and experimental design.

---

## 3.2 Dataset and Preprocessing

### 3.2.1 The BioASQ Challenge 13 Dataset

The primary data source for this study is the BioASQ Challenge 13 Training Set (Task 13b), a widely used benchmark for biomedical question answering that provides structured question-answer pairs grounded in the PubMed literature. The training set contains 5,389 questions spanning four answer types: factoid (questions expecting a specific entity or phrase), yes/no (binary judgment questions), list (questions expecting multiple entities), and summary (questions requiring a synthesized narrative answer). Each question is accompanied by a set of gold-standard PubMed document identifiers (PMIDs) linking to relevant abstracts, gold evidence snippets extracted from those abstracts with section and character-offset annotations, and one or more reference answers (an exact answer for factoid, yes/no, and list types, and an ideal narrative answer for summary types).

This dataset was selected for three reasons. First, the presence of gold PMIDs and snippets enables precise evaluation of retrieval quality against a known ground truth. Second, the four question types exercise different reasoning capabilities, allowing the study to examine whether perturbation effects vary across task complexity. Third, the biomedical domain demands factual precision, making it a high-stakes setting where the consequences of noise, conflict, and missing evidence are practically meaningful.

For development and experimentation, a subset of 400 questions is used, sampled to preserve the distribution across the four question types. This subset provides sufficient statistical power for comparative evaluation while keeping computation tractable given that each question must be processed under eight experimental conditions, each involving language model inference.

### 3.2.2 PubMed Abstract Retrieval

The raw BioASQ dataset provides only PMIDs, not full-text abstracts. To construct the retrieval corpus, the system fetches abstracts from the NCBI Entrez EFetch API. Each question's associated PMIDs are extracted from the document URL fields, deduplicated across the question set, and submitted to the EFetch endpoint in batches of 200 (the NCBI-imposed maximum per request). The XML responses are parsed to extract, for each article, the PMID, article title, and abstract text (including labeled sections such as Background, Methods, Results, and Conclusions where available). Articles lacking an abstract are discarded.

To avoid redundant API calls and respect NCBI rate limits, the system maintains a persistent JSON cache. On each invocation, only PMIDs absent from the cache are fetched from the API. Rate limiting is enforced at 0.11 seconds between requests when an NCBI API key is configured (permitting 10 requests per second) or 0.34 seconds otherwise (3 requests per second). Failed requests are retried up to three times with exponential backoff to handle transient network errors.

### 3.2.3 Chunking Strategy

Retrieved abstracts are segmented into overlapping chunks to produce retrieval units of manageable length for both the embedding model and the downstream language model. The chunking strategy uses a word-level sliding window with a maximum chunk size of 256 words and an overlap of 64 words, yielding a stride of 192 words. Abstracts shorter than 256 words are retained as single chunks. For longer abstracts, the window advances by 192 words at each step, producing overlapping chunks that preserve contextual continuity across chunk boundaries.

Each chunk is stored with metadata including the source PMID, article title, chunk text, and a positional index within the parent abstract. This metadata enables downstream evaluation modules to trace retrieved chunks back to their source documents for relevance assessment against gold PMIDs.

Word-level chunking was chosen over token-level chunking for simplicity and reproducibility. While token-based approaches can more precisely respect model input limits, the 256-word maximum reliably falls within the 512-token limit of the MedCPT encoder used for embedding, and the word-based approach avoids coupling the chunking logic to a specific tokenizer.

### 3.2.4 Embedding and Indexing

Chunks are encoded into dense vector representations using MedCPT (Medical Contrastive Pre-Training), a domain-specialized encoder developed by NCBI specifically for biomedical information retrieval. MedCPT employs an asymmetric dual-encoder architecture with separate models for documents and queries, reflecting the structural differences between short queries and longer passage texts.

For document encoding, the MedCPT Article Encoder (`ncbi/MedCPT-Article-Encoder`) processes each chunk through its transformer backbone, and the CLS token embedding from the final hidden layer is extracted as the chunk representation. Chunks are tokenized with a maximum sequence length of 512 tokens, with padding and truncation enabled to handle variable-length inputs. Embedding is performed in batches of 32 to balance memory utilization and throughput, with computation directed to Apple Silicon MPS acceleration where available.

All chunk embeddings are L2-normalized before indexing. The normalized vectors are stored in a FAISS flat inner-product index (`IndexFlatIP`), where inner product on L2-normalized vectors is equivalent to cosine similarity. A flat index was chosen over approximate nearest-neighbor structures (such as IVF or HNSW) because the corpus size (on the order of thousands of chunks for the 400-question subset) does not require approximate search, and exact search eliminates a potential source of retrieval variability in the experimental comparisons.

The resulting index and chunk metadata are persisted to disk, enabling the retrieval module to load them without re-embedding.

---

## 3.3 Retrieval Module

### 3.3.1 Two-Stage Retrieval Architecture

The retrieval module implements a two-stage retrieve-then-rerank pipeline, a standard architecture that balances recall (through fast dense search over the full index) with precision (through expensive but accurate cross-encoder scoring of a candidate set).

In the first stage, the user query is encoded using the MedCPT Query Encoder (`ncbi/MedCPT-Query-Encoder`), the counterpart to the article encoder used during indexing. The query embedding is L2-normalized and submitted to the FAISS index for inner-product search, retrieving the top-20 candidate passages ranked by cosine similarity.

In the second stage, the 20 candidates are re-scored using a cross-encoder model (`cross-encoder/ms-marco-MiniLM-L-6-v2`), a lightweight (6-layer, approximately 22 million parameters) model trained on the MS MARCO passage ranking dataset. Unlike the dual-encoder used in the first stage, which independently encodes queries and documents, the cross-encoder jointly attends to the query-passage pair, enabling richer interaction modeling at the cost of higher computational expense. The candidates are sorted by cross-encoder relevance score, and the top-5 passages are returned as the final retrieval set.

### 3.3.2 Rationale for Model Selection

MedCPT was selected as the dense encoder because it is trained specifically on biomedical literature using contrastive learning on PubMed query-article pairs, giving it strong domain alignment for the BioASQ task. Its asymmetric architecture, with separate query and document encoders, is well-suited to the retrieval setting where queries and passages differ substantially in length and style.

The cross-encoder reranker, while trained on the general-domain MS MARCO dataset, has been shown to generalize effectively to specialized domains when applied as a second-stage scorer over a domain-relevant candidate set. Its role is to correct ranking errors from the first-stage dense retrieval by applying deeper cross-attention between the query and each candidate passage.

### 3.3.3 Retrieval Parameters

The choice of k=20 for initial retrieval and k=5 for the final reranked set reflects a standard trade-off. The initial pool of 20 provides sufficient recall to capture most relevant passages (given that BioASQ questions typically reference fewer than 10 gold documents), while the final set of 5 keeps the language model's context window focused and reduces the probability that the generator must reason over excessively long or diluted evidence.

---

## 3.4 Perturbation Engine (Stress-Test Mechanisms)

The perturbation engine constitutes the core methodological contribution of this thesis. It implements three categories of controlled evidence corruption, each designed to probe a specific failure mode of the RAG pipeline. All perturbations operate on the retrieved passage set after retrieval and reranking, ensuring that the retrieval stage itself is not confounded by the perturbation.

### 3.4.1 Noise Injection

Noise injection tests the pipeline's ability to identify and rely on relevant evidence when irrelevant passages are mixed into the retrieval set. The perturbation replaces a controlled fraction of the retrieved passages with passages drawn from outside the current question's gold document set.

**Near-miss noise.** The default noise strategy selects replacement passages that are semantically related to the biomedical domain of the question but are not relevant to answering it. Specifically, near-miss chunks are drawn from passages associated with other BioASQ questions that share disease or topic keywords with the current question but whose PMIDs do not overlap with the current question's gold set. This design produces distractors that are topically plausible (for example, a passage about a different treatment for the same disease) and therefore harder for the generator to distinguish from genuinely relevant evidence, compared to purely random noise.

**Replacement strategy.** Passages are replaced from the bottom of the reranked list upward. That is, at a 30% noise level with 5 passages, the lowest-ranked passage (rank 5) is replaced first, then rank 4, and so on. After replacement, the passage list is shuffled to eliminate positional cues. Each replaced passage is annotated with metadata flags (`is_noise: true`, `noise_type: "near_miss"`) to enable downstream evaluation of the generator's behavior on noisy versus clean passages.

**Noise levels.** Three intensity levels are tested: 30% (1-2 of 5 passages replaced), 50% (2-3 replaced), and 70% (3-4 replaced). These levels span a range from mild corruption, where the majority of evidence remains intact, to severe corruption, where the generator must produce an answer from a predominantly irrelevant context.

### 3.4.2 Conflict Injection

Conflict injection tests whether the generator can detect and appropriately handle contradictory information within its evidence set. Unlike noise injection, which introduces irrelevant passages, conflict injection modifies existing relevant passages to assert the opposite of their original claims.

**LLM-based negation.** To generate plausible contradictions, the system uses the same LLaMA 3.1:8b model employed for answer generation, prompted with the following instruction:

> "Rewrite the following biomedical passage so that it contradicts its main claim. Keep the passage plausible, roughly the same length, and in a scientific tone. Do NOT add any explanation or preamble -- output only the rewritten passage."

This approach produces contradictions that preserve the scientific register, approximate length, and topical vocabulary of the original passage, making them difficult to detect through surface-level cues alone. The generation temperature is set to 0.7 (higher than the 0.3 used for answer generation) to encourage creative variation in the negation while remaining coherent.

**Targeting strategy.** Conflict injection targets the highest-ranked passages first (rank 1, then rank 2, and so on), because these passages are most likely to contain answer-bearing content based on the cross-encoder's relevance scores. By negating the most confident retrievals, the perturbation maximally challenges the generator's ability to resolve contradictions.

**Conflict ratios.** Two levels are tested: 50% (half of the passages negated) and 70% (a strong majority negated). At the 50% level, the generator faces an evenly split evidence set where supporting and contradicting passages are balanced. At 70%, the preponderance of evidence actively contradicts the correct answer, testing whether the model defaults to majority vote or can identify the minority of consistent passages.

Each negated passage retains its original text in an `original_text` field and is flagged with `is_conflict: true`, enabling post-hoc analysis of whether the generator cited conflicting versus original passages.

### 3.4.3 Unanswerable Question Simulation

The unanswerable condition tests whether the pipeline can recognize when the evidence is insufficient to answer the question and abstain rather than hallucinate. This is achieved by selectively removing answer-bearing passages from the retrieval set.

**Answer-bearing identification.** A passage is classified as answer-bearing if its source PMID matches any of the PMIDs referenced in the question's gold evidence snippets. This heuristic leverages the BioASQ annotation structure, where gold snippets are drawn from specific PubMed articles, and assumes that passages from those articles are likely to contain the information needed to answer the question.

**Removal modes.** Two levels of evidence removal are tested:

- *Full removal*: All passages identified as answer-bearing are removed from the retrieval set. The generator receives only passages whose source documents are not referenced in the gold annotations, simulating a scenario where the corpus entirely lacks the needed evidence.
- *Partial removal*: Approximately half of the answer-bearing passages are removed. This simulates a scenario where evidence is degraded but not entirely absent, testing whether the generator can still produce a correct answer from reduced evidence or appropriately hedges its confidence.

Removed passages are annotated with `was_removed: true` for evaluation purposes. Unlike noise and conflict conditions, the unanswerable condition may reduce the total number of passages presented to the generator (rather than substituting replacements), reflecting a realistic scenario where a retriever simply fails to surface relevant documents.

### 3.4.4 Baseline (Clean Condition)

All perturbation conditions are compared against a clean baseline in which the top-5 reranked passages are passed to the generator without modification. This baseline represents the pipeline's best-case performance given its retrieval components and serves as the reference point for measuring degradation under each stress condition.

### 3.4.5 Summary of Experimental Conditions

| Condition | Code | Description | Passages Affected |
|-----------|------|-------------|-------------------|
| Clean baseline | `clean` | No perturbation | 0 of 5 |
| Low noise | `noise_30` | 30% replaced with near-miss | 1-2 of 5 |
| Medium noise | `noise_50` | 50% replaced with near-miss | 2-3 of 5 |
| High noise | `noise_70` | 70% replaced with near-miss | 3-4 of 5 |
| Balanced conflict | `conflict_50` | 50% of top passages negated | 2-3 of 5 |
| Majority conflict | `conflict_70` | 70% of top passages negated | 3-4 of 5 |
| Partial removal | `unanswerable_partial` | ~50% answer-bearing passages removed | Variable |
| Full removal | `unanswerable_full` | All answer-bearing passages removed | Variable |

---

## 3.5 Generation Module

### 3.5.1 Language Model

Answer generation is performed by LLaMA 3.1:8b Instruct, a general-purpose large language model with 8 billion parameters, served locally through the Ollama inference framework. Local deployment was chosen to ensure full control over the generation environment, eliminate API cost and rate-limit constraints, and guarantee reproducibility by fixing the model version and inference parameters.

The 8-billion parameter scale was selected as a deliberate design choice: it is large enough to follow complex instructions and produce coherent biomedical text, yet small enough to run on consumer hardware, making the experimental setup reproducible without access to high-performance computing clusters. Using a moderately sized model also provides a more realistic baseline for studying robustness, as larger models may partially compensate for evidence corruption through stronger parametric knowledge.

### 3.5.2 Prompting Strategy

The generator uses a structured prompting approach designed to maximize faithfulness to the retrieved evidence and enable automated evaluation of citation behavior. The system prompt establishes the model's role and constraints:

> "You are a biomedical question-answering assistant. Answer the question using ONLY the provided passages. Cite passages by number [1], [2], etc. If the passages do not contain enough information to answer, say 'I cannot answer this question based on the provided evidence.' Be concise and precise."

The user prompt presents the retrieved passages in a numbered format, followed by the question:

```
Passages:
[1] {Title 1}
{Passage text 1}

[2] {Title 2}
{Passage text 2}

...

Question: {query}

Answer (cite passages by number):
```

This prompt design serves several methodological purposes. First, the instruction to answer "ONLY" from provided passages constrains the model to rely on the retrieval output, making any generation errors attributable to the evidence quality rather than the model's parametric knowledge. Second, the explicit citation format (`[1]`, `[2]`, etc.) enables automated extraction of which passages the model referenced, supporting citation precision metrics. Third, the fallback instruction for insufficient evidence provides a measurable signal for the unanswerable condition: a robust system should produce this abstention phrase when answer-bearing passages have been removed.

### 3.5.3 Generation Parameters

The generation temperature is set to 0.3, a deliberately low value that favors deterministic, faithful reproduction of passage content over creative generation. This choice prioritizes citation accuracy and answer consistency across experimental runs, reducing stochastic variation that could confound the perturbation analysis. The maximum output length is set to 512 tokens, sufficient for concise answers with citations across all four question types.

### 3.5.4 Citation Extraction

After generation, citations are automatically extracted from the answer text using a regular expression pattern that matches bracketed integers (`[N]`). The extracted citation indices are deduplicated and sorted, producing a list of passage references that can be compared against the gold evidence set and used to compute citation precision metrics.

When no passages are provided (as may occur under the full unanswerable condition), the generator bypasses the language model entirely and returns the standard abstention phrase, avoiding unnecessary computation and ensuring a consistent abstention signal.

---

## 3.6 Evaluation Framework

The evaluation framework implements a multi-level assessment strategy that separately measures retrieval quality, generation faithfulness, and task-specific answer correctness. This decomposition is essential for the stress-testing objective: it enables the study to distinguish between cases where perturbation degrades retrieval (the system surfaces wrong passages) versus generation (the system has adequate evidence but produces a poor answer).

### 3.6.1 Retrieval Metrics

Retrieval quality is assessed by comparing the PMIDs of retrieved passages against the gold PMIDs provided in the BioASQ annotations. Four standard information retrieval metrics are computed:

**Mean Average Precision at k (MAP@k).** For each question, average precision is computed as the mean of precision values calculated at each rank position where a relevant document appears. Formally, for a ranked list of k retrieved documents:

AP@k = (1 / min(|R|, k)) * sum_{i=1}^{k} P(i) * rel(i)

where P(i) is the precision at rank i, rel(i) is a binary relevance indicator, and |R| is the total number of relevant documents. MAP@k is then the mean of AP@k across all questions. This metric rewards systems that place relevant documents at higher ranks and penalizes those that intermix irrelevant results.

**Mean Reciprocal Rank at k (MRR@k).** The reciprocal rank is 1/r where r is the rank of the first relevant document within the top-k results. MRR@k averages this across questions. This metric captures how quickly a user (or downstream model) encounters the first piece of useful evidence.

**Normalized Discounted Cumulative Gain at k (nDCG@k).** This metric applies a logarithmic discount to relevance scores based on position:

DCG@k = sum_{i=1}^{k} rel(i) / log_2(i + 1)

normalized by the ideal DCG (IDCG) where all relevant documents appear at the top of the ranking. Binary relevance is used (relevant = 1, irrelevant = 0), as the BioASQ gold annotations do not provide graded relevance judgments.

**Precision at k.** The fraction of retrieved passages in the top-k whose PMIDs appear in the gold set. While simpler than the rank-aware metrics above, precision at k provides an intuitive measure of the proportion of useful evidence in the generator's input.

All retrieval metrics are computed with k=5, matching the number of passages passed to the generator. Under perturbation conditions, these metrics are computed on the perturbed passage set, capturing how the perturbation has altered the effective retrieval quality from the generator's perspective.

### 3.6.2 Groundedness Metrics (NLI-Based)

Groundedness metrics assess whether the generated answer is faithful to the provided evidence, regardless of whether that evidence is correct. This distinction is critical for the stress-testing objective: under conflict injection, a high groundedness score for an incorrect answer would indicate that the model faithfully followed contradictory evidence rather than hallucinating independently.

Groundedness is measured using Natural Language Inference (NLI), specifically the `cross-encoder/nli-deberta-v3-base` model, which classifies sentence pairs into three categories: entailment, contradiction, and neutral.

The evaluation proceeds as follows:

1. **Sentence segmentation.** The generated answer is split into individual sentences using regex-based boundary detection on period, question mark, and exclamation mark characters. Sentences shorter than 10 characters are filtered as likely fragments.

2. **Pairwise NLI scoring.** Each answer sentence is paired with each retrieved passage, and the NLI model produces a three-class probability distribution (contradiction, entailment, neutral) for each pair.

3. **Support determination.** An answer sentence is classified as "supported" if its entailment probability exceeds 0.5 for at least one passage in the retrieval set.

Three groundedness metrics are derived from these scores:

**Supported Claim Rate (SCR).** The proportion of answer sentences that are entailed by at least one passage. A high SCR indicates that the generator's claims are grounded in the evidence; a low SCR suggests hallucination or unsupported extrapolation.

**Citation Precision (CP).** The proportion of retrieved passages that entail at least one answer sentence. This metric captures whether the passages cited (or available to the model) actually contribute to the answer, as opposed to being present but ignored.

**Average Entailment Score.** The mean entailment probability across all sentence-passage pairs, providing a continuous measure of overall evidence-answer alignment.

### 3.6.3 Task-Specific Metrics

Task metrics evaluate answer correctness against the BioASQ gold standard, with different metrics appropriate for each question type:

**Yes/No questions:** Accuracy, computed by extracting a "yes" or "no" prediction from the generated answer (case-insensitive keyword match) and comparing it to the gold label. Answers containing neither keyword are classified as "unknown" and scored as incorrect.

**Factoid questions:** Strict accuracy, computed by normalizing both the generated answer and the gold answer(s) (lowercasing, removing punctuation, collapsing whitespace) and checking whether any gold answer appears as a substring within the normalized generated text.

**List questions:** F1 score, computed over synonym groups. The BioASQ gold standard provides lists of acceptable answers organized into synonym groups (e.g., ["drug1", "drug_1"] as a single expected item). Precision is the fraction of expected items found in the generated answer; recall is computed symmetrically; F1 is their harmonic mean.

**Summary questions:** ROUGE scores (ROUGE-1, ROUGE-2, ROUGE-L), measuring unigram overlap, bigram overlap, and longest common subsequence between the generated summary and the gold ideal answer, respectively. ROUGE-L F1 is used as the primary summary metric, as it captures fluency and content coverage without requiring exact n-gram matches.

### 3.6.4 Per-Question and Aggregate Evaluation

All metrics are computed at the per-question level, producing a complete evaluation profile for each question under each experimental condition. Aggregate statistics are then computed by grouping results along two axes:

- **By condition:** Averaging metrics across all questions within each perturbation condition (e.g., mean MAP@k for all questions under `noise_50`) to quantify the overall impact of each stress level.
- **By question type:** Averaging within each BioASQ question type to determine whether certain question types (e.g., yes/no versus summary) are more or less vulnerable to evidence corruption.

These aggregate views are computed using null-safe averaging that gracefully handles cases where individual metrics could not be computed (for example, when a question lacks gold PMIDs for retrieval evaluation).

---

## 3.7 Experimental Design

### 3.7.1 Controlled Comparison Structure

The experimental design follows a within-subjects structure: each question in the 400-question subset is evaluated under all eight conditions (one clean baseline plus seven perturbation conditions). This design ensures that differences between conditions are not confounded by differences in question difficulty, because every question serves as its own control.

For a given question, the retrieval stage is executed once, producing a single set of top-20 FAISS candidates and top-5 reranked passages. Each perturbation condition is then applied independently to this same retrieved set, and the perturbed passages are forwarded to the generator and evaluator. This single-retrieval design isolates the perturbation effect from retrieval stochasticity, ensuring that any metric differences between conditions reflect the perturbation rather than variation in FAISS search results.

### 3.7.2 Stress-Level Sweep

The perturbation conditions are organized as a sweep across three orthogonal dimensions:

| Dimension | Levels | Research Question |
|-----------|--------|-------------------|
| Noise intensity | 30%, 50%, 70% | How does answer quality degrade as the proportion of irrelevant evidence increases? |
| Conflict ratio | 50%, 70% | Can the model resolve contradictions, and does it default to the majority claim? |
| Evidence removal | Partial, Full | Does the model abstain when evidence is insufficient, or does it hallucinate? |

This sweep enables dose-response analysis within each perturbation category: by plotting metrics against perturbation intensity, the study can characterize whether degradation is linear, threshold-based, or catastrophic.

### 3.7.3 Comparison Axes

The experimental results are analyzed along three primary comparison axes:

1. **Clean versus perturbed:** Quantifying the absolute drop in each metric from baseline to each perturbation condition, establishing the magnitude of degradation.
2. **Retrieval versus generation degradation:** Comparing retrieval metrics (MAP@k, MRR@k, nDCG@k) against generation metrics (groundedness, task scores) to determine whether degradation originates in the evidence set or in the model's reasoning over corrupted evidence.
3. **Across question types:** Examining whether factoid, yes/no, list, and summary questions exhibit different vulnerability profiles, potentially revealing that certain reasoning modes are more robust to evidence corruption than others.

---

## 3.8 Implementation Details

### 3.8.1 Software Stack

The system is implemented in Python and JavaScript/TypeScript across the following components:

**Backend pipeline:** Python with PyTorch for model inference, FAISS for vector indexing and search, the Hugging Face `transformers` library for MedCPT and cross-encoder model loading, `sentence-transformers` for cross-encoder scoring, and `rouge-score` for ROUGE metric computation.

**Language model serving:** Ollama, an open-source local LLM inference server, hosts the LLaMA 3.1:8b Instruct model. Communication with Ollama uses the `ollama` Python client library.

**API layer:** FastAPI serves the pipeline as a RESTful API with 11 endpoints covering individual pipeline stages (retrieve, perturb, generate, evaluate), the full end-to-end pipeline, multi-condition comparison, batch processing, and experiment history retrieval. Experiment results are persisted in a SQLite database for historical analysis and aggregation.

**Frontend:** A Next.js dashboard built with React, Tailwind CSS, shadcn/ui components, and Recharts for data visualization provides an interactive interface for running experiments, examining evidence passages with perturbation annotations, and comparing metrics across conditions. Global state is managed with Zustand.

### 3.8.2 Reproducibility Considerations

Several design decisions support experimental reproducibility:

- **Local model hosting.** Running LLaMA 3.1:8b locally through Ollama ensures that results are not affected by API provider model updates, versioning changes, or server-side configuration differences.
- **Low generation temperature.** A temperature of 0.3 reduces stochastic variation in generated answers, improving consistency across repeated runs of the same experiment.
- **Deterministic retrieval.** The FAISS flat index performs exact nearest-neighbor search, eliminating the approximation noise introduced by graph-based or quantized indices.
- **Persistent caching.** PubMed abstracts are cached locally in JSON format, ensuring that the corpus remains stable even if the PubMed API returns updated abstracts in later requests.
- **Experiment logging.** Every pipeline execution is recorded in SQLite with full metadata (question, condition, passages, answer, metrics, duration), enabling post-hoc analysis and verification of results.
- **Single-retrieval design.** Performing retrieval once per question and reusing the results across conditions eliminates retrieval-level confounds from the perturbation analysis.

---

## 3.9 Summary of Methodological Contributions

This methodology makes three primary contributions to the evaluation of RAG systems:

**First, a systematic stress-testing framework for RAG robustness.** While prior work has evaluated RAG systems on standard benchmarks, this study introduces a controlled perturbation engine that applies noise, conflict, and evidence removal at calibrated intensity levels. The modular design allows each perturbation to be applied independently to the same retrieved evidence, enabling precise attribution of performance degradation to specific failure modes.

**Second, domain-grounded adversarial perturbation strategies.** The near-miss noise injection strategy produces semantically plausible distractors drawn from the same biomedical domain rather than random text, providing a more realistic and challenging test of retrieval robustness. The LLM-based conflict injection generates scientifically toned contradictions that preserve passage structure and vocabulary, testing the model's ability to reason about logical consistency rather than surface-level anomalies. These strategies go beyond simple random corruption to simulate the kinds of evidence quality issues that arise in real-world biomedical information retrieval.

**Third, multi-level evaluation decomposing retrieval, groundedness, and task performance.** The evaluation framework separately measures whether the system retrieves the right evidence (retrieval metrics), whether it faithfully uses the evidence it receives (NLI-based groundedness), and whether it produces correct answers (task-specific metrics). This decomposition enables nuanced analysis of failure cascades: for instance, distinguishing a system that retrieves well but generates poorly under conflict from one that fails at both levels. By extending the BioASQ benchmark into a robustness evaluation setting, this methodology provides a reusable framework for assessing RAG systems under adversarial conditions across domains.
