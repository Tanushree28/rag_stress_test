"use strict";
const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, Header, Footer, TableOfContents,
} = require("docx");

// ── Colour palette ──────────────────────────────────────────────────────────
const NAVY   = "1A3A5C";
const TEAL   = "00B4D8";
const LIGHT  = "E8F4F8";
const LIGHT2 = "FFF8E8";
const GRAY   = "F3F4F6";
const MUTED  = "64748B";
const BLACK  = "1E293B";
const WHITE  = "FFFFFF";

// ── Helpers ─────────────────────────────────────────────────────────────────
const thin = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: thin, bottom: thin, left: thin, right: thin };
const noBorder = { style: BorderStyle.NONE, size: 0, color: WHITE };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, font: "Arial", size: 36, bold: true, color: NAVY })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 100 },
    children: [new TextRun({ text, font: "Arial", size: 28, bold: true, color: NAVY })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: BLACK, ...opts })],
  });
}

function bodyRuns(runs) {
  return new Paragraph({
    spacing: { after: 120 },
    children: runs.map(r => new TextRun({ font: "Arial", size: 22, color: BLACK, ...r })),
  });
}

function mono(text) {
  return new Paragraph({
    spacing: { after: 80 },
    indent: { left: 720 },
    children: [new TextRun({ text, font: "Courier New", size: 20, color: "2D6A4F" })],
  });
}

function bullet(text, bold_prefix = null) {
  const children = bold_prefix
    ? [new TextRun({ text: bold_prefix + " ", font: "Arial", size: 22, bold: true, color: BLACK }),
       new TextRun({ text, font: "Arial", size: 22, color: BLACK })]
    : [new TextRun({ text, font: "Arial", size: 22, color: BLACK })];
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80 },
    children,
  });
}

function spacer(sz = 200) {
  return new Paragraph({ spacing: { after: sz }, children: [new TextRun("")] });
}

function divider() {
  return new Paragraph({
    spacing: { before: 160, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL, space: 1 } },
    children: [new TextRun("")],
  });
}

// Shaded example box (single-row table)
function exampleBox(label, content, fill = LIGHT) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 9360, type: WidthType.DXA },
            shading: { fill, type: ShadingType.CLEAR },
            margins: { top: 100, bottom: 100, left: 160, right: 160 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [new TextRun({ text: label, font: "Arial", size: 20, bold: true, color: NAVY })],
              }),
              new Paragraph({
                spacing: { after: 0 },
                children: [new TextRun({ text: content, font: "Arial", size: 20, color: BLACK })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// Two-column definition row
function defRow(term, definition) {
  return new TableRow({
    children: [
      new TableCell({
        borders,
        width: { size: 2400, type: WidthType.DXA },
        shading: { fill: GRAY, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: term, font: "Arial", size: 22, bold: true, color: NAVY })],
        })],
      }),
      new TableCell({
        borders,
        width: { size: 6960, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({
          children: [new TextRun({ text: definition, font: "Arial", size: 22, color: BLACK })],
        })],
      }),
    ],
  });
}

function defTable(rows) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [2400, 6960],
    rows: rows.map(([t, d]) => defRow(t, d)),
  });
}

// ── Document ─────────────────────────────────────────────────────────────────
const sections_children = [];

// ── COVER ──
sections_children.push(
  spacer(1200),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({ text: "RAG Stress-Test Thesis", font: "Arial", size: 52, bold: true, color: NAVY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 160 },
    children: [new TextRun({ text: "Glossary of Key Terms & Metrics", font: "Arial", size: 36, color: TEAL })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    children: [new TextRun({ text: "Plain-language explanations with examples and formulas", font: "Arial", size: 24, color: MUTED, italics: true })],
  }),
  spacer(80),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
    children: [new TextRun({ text: "BioASQ Challenge 13b  |  LLaMA 3.1:8b via Ollama  |  MedCPT Embeddings", font: "Arial", size: 22, color: MUTED })],
  }),
  spacer(600),
  divider(),
);

