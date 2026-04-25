import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";

interface ResultImage {
  id: string;
  src: string;
  label: string;
  description: string;
  mostImpacted: string;
  analysis: string[];
}

const results: ResultImage[] = [
  {
    id: "overall",
    src: "./results/overall-degrade.png",
    label: "Overall Degradation",
    description: "Task score broken down by question type across every perturbation condition.",
    mostImpacted: "Factoid questions",
    analysis: [
      "Factoid questions suffer the steepest task score drops under conflict and unanswerable conditions — their single-entity answers leave no room for partial credit when evidence is corrupted.",
      "Yes/No questions show the strongest resilience, often holding above 50% even under moderate stress — binary answers are harder to fully invalidate.",
      "Unanswerable full is catastrophic across all question types, confirming the system never gracefully abstains regardless of question format.",
    ],
  },
  {
    id: "performance",
    src: "./results/performance-degradation.png",
    label: "Performance Degradation",
    description: "Delta from clean baseline across retrieval, groundedness, and task metrics per condition.",
    mostImpacted: "Retrieval under unanswerable",
    analysis: [
      "Unanswerable full triggers the largest single delta — retrieval collapses by nearly 40 percentage points when answer-bearing passages are fully removed.",
      "Conflict conditions hit groundedness hardest: the model confidently uses contradictory passages, dragging supported claim rate down while retrieval rank stays intact.",
      "Noise degrades all three metric families gradually and in sync — a slow bleed rather than a sudden break.",
    ],
  },
  {
    id: "heatmap",
    src: "./results/heatmap.png",
    label: "Impact Heatmap",
    description: "Metric families (retrieval, groundedness, task) mapped against every condition — green is higher, red is lower.",
    mostImpacted: "Retrieval (unanswerable full: 1.0%)",
    analysis: [
      "Retrieval is identical under conflict (88.4%) and clean (88.3%) — the system ranks contradicted passages just as highly as correct ones, making conflict an invisible failure mode.",
      "Groundedness starts low at baseline (16.8%), indicating the model struggles with strict citation discipline in biomedical QA even without any perturbation.",
      "Unanswerable full is the most uniformly destructive condition: retrieval at 1.0%, task score at 18.4% — every metric family is in the red.",
    ],
  },
  {
    id: "noise",
    src: "./results/noise-degarde.png",
    label: "Noise Condition",
    description: "All five metrics plotted as noise injection increases from 0% to 70%.",
    mostImpacted: "MAP@k",
    analysis: [
      "MAP@k is the most noise-sensitive metric — it falls from ~78% to ~25% at 70% noise, reflecting the growing proportion of irrelevant passages in the ranked list.",
      "Citation Precision is surprisingly robust, staying near 75% even at high noise levels. The model anchors its citations to its top-ranked passage and rarely diversifies.",
      "Task Score declines moderately, suggesting the generator can partially compensate for weaker retrieval — until noise exceeds 50%, where quality degrades more sharply.",
    ],
  },
  {
    id: "conflict",
    src: "./results/conflict-degrade.png",
    label: "Conflict Condition",
    description: "Impact of replacing retrieved passages with LLaMA-negated contradictions at 50% and 70% ratios.",
    mostImpacted: "Supported Claim Rate (SCR)",
    analysis: [
      "Retrieval and citation precision hold near 75% across conflict levels — the system retrieves and cites the corrupted passages with full confidence, unaware they have been inverted.",
      "SCR drops from ~25% to ~10% at 70% conflict, meaning the model generates claims that contradict its own retrieved evidence most of the time.",
      "This is the most dangerous failure mode: surface metrics look healthy while the content of the answer is factually wrong — a false sense of reliability.",
    ],
  },
  {
    id: "unanswerable",
    src: "./results/unanserable-degrade.png",
    label: "Unanswerable Condition",
    description: "All metrics as answer-bearing passages are partially then fully removed from the retrieved context.",
    mostImpacted: "All metrics — uniform collapse",
    analysis: [
      "Every metric collapses in near-lockstep from None to Partial to Full removal — Citation Precision and MAP@k both fall below 5% when all answer-bearing passages are gone.",
      "The system never issues an abstention or 'insufficient evidence' response under full unanswerable conditions — it generates answers regardless of whether the context supports them.",
      "This is the steepest degradation curve of any condition and represents the clearest argument for adding explicit abstention mechanisms to clinical RAG deployments.",
    ],
  },
];

export function ResultsSection() {
  const [active, setActive] = useState(0);
  const current = results[active];

  return (
    <SectionWrapper id="results" dark>
      <AnimatedStep>
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold text-white mb-3">Experimental Results</h2>
          <p className="text-white/60 max-w-2xl mx-auto">
            How retrieval and generation quality degrade under each adversarial condition
          </p>
        </div>

        {/* Tab row */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setActive(i)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                i === active
                  ? "bg-ucm-red text-white"
                  : "bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Image + analysis */}
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col items-center gap-6"
          >
            <div className="w-full max-w-4xl rounded-xl overflow-hidden border border-white/10 bg-white/5">
              <img
                src={current.src}
                alt={current.label}
                className="w-full h-auto object-contain"
              />
            </div>

            {/* Analysis panel */}
            <div className="w-full max-w-4xl bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-semibold uppercase tracking-widest text-white/40">Most Impacted</span>
                <span className="bg-ucm-red/20 text-ucm-red border border-ucm-red/30 text-xs font-semibold px-3 py-1 rounded-full">
                  {current.mostImpacted}
                </span>
              </div>
              <p className="text-white/50 text-sm mb-4">{current.description}</p>
              <ul className="space-y-3">
                {current.analysis.map((point, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-ucm-red/20 border border-ucm-red/40 flex items-center justify-center text-[10px] font-bold text-ucm-red mt-0.5">
                      {i + 1}
                    </span>
                    <p className="text-sm text-white/75 leading-relaxed">{point}</p>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </AnimatePresence>
      </AnimatedStep>
    </SectionWrapper>
  );
}
