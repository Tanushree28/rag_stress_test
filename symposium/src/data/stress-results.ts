export interface StressMetrics {
  retrieval: {
    map_at_k: number;
    mrr_at_k: number;
    ndcg_at_k: number;
    precision_at_k: number;
  };
  groundedness: {
    supported_claim_rate: number;
    citation_precision: number;
    avg_entailment_score: number;
  };
  task: {
    score: number;
    type: string;
  };
}

export interface StressConditionResult {
  condition: string;
  label: string;
  answer: string;
  metrics: StressMetrics;
}

export const conditionLabels: Record<string, string> = {
  clean: "Clean (Baseline)",
  noise_30: "Noise 30%",
  noise_50: "Noise 50%",
  noise_70: "Noise 70%",
  conflict_50_50: "Conflict 50/50",
  conflict_70_30: "Conflict 70/30",
  unanswerable_partial: "Unanswerable (Partial)",
  unanswerable_full: "Unanswerable (Full)",
};

// Placeholder data -- replace with real pipeline outputs
export const stressResults: StressConditionResult[] = [
  {
    condition: "clean",
    label: "Clean (Baseline)",
    answer:
      "Metformin is the first-line treatment for type 2 diabetes, working by suppressing hepatic glucose production and improving insulin sensitivity [1][2]. It also has cardiovascular benefits [3].",
    metrics: {
      retrieval: { map_at_k: 0.92, mrr_at_k: 1.0, ndcg_at_k: 0.95, precision_at_k: 0.8 },
      groundedness: { supported_claim_rate: 0.95, citation_precision: 1.0, avg_entailment_score: 0.88 },
      task: { score: 0.82, type: "summary" },
    },
  },
  {
    condition: "noise_30",
    label: "Noise 30%",
    answer:
      "Metformin is used for type 2 diabetes and works by reducing glucose production in the liver [1]. It may also improve insulin sensitivity [3].",
    metrics: {
      retrieval: { map_at_k: 0.74, mrr_at_k: 0.85, ndcg_at_k: 0.78, precision_at_k: 0.6 },
      groundedness: { supported_claim_rate: 0.82, citation_precision: 0.85, avg_entailment_score: 0.75 },
      task: { score: 0.71, type: "summary" },
    },
  },
  {
    condition: "noise_50",
    label: "Noise 50%",
    answer:
      "Metformin is a medication for diabetes that reduces blood sugar levels [1]. Its exact mechanism involves the liver.",
    metrics: {
      retrieval: { map_at_k: 0.58, mrr_at_k: 0.72, ndcg_at_k: 0.62, precision_at_k: 0.4 },
      groundedness: { supported_claim_rate: 0.65, citation_precision: 0.7, avg_entailment_score: 0.6 },
      task: { score: 0.55, type: "summary" },
    },
  },
  {
    condition: "noise_70",
    label: "Noise 70%",
    answer:
      "Metformin is used in diabetes treatment. The retrieved evidence does not provide sufficient detail on its mechanism of action.",
    metrics: {
      retrieval: { map_at_k: 0.35, mrr_at_k: 0.5, ndcg_at_k: 0.41, precision_at_k: 0.2 },
      groundedness: { supported_claim_rate: 0.42, citation_precision: 0.5, avg_entailment_score: 0.38 },
      task: { score: 0.33, type: "summary" },
    },
  },
  {
    condition: "conflict_50_50",
    label: "Conflict 50/50",
    answer:
      "There is conflicting evidence regarding metformin. Some sources indicate it suppresses hepatic glucose production [1], while others suggest it does not significantly affect liver metabolism [3]. The evidence is contradictory.",
    metrics: {
      retrieval: { map_at_k: 0.88, mrr_at_k: 0.95, ndcg_at_k: 0.9, precision_at_k: 0.8 },
      groundedness: { supported_claim_rate: 0.55, citation_precision: 0.6, avg_entailment_score: 0.48 },
      task: { score: 0.38, type: "summary" },
    },
  },
  {
    condition: "conflict_70_30",
    label: "Conflict 70/30",
    answer:
      "Evidence suggests metformin does not significantly reduce hepatic glucose production [1][2][3]. Its role as first-line therapy has been questioned by recent studies.",
    metrics: {
      retrieval: { map_at_k: 0.85, mrr_at_k: 0.92, ndcg_at_k: 0.87, precision_at_k: 0.8 },
      groundedness: { supported_claim_rate: 0.38, citation_precision: 0.45, avg_entailment_score: 0.35 },
      task: { score: 0.22, type: "summary" },
    },
  },
  {
    condition: "unanswerable_partial",
    label: "Unanswerable (Partial)",
    answer:
      "Metformin is related to diabetes treatment, but the available evidence provides limited information on its specific mechanisms [1].",
    metrics: {
      retrieval: { map_at_k: 0.45, mrr_at_k: 0.6, ndcg_at_k: 0.5, precision_at_k: 0.4 },
      groundedness: { supported_claim_rate: 0.7, citation_precision: 0.75, avg_entailment_score: 0.65 },
      task: { score: 0.42, type: "summary" },
    },
  },
  {
    condition: "unanswerable_full",
    label: "Unanswerable (Full)",
    answer:
      "Insufficient evidence. The retrieved passages do not contain information relevant to the role of metformin in type 2 diabetes treatment.",
    metrics: {
      retrieval: { map_at_k: 0.08, mrr_at_k: 0.12, ndcg_at_k: 0.1, precision_at_k: 0.0 },
      groundedness: { supported_claim_rate: 0.85, citation_precision: 0.9, avg_entailment_score: 0.8 },
      task: { score: 0.05, type: "summary" },
    },
  },
];

// Chart-ready grouped data for the metric toggle
export function getMetricsByCategory(category: "noise" | "conflict" | "unanswerable") {
  const conditionMap: Record<string, string[]> = {
    noise: ["clean", "noise_30", "noise_50", "noise_70"],
    conflict: ["clean", "conflict_50_50", "conflict_70_30"],
    unanswerable: ["clean", "unanswerable_partial", "unanswerable_full"],
  };
  return stressResults.filter((r) => conditionMap[category].includes(r.condition));
}