// ── SECTION 1 — What is RAG? ──────────────────────────────────────────────
sections_children.push(
  h1("1. What is RAG?"),
  body("RAG stands for Retrieval-Augmented Generation. Instead of relying only on what a language model memorised during training, RAG first searches a document collection for relevant passages, then feeds those passages to the model as evidence when generating an answer. This makes answers more accurate, more current, and easier to verify."),
  spacer(80),
  body("Why RAG matters for biomedicine: medical knowledge changes fast, errors are high-stakes, and clinicians need to know which source backs each claim. RAG provides that traceability."),
  spacer(120),
  h2("The 5-Stage Pipeline"),
  defTable([
    ["S1  Corpus Builder",  "Loads BioASQ questions, fetches PubMed abstracts via NCBI, splits them into chunks of 256 tokens, embeds each chunk with MedCPT, and indexes them in FAISS."],
    ["S2  Retriever",       "Encodes the question with MedCPT, does a fast approximate search in FAISS (top-100), then reranks with a cross-encoder model to keep the top-5 most relevant passages."],
    ["S3  Perturbation Engine", "Deliberately corrupts the retrieved passages to simulate real-world noise, contradictory evidence, or missing evidence. Used to stress-test the pipeline."],
    ["S4  Generator",       "Sends the question plus the (possibly perturbed) passages to LLaMA 3.1:8b running locally via Ollama. The model must cite passages with [1], [2], etc."],
    ["S5  Evaluator",       "Scores the final answer using retrieval metrics, groundedness metrics, and task-specific metrics. Results are stored in SQLite and shown on the dashboard."],
  ]),
  spacer(200),
  divider(),
);

