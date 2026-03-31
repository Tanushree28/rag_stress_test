export interface Finding {
  statement: string;
  detail: string;
  metric?: string;
}

// Placeholder findings -- replace with actual experimental results
export const findings: Finding[] = [
  {
    statement: "Conflicting evidence is more damaging than noise",
    detail:
      "Even at 30% noise levels, retrieval metrics remained above 0.70. But conflict at 50/50 ratio dropped task scores below 0.40.",
    metric: "Task score: 0.82 (clean) vs 0.38 (conflict 50/50)",
  },
  {
    statement: "The model rarely admits uncertainty",
    detail:
      "Under unanswerable conditions, the LLM still generated confident-sounding answers in most cases, only flagging insufficient evidence when all relevant passages were removed.",
    metric: "Only 15% of unanswerable queries triggered an abstention response",
  },
  {
    statement: "Retrieval degrades before generation",
    detail:
      "MAP@k showed measurable decline at noise 30%, while generation quality (task score) remained relatively stable until noise exceeded 50%.",
    metric: "MAP@k dropped 42% at noise 70%; task score dropped 60%",
  },
  {
    statement: "Groundedness metrics detect conflicts effectively",
    detail:
      "NLI-based supported claim rate dropped sharply under conflict conditions, providing a reliable signal for evidence quality issues.",
    metric: "Supported claim rate: 0.95 (clean) vs 0.38 (conflict 70/30)",
  },
  {
    statement: "Citation precision correlates with answer quality",
    detail:
      "When retrieved passages were irrelevant, generated citations pointed to non-supportive evidence, creating a false sense of reliability.",
    metric: "Citation precision: 1.00 (clean) vs 0.50 (noise 70%)",
  },
];

export const implications = [
  "RAG systems in healthcare need robust conflict detection before deployment",
  "Abstention mechanisms should be built into clinical AI to handle uncertain evidence",
  "Retrieval quality monitoring is essential -- generation quality alone is insufficient",
];
