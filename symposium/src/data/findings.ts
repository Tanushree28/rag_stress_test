export interface Finding {
  statement: string;
  detail: string;
  metric?: string;
}

export const findings: Finding[] = [
  {
    statement: "Unanswerable is the most catastrophic condition",
    detail:
      "Removing all answer-bearing passages causes a near-total collapse across every metric family. Retrieval drops from 88.3% to 1.0% and task score falls to 18.4% -- yet the system never issues an abstention. It continues generating answers with no supporting evidence.",
    metric: "Retrieval: 88.3% (clean) → 1.0% (unanswerable full) | Task score: 58.8% → 18.4%",
  },
  {
    statement: "Conflict is the most invisible failure mode",
    detail:
      "At 70% conflict, retrieval holds at 88.4% -- identical to clean. The system finds and ranks contradicted passages with full confidence. Only groundedness metrics expose the problem: supported claim rate drops to ~10%, meaning the model generates claims that contradict its own cited evidence.",
    metric: "Retrieval: 88.4% (conflict 70) vs. SCR: ~10% | Task score: 39.7%",
  },
  {
    statement: "MAP@k is the most sensitive noise indicator",
    detail:
      "Under noise injection, MAP@k falls from ~78% to ~25% at 70% noise while citation precision stays near 75%. The model anchors its citations to its top-ranked passage and holds on, even when the ranked list is mostly irrelevant.",
    metric: "MAP@k: ~78% (clean) → ~25% (noise 70%) | Citation precision: ~75% throughout",
  },
  {
    statement: "Groundedness is already low at baseline",
    detail:
      "The clean baseline groundedness score is just 16.8% -- the model struggles with strict biomedical citation discipline before any perturbation is applied. This means evaluating generation quality on task score alone is insufficient; groundedness must be tracked independently.",
    metric: "Groundedness: 16.8% (clean) → 7.4% (noise 70%) → 2.0% (unanswerable full)",
  },
  {
    statement: "Factoid questions are the most vulnerable",
    detail:
      "Across all conditions, factoid questions show the largest absolute task score drops. Yes/No questions demonstrate the most resilience -- their binary answer structure is harder to fully invalidate even under heavy perturbation, making question type a significant factor in RAG robustness.",
    metric: "Yes/No task scores remain above 50% under moderate conditions where factoid scores fall below 30%",
  },
];

export const implications = [
  "Conflict injection is the hardest failure to detect operationally -- retrieval metrics look healthy while answer content is factually wrong. Groundedness monitoring is non-optional in clinical RAG deployments.",
  "The system never abstains under unanswerable conditions. Any healthcare RAG deployment must include explicit abstention logic tied to evidence coverage thresholds.",
  "Retrieval quality monitoring must run independently of generation quality -- MAP@k degradation precedes task score degradation, making it an early warning signal for pipeline stress.",
];