// ── SECTION 2 — Retrieval Metrics ─────────────────────────────────────────
sections_children.push(
  h1("2. Retrieval Metrics"),
  body("All four metrics share a common setup: the system returns a ranked list of passages (top-k, where k = 5 in this project), and we know which PMIDs are the true relevant documents for each question. The metrics measure how well the ranked list matches those gold documents."),
  spacer(80),
  body("Running example used below: k = 5, and there are 2 relevant documents in the corpus. The system returns this ranked list:"),
  spacer(60),
  exampleBox("Ranked result list", "Position 1: RELEVANT\nPosition 2: not relevant\nPosition 3: RELEVANT\nPosition 4: not relevant\nPosition 5: not relevant"),
  spacer(160),

  h2("MAP@k  —  Mean Average Precision at k"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "whether relevant documents appear near the top of the list. A relevant document at rank 1 scores much better than the same document at rank 4." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("AP = (1 / R) * sum of (hits_so_far / rank_i)   for every rank where a relevant doc appears"),
  mono("MAP = average AP over all questions in the test set"),
  mono("R = total number of relevant documents for that question"),
  spacer(80),
  body("Step-by-step for our example  (R = 2):", { bold: true }),
  bullet("Rank 1 is relevant: hits_so_far = 1  =>  precision = 1/1 = 1.000"),
  bullet("Rank 2 is not relevant: skip"),
  bullet("Rank 3 is relevant: hits_so_far = 2  =>  precision = 2/3 = 0.667"),
  bullet("AP = (1/2) * (1.000 + 0.667) = 0.833"),
  spacer(80),
  exampleBox("Interpretation", "MAP@5 = 0.83 means on average the system places relevant documents very close to the top. MAP@5 = 0.40 would mean relevant documents are scattered further down. Range: 0 to 1, higher is better.", LIGHT),
  spacer(160),

  h2("MRR@k  —  Mean Reciprocal Rank at k"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "how quickly the first relevant document appears. If you only ever look at the top result, this is the metric for you." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("RR = 1 / rank_of_first_relevant_document   (or 0 if none in top-k)"),
  mono("MRR = average RR over all questions"),
  spacer(80),
  body("Example:", { bold: true }),
  bullet("First relevant document is at rank 1  =>  RR = 1/1 = 1.00"),
  bullet("If it had been at rank 3  =>  RR = 1/3 = 0.33"),
  bullet("If no relevant document in top-5  =>  RR = 0.00"),
  spacer(80),
  exampleBox("Interpretation", "MRR is fast to compute and easy to explain. Noise injection in this project reduces MRR because near-miss passages push relevant documents down the ranking. Range: 0 to 1, higher is better.", LIGHT),
  spacer(160),

  h2("nDCG@k  —  Normalized Discounted Cumulative Gain at k"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "the quality of the full ranked list. It rewards finding relevant documents early and penalises finding them late, using a logarithmic discount." }]),
  spacer(80),
  body("Formula (binary relevance: 1 = relevant, 0 = not):", { bold: true }),
  mono("DCG  = sum of  rel_i / log2(rank_i + 1)   for i = 1..k"),
  mono("IDCG = DCG of the ideal order (all relevant docs placed first)"),
  mono("nDCG = DCG / IDCG"),
  spacer(80),
  body("Step-by-step for our example  (result list: [1, 0, 1, 0, 0]):", { bold: true }),
  bullet("Rank 1 (relevant):  1.0 / log2(2) = 1.0 / 1.000 = 1.000"),
  bullet("Rank 2 (not rel):   0.0 / log2(3) = 0.000"),
  bullet("Rank 3 (relevant):  1.0 / log2(4) = 1.0 / 2.000 = 0.500"),
  bullet("DCG = 1.000 + 0 + 0.500 = 1.500"),
  bullet("IDCG (ideal [1,1,0,0,0]): 1/log2(2) + 1/log2(3) = 1.000 + 0.631 = 1.631"),
  bullet("nDCG = 1.500 / 1.631 = 0.920"),
  spacer(80),
  exampleBox("Interpretation", "nDCG is sensitive to the exact position of every relevant document, not just the first one. This makes it a richer signal than MRR for multi-document questions. Range: 0 to 1, higher is better.", LIGHT),
  spacer(160),

  h2("Precision@k"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "what fraction of the top-k passages are actually relevant. Simple and easy to read off a results table." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("P@k = (number of relevant documents in top-k) / k"),
  spacer(80),
  body("Example:", { bold: true }),
  bullet("2 relevant documents in top-5  =>  P@5 = 2/5 = 0.40"),
  spacer(80),
  exampleBox("Interpretation", "At 70% noise, P@5 drops because noise passages crowd out relevant ones. P@5 = 0.40 at clean and P@5 = 0.10 at noise-70 means the retriever found on average only 0.5 relevant passages instead of 2. Range: 0 to 1, higher is better.", LIGHT),
  spacer(200),
  divider(),
);

// ── SECTION 3 — Groundedness Metrics ─────────────────────────────────────
sections_children.push(
  h1("3. Groundedness Metrics"),
  body("These metrics measure whether the generated answer is supported by the retrieved passages. They use a separate NLI (Natural Language Inference) model — cross-encoder/nli-deberta-v3-base — that takes a (passage, sentence) pair and outputs three probabilities: entailment, neutral, contradiction."),
  spacer(80),
  exampleBox(
    "How NLI scoring works",
    "Passage:  \"Aspirin inhibits platelet aggregation by blocking COX-1.\"\n" +
    "Answer sentence:  \"Aspirin reduces platelet clumping.\"\n\n" +
    "NLI model output:  entailment = 0.82,  neutral = 0.14,  contradiction = 0.04\n" +
    "=> entailment > 0.5 threshold, so this sentence is SUPPORTED.",
    LIGHT2
  ),
  spacer(160),

  h2("SCR  —  Supported Claim Rate"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "what fraction of the sentences in the generated answer are actually backed by at least one retrieved passage. This is the primary hallucination detector." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("For each answer sentence:"),
  mono("  max_score = max(entailment probability across all 5 passages)"),
  mono("  supported = True  if max_score > 0.5"),
  mono("SCR = supported_sentences / total_answer_sentences"),
  spacer(80),
  body("Example:", { bold: true }),
  bullet("Answer has 4 sentences. After checking each against all 5 passages:"),
  bullet("Sentences 1, 2, 4 each have at least one passage with entailment > 0.5"),
  bullet("Sentence 3 has max entailment = 0.31 (not supported)"),
  bullet("SCR = 3 / 4 = 0.75"),
  spacer(80),
  exampleBox("Interpretation", "SCR = 0.75 means 75% of the answer's claims are traceable to retrieved evidence. Under unanswerable conditions where all evidence is removed, SCR drops sharply because the model is forced to hallucinate. Baseline SCR in this project is ~0.168 (16.8%), which shows how often the model already generates unsupported claims even under clean conditions. Range: 0 to 1, higher is better.", LIGHT),
  spacer(160),

  h2("Citation Precision"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "what fraction of the retrieved passages actually contribute to the answer. A passage that does not entail any answer sentence is \"dead weight\" in the context window." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("For each retrieved passage:"),
  mono("  supporting = True  if max(entailment score across all answer sentences) > 0.5"),
  mono("Citation Precision = supporting_passages / total_retrieved_passages"),
  spacer(80),
  body("Example:", { bold: true }),
  bullet("5 passages retrieved. Passages 1, 2, 4 entail at least one sentence in the answer."),
  bullet("Passages 3 and 5 do not entail any sentence."),
  bullet("Citation Precision = 3 / 5 = 0.60"),
  spacer(80),
  exampleBox("Interpretation", "Low Citation Precision means the retriever is returning passages that the model either ignores or cannot use. Under conflict conditions, this drops because negated passages contradict the answer instead of supporting it. Range: 0 to 1, higher is better.", LIGHT),
  spacer(160),

  h2("Average Entailment Score"),
  bodyRuns([{ text: "What it captures: " , bold: true }, { text: "the mean NLI entailment probability across every (answer sentence, passage) pair. It is a softer, continuous version of SCR." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("Avg Entailment = mean of all NLI entailment probabilities for all (sentence, passage) pairs"),
  spacer(80),
  exampleBox("Note on baseline", "The baseline average entailment score is ~0.17 (17%). This seems low, but is expected: most (sentence, passage) pairs are unrelated (neutral), so the entailment class rarely dominates. The metric is most useful for relative comparisons across conditions, not as an absolute quality score.", LIGHT2),
  spacer(200),
  divider(),
);

// ── SECTION 4 — Task-Specific Metrics ───────────────────────────────────
sections_children.push(
  h1("4. Task-Specific Metrics"),
  body("BioASQ has four question types, each with a different expected answer format. A single metric cannot serve all four, so each type uses the metric most appropriate for its format. The composite number reported as Task Score is whichever of the four applies to each question."),
  spacer(120),

  h2("Yes/No  —  Accuracy"),
  bodyRuns([{ text: "Question format: " , bold: true }, { text: "\"Is drug X effective for condition Y?\" Answer is either yes or no." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("Accuracy = 1.0  if predicted_label == gold_label"),
  mono("         = 0.0  otherwise"),
  spacer(80),
  body("The system extracts the label by scanning the answer text for the words \"yes\" or \"no\". If neither appears, label defaults to \"unknown\" and the score is 0."),
  exampleBox("Example", "Gold answer: yes\nGenerated answer: \"Yes, aspirin has been shown to reduce platelet aggregation.\"\nExtracted label: yes  =>  Accuracy = 1.0", LIGHT),
  spacer(160),

  h2("Factoid  —  Strict Accuracy"),
  bodyRuns([{ text: "Question format: " , bold: true }, { text: "\"What gene is mutated in familial hypercholesterolaemia?\" Answer is a specific entity (gene name, drug name, protein, etc.)." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("Normalise: lowercase, remove punctuation, collapse whitespace"),
  mono("Strict Accuracy = 1.0  if any gold entity appears (normalised) in the normalised answer"),
  mono("               = 0.0  otherwise"),
  spacer(80),
  exampleBox("Example", "Gold answers: [\"LDLR\", \"LDL receptor\"]\nGenerated: \"The LDLR gene encodes the LDL receptor.\"\nNormalised check: 'ldlr' in answer?  YES  =>  Strict Accuracy = 1.0", LIGHT),
  spacer(160),

  h2("List  —  List F1"),
  bodyRuns([{ text: "Question format: " , bold: true }, { text: "\"Name three drugs used to treat Type 2 diabetes.\" Answer is a set of entities." }]),
  spacer(80),
  body("Formula:", { bold: true }),
  mono("TP = items from the gold list found in the generated answer"),
  mono("Precision = TP / len(predicted_items)"),
  mono("Recall    = TP / len(gold_items)"),
  mono("F1        = 2 * Precision * Recall / (Precision + Recall)"),
  spacer(80),
  exampleBox("Example",
    "Gold list:  [metformin, sitagliptin, glipizide]\n" +
    "Generated:  [metformin, sitagliptin, insulin]\n\n" +
    "TP = 2  (metformin + sitagliptin match)\n" +
    "Precision = 2/3 = 0.667    Recall = 2/3 = 0.667    F1 = 0.667",
    LIGHT),
  spacer(160),

  h2("Summary  —  ROUGE-L"),
  bodyRuns([{ text: "Question format: " , bold: true }, { text: "\"Summarise the mechanism of action of aspirin.\" Answer is a free-text paragraph." }]),
  spacer(80),
  bodyRuns([{ text: "ROUGE " , bold: true }, { text: "(Recall-Oriented Understudy for Gisting Evaluation) measures text overlap between the generated summary and a gold reference summary." }]),
  spacer(80),
  body("ROUGE-L specifically uses Longest Common Subsequence (LCS):", { bold: true }),
  mono("Precision = LCS_length / generated_length"),
  mono("Recall    = LCS_length / reference_length"),
  mono("ROUGE-L F = 2 * P * R / (P + R)"),
  spacer(80),
  exampleBox("Example",
    "Gold:      \"aspirin reduces fever by inhibiting prostaglandin synthesis\"\n" +
    "Generated: \"aspirin can reduce fever via prostaglandin inhibition\"\n\n" +
    "LCS: aspirin [_] reduce[s] fever [_] [_] prostaglandin [_]\n" +
    "LCS length = 4 key words  (out of 7 gold, 7 generated)\n" +
    "ROUGE-L F  = 2 * (4/7) * (4/7) / ((4/7)+(4/7))  approx 0.57",
    LIGHT),
  spacer(120),

  h2("Task Score  (composite)"),
  body("Task Score is not a new formula. It is simply whichever of the four metrics above applies to the current question type:"),
  defTable([
    ["Yes/No question",   "Task Score = Accuracy (0 or 1)"],
    ["Factoid question",  "Task Score = Strict Accuracy (0 or 1)"],
    ["List question",     "Task Score = List F1 (0 to 1)"],
    ["Summary question",  "Task Score = ROUGE-L F-measure (0 to 1)"],
  ]),
  spacer(120),
  exampleBox("Why a composite?", "The thesis runs all four question types in every condition. Task Score gives a single headline number per experiment row so conditions can be compared on one axis, while the full breakdown by type is available in the analytics heatmap.", LIGHT2),
  spacer(200),
  divider(),
);

// ── SECTION 5 — Perturbation Conditions ──────────────────────────────────
sections_children.push(
  h1("5. Perturbation Conditions"),
  body("Three families of adversarial conditions are applied to the retrieved passages before they reach the generator. Each condition has a \"clean\" baseline for comparison."),
  spacer(120),

  h2("Clean  (baseline)"),
  body("No changes to retrieved passages. The system runs as designed. All metric values at clean represent the true capability of the pipeline."),
  spacer(160),

  h2("Noise Injection  —  30%, 50%, 70%"),
  bodyRuns([{ text: "What it does: " , bold: true }, { text: "replaces a percentage of the 5 retrieved passages with passages that are not relevant to the question." }]),
  spacer(80),
  defTable([
    ["noise_30", "Replace 1 of 5 passages with noise (30%)"],
    ["noise_50", "Replace 2–3 of 5 passages with noise (50%)"],
    ["noise_70", "Replace 3–4 of 5 passages with noise (70%)"],
  ]),
  spacer(120),
  body("Two types of noise passage:"),
  bullet("Near-miss: passage from another BioASQ question that shares disease keywords with the query. It looks plausible but does not answer the question.", "Near-miss"),
  bullet("Irrelevant: random PubMed chunk with no keyword overlap with the query at all.", "Irrelevant"),
  spacer(100),
  exampleBox("Example",
    "Query: \"What is the mechanism of action of metformin?\"\n\n" +
    "Clean top-5: [metformin mechanism [rel], metformin dosage [rel], metformin diabetes [rel], metformin safety [rel], metformin review [rel]]\n\n" +
    "Noise-70 top-5: [metformin mechanism [rel], statin mechanism [near-miss], random cardiology abstract [irrelevant], random nephrology abstract [irrelevant], random oncology abstract [irrelevant]]\n\n" +
    "The generator must find the one relevant passage among mostly noise.",
    LIGHT),
  spacer(100),
  body("What noise tests: can the retriever + generator find and use the relevant passages when the context window is diluted with irrelevant content?"),
  spacer(160),

  h2("Conflict Injection  —  50/50 and 70/30"),
  bodyRuns([{ text: "What it does: " , bold: true }, { text: "replaces a percentage of the top-ranked relevant passages with versions that contradict their main claim. The conflicting versions are generated by LLaMA 3.1:8b itself." }]),
  spacer(80),
  defTable([
    ["conflict_50", "50% of the top passages are replaced with LLaMA-negated versions"],
    ["conflict_70", "70% of the top passages are replaced with LLaMA-negated versions"],
  ]),
  spacer(120),
  body("The negation prompt sent to LLaMA:"),
  mono("\"Rewrite the following biomedical passage to contradict its main claim"),
  mono("while keeping the same topic and surface form.\""),
  spacer(80),
  exampleBox("Example",
    "Original:  \"Aspirin irreversibly inhibits COX-1 and COX-2, thereby reducing prostaglandin synthesis and platelet aggregation.\"\n\n" +
    "Negated:   \"Aspirin does not inhibit COX-1 or COX-2 and has no effect on prostaglandin synthesis or platelet aggregation.\"",
    LIGHT),
  spacer(100),
  body("What conflict tests: when the evidence in the context directly contradicts the correct answer, does the model hallucinate (follow the false evidence), refuse to answer, or somehow reach the correct answer from its own training?"),
  spacer(100),
  body("Key finding from this project: conflict barely affects retrieval (MAP@k is unchanged because the same PMIDs are returned), but Task Score drops ~10 percentage points, indicating the model is partially misled by contradictory evidence."),
  spacer(160),

  h2("Unanswerable  —  Partial and Full"),
  bodyRuns([{ text: "What it does: " , bold: true }, { text: "removes passages that could provide the answer. The generator receives a context window with no relevant evidence." }]),
  spacer(80),
  defTable([
    ["unanswerable_partial", "Remove 50% of answer-bearing passages (those whose PMID matches a gold snippet PMID)"],
    ["unanswerable_full",    "Remove ALL answer-bearing passages. Replace any remaining relevant passages with irrelevant content, guaranteeing no answer is possible."],
  ]),
  spacer(120),
  body("Answer-bearing passages are identified by PMID matching against the BioASQ gold snippets."),
  spacer(80),
  exampleBox("Example",
    "Gold snippet PMIDs for this question: [12345, 67890]\n\n" +
    "Clean top-5 includes passages from PMIDs 12345, 67890, 11111, 22222, 33333\n\n" +
    "Unanswerable Full: passages from 12345 and 67890 are removed and replaced with random chunks.\n" +
    "The model receives context with zero answer-relevant evidence.",
    LIGHT),
  spacer(100),
  body("What unanswerable tests: does the pipeline have an abstention mechanism? Can it say \"I cannot answer this from the available evidence\"? The answer in this project is no — the model always attempts to answer, leading to metric collapse."),
  spacer(100),
  body("Key finding: unanswerable full is the most catastrophic condition. MAP@k drops from 88.3% to 1.0% because no gold PMIDs are in the retrieved set. Task Score drops from 50.8% to 18.4%."),
  spacer(200),
  divider(),
);

// ── SECTION 6 — Models & Components ──────────────────────────────────────
sections_children.push(
  h1("6. Models and Pipeline Components"),
  spacer(60),

  h2("MedCPT  —  Medical Contrastive Pre-trained Transformer"),
  body("MedCPT is a biomedical embedding model from NCBI, trained on 255 million query-article pairs from PubMed search logs. It is used in two roles:"),
  defTable([
    ["Query Encoder",    "ncbi/MedCPT-Query-Encoder  — encodes questions into 384-dimensional vectors"],
    ["Document Encoder", "ncbi/MedCPT-Article-Encoder  — encodes abstract chunks into 384-dimensional vectors"],
  ]),
  spacer(80),
  body("Similarity is computed as the inner product of the query and document vectors after L2 normalisation. Because MedCPT was trained specifically on biomedical queries, it outperforms general-purpose sentence encoders on PubMed retrieval."),
  spacer(160),

  h2("FAISS  —  Facebook AI Similarity Search"),
  body("FAISS is an open-source library for fast nearest-neighbour search over millions of dense vectors. In this pipeline, FAISS holds the embedded chunks for every article in the corpus. A query vector is compared against all stored vectors in milliseconds."),
  body("This project uses HNSW (Hierarchical Navigable Small World) indexing, a graph-based structure that trades a small accuracy loss for large speed gains versus exhaustive search."),
  spacer(160),

  h2("Cross-Encoder Reranker  (cross-encoder/ms-marco-MiniLM-L-6-v2)"),
  body("Unlike embedding models (which encode query and passage separately then compare vectors), a cross-encoder reads the query and passage together and outputs a single relevance score. This is slower but more accurate."),
  defTable([
    ["Role", "Re-scores the top-100 FAISS candidates to select the final top-5"],
    ["Input", "Concatenated string: [query] [SEP] [passage]"],
    ["Output", "Single relevance score (higher = more relevant)"],
    ["Why not use it first?", "Comparing every query against every passage in the corpus (millions) would be too slow. FAISS narrows to 100 candidates first."],
  ]),
  spacer(160),

  h2("NLI Cross-Encoder  (cross-encoder/nli-deberta-v3-base)"),
  body("This model performs Natural Language Inference on (premise, hypothesis) pairs. In this project, the premise is a retrieved passage and the hypothesis is a sentence from the generated answer."),
  defTable([
    ["Entailment",    "The passage logically supports the answer sentence (e.g., both say aspirin inhibits COX-1)"],
    ["Neutral",       "The passage and sentence are about different things or unrelated"],
    ["Contradiction", "The passage and sentence assert opposite facts"],
  ]),
  spacer(80),
  body("The model outputs a probability for each class (summing to 1.0). The entailment probability is used to compute SCR and Citation Precision (threshold = 0.5)."),
  spacer(160),

  h2("LLaMA 3.1:8b via Ollama"),
  body("LLaMA 3.1 is Meta's open-source large language model. It runs locally on the thesis laptop via Ollama, meaning no API keys or cloud costs are needed and no data leaves the machine."),
  defTable([
    ["Answer generation", "Receives the question + top-5 passages, must answer using only the passages and cite each with [1], [2], etc."],
    ["Conflict injection", "Receives each gold passage and rewrites it to contradict its main claim (temperature 0.5 for variety)"],
    ["Parameters",        "temperature = 0.3 for generation (reproducible), max_tokens = 512"],
  ]),
  spacer(160),

  h2("NLI  —  Natural Language Inference"),
  body("NLI is the task of determining the logical relationship between two text fragments. Given a premise (P) and a hypothesis (H), the model classifies the relationship as one of:"),
  bullet("Entailment: if P is true, then H is also true"),
  bullet("Contradiction: if P is true, then H must be false"),
  bullet("Neutral: P and H are independent"),
  spacer(80),
  exampleBox("NLI example",
    "Premise:   \"Beta blockers lower heart rate by blocking adrenaline receptors.\"\n" +
    "Hypothesis: \"Beta blockers reduce heart rate.\"\n" +
    "Classification: ENTAILMENT  (the hypothesis follows from the premise)",
    LIGHT),
  spacer(160),

  h2("Hybrid Retrieval"),
  body("The retriever combines two search strategies before reranking:"),
  defTable([
    ["Semantic search",  "MedCPT query vector searched against FAISS index. Finds passages conceptually similar to the question even if they use different words."],
    ["Keyword search",   "SQLite FTS5 (BM25 scoring). Finds passages containing the exact terms from the question. Essential for specific drug names, gene symbols, and medical acronyms."],
    ["Merge + rerank",   "Both result sets are combined (FAISS results take priority for ties), then the cross-encoder reranks the merged set down to top-5."],
  ]),
  spacer(200),
  divider(),
);

// ── SECTION 7 — BioASQ & Data Terms ─────────────────────────────────────
sections_children.push(
  h1("7. BioASQ and Data Terms"),
  spacer(60),

  h2("BioASQ Challenge 13b"),
  body("BioASQ is a biomedical question-answering competition run annually since 2013. Phase B (used in this thesis) provides:"),
  bullet("5,389 questions across 4 types"),
  bullet("Gold PMIDs: the PubMed article IDs that contain the answer"),
  bullet("Gold snippets: exact text excerpts from those articles that directly answer the question"),
  bullet("Gold answers: the official answer in the format appropriate for each question type"),
  spacer(80),
  defTable([
    ["Yes/No",   "Question answerable with \"yes\" or \"no\". Example: \"Is BRCA1 a tumour suppressor gene?\""],
    ["Factoid",  "Answer is one or more specific entities. Example: \"What enzyme is inhibited by ibuprofen?\""],
    ["List",     "Answer is a set of entities. Example: \"List three risk factors for Type 2 diabetes.\""],
    ["Summary",  "Answer requires a multi-sentence explanation. Example: \"Describe the mechanism of action of metformin.\""],
  ]),
  spacer(160),

  h2("PMID  —  PubMed Identifier"),
  body("A unique integer assigned to every article indexed in PubMed (the US National Library of Medicine's biomedical literature database). PMIDs are the linking key between questions and documents: the gold set for a BioASQ question is a list of PMIDs that contain the answer."),
  exampleBox("Example", "PMID 12345678 might refer to:\n\"Smith J et al. (2023). Metformin activates AMPK and reduces hepatic gluconeogenesis. Journal of Diabetes Research.\"", LIGHT),
  spacer(160),

  h2("Gold Snippet"),
  body("A gold snippet is a verbatim excerpt from a PubMed abstract that directly answers the BioASQ question. It is provided as ground truth. In this project, gold snippets are used for:"),
  bullet("Identifying answer-bearing passages (for unanswerable condition)"),
  bullet("Conflict injection (the snippet text is what gets negated)"),
  bullet("Evaluating retrieval (passages whose PMID matches a gold snippet PMID count as relevant)"),
  spacer(160),

  h2("Chunk"),
  body("Each PubMed abstract is too long to pass whole into a dense embedding. It is split into overlapping windows called chunks:"),
  defTable([
    ["Size",    "256 tokens per chunk (roughly 200 words)"],
    ["Overlap", "64 tokens of overlap between adjacent chunks, so a sentence at the boundary appears in two chunks and is never lost"],
    ["ID",      "Each chunk gets a unique ID: PMID_index (e.g., 12345678_0, 12345678_1)"],
  ]),
  spacer(80),
  body("Chunks — not full abstracts — are what FAISS indexes, what the cross-encoder reranks, and what the generator receives as passages."),
  spacer(160),

  h2("ROUGE  —  Recall-Oriented Understudy for Gisting Evaluation"),
  body("A family of text overlap metrics used when there is no single correct answer (mainly for Summary questions). Three variants:"),
  defTable([
    ["ROUGE-1", "Fraction of unigrams (single words) shared between generated and reference text"],
    ["ROUGE-2", "Fraction of bigrams (word pairs) shared between the two texts"],
    ["ROUGE-L", "Based on Longest Common Subsequence — words do not need to be adjacent, just in the same order"],
  ]),
  spacer(80),
  exampleBox("ROUGE-L illustration",
    "Reference: aspirin reduces fever by inhibiting prostaglandin synthesis\n" +
    "Generated: aspirin can reduce fever via prostaglandin inhibition\n\n" +
    "LCS:  aspirin   fever   prostaglandin   (order preserved, not adjacent)\n" +
    "ROUGE-L rewards this partial overlap even though the exact words differ.",
    LIGHT),
  spacer(160),

  h2("Quick-Reference Glossary"),
  defTable([
    ["AP",        "Average Precision — per-query score; MAP is the mean of AP over all queries"],
    ["RR",        "Reciprocal Rank — per-query score; MRR is the mean of RR over all queries"],
    ["DCG",       "Discounted Cumulative Gain — raw ranking quality score before normalisation"],
    ["IDCG",      "Ideal DCG — DCG of the perfect ranking (all relevant docs first); used as denominator in nDCG"],
    ["LCS",       "Longest Common Subsequence — sequence of words appearing in the same order in both texts"],
    ["FTS5",      "SQLite Full-Text Search extension with BM25 scoring (keyword search)"],
    ["BM25",      "Best Match 25 — probabilistic keyword ranking function used in FTS5"],
    ["L2 norm",   "Normalise a vector to unit length (sum of squares = 1). Required before FAISS inner-product search."],
    ["HNSW",      "Hierarchical Navigable Small World — graph-based approximate nearest-neighbour index in FAISS"],
    ["SSE",       "Server-Sent Events — streaming protocol used by the API to push incremental generation to the frontend"],
    ["k",         "The cutoff for retrieval metrics. k = 5 in this project means we evaluate the top-5 retrieved passages."],
    ["NCBI",      "National Center for Biotechnology Information — hosts PubMed and provides the EFetch API used to download abstracts"],
    ["EFetch",    "NCBI API endpoint used to download full PubMed records (abstracts, titles, PMIDs) in batch"],
    ["MeSH",      "Medical Subject Headings — controlled vocabulary for PubMed article tagging"],
    ["SHA-256",   "Hash function used to create a unique fingerprint for each passage text (for caching LLaMA negations)"],
  ]),
  spacer(200),
);

// ── Footer note ──
sections_children.push(
  divider(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0 },
    children: [new TextRun({ text: "Generated for Tanushree Nepal  |  RAG Stress-Test Thesis  |  BioASQ Challenge 13b", font: "Arial", size: 18, color: MUTED, italics: true })],
  }),
);

// ── Assemble document ──────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "\u2022",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  styles: {
    default: {
      document: { run: { font: "Arial", size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1",
        basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: TEAL, space: 2 } } },
      },
      {
        id: "Heading2", name: "Heading 2",
        basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [
            new TextRun({ text: "RAG Stress-Test Thesis  |  Glossary", font: "Arial", size: 18, color: MUTED }),
            new TextRun({ children: ["\t", PageNumber.CURRENT], font: "Arial", size: 18, color: MUTED }),
          ],
          tabStops: [{ type: "right", position: 8640 }],
          border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC", space: 1 } },
        })],
      }),
    },
    children: sections_children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("/Users/tanushreenepal/Desktop/rag_stress_test/thesis_glossary.docx", buf);
  console.log("Written: thesis_glossary.docx");
});
