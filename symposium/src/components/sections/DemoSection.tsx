import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";
import { TypingAnimation } from "../shared/TypingAnimation";
import { PassageCard } from "../shared/PassageCard";
import { demoQuestions } from "../../data/demo-questions";

const pipelineStages = [
  { label: "Corpus", desc: "2,000+ PubMed chunks indexed with MedCPT embeddings" },
  { label: "Retrieval", desc: "Dense vector search returns top 20 candidates" },
  { label: "Reranking", desc: "Cross-encoder scores and selects top 5" },
  { label: "Perturbation", desc: "Adversarial condition applied to retrieved passages" },
  { label: "Generation", desc: "LLaMA 3.1:8b generates a cited answer" },
  { label: "Evaluation", desc: "Metrics assess retrieval and answer quality" },
];

type PerturbationType = "none" | "noise" | "conflict" | "unanswerable";

const perturbationOptions: { id: PerturbationType; label: string; badge: string; color: string; explanation: string }[] = [
  {
    id: "none",
    label: "None (Clean)",
    badge: "CLEAN",
    color: "text-green-400 border-green-500/30 bg-green-500/10",
    explanation: "No perturbation — clean passages passed directly to the generator.",
  },
  {
    id: "noise",
    label: "Noise 70%",
    badge: "NOISE",
    color: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    explanation: "70% of the top-5 passages replaced with irrelevant near-miss documents sharing disease keywords. The generator receives mostly unhelpful context.",
  },
  {
    id: "conflict",
    label: "Conflict 70/30",
    badge: "CONFLICT",
    color: "text-red-400 border-red-500/30 bg-red-500/10",
    explanation: "70% of passages rewritten by LLaMA to contradict their original claims. The generator receives plausible-looking but factually inverted evidence.",
  },
  {
    id: "unanswerable",
    label: "Unanswerable Full",
    badge: "UNANSWERABLE",
    color: "text-purple-400 border-purple-500/30 bg-purple-500/10",
    explanation: "All answer-bearing passages removed. The retrieved context contains no information that could support a correct answer.",
  },
];

// Each step maps to: a pipeline highlight index, a status message, and what content is visible
const steps = [
  { pipeline: 1, status: "Searching 2,000+ PubMed chunks...", showPassages: false, showAnswer: false, showPerturbation: false },
  { pipeline: 2, status: "Reranking 20 candidates with cross-encoder...", showPassages: false, showAnswer: false, showPerturbation: false },
  { pipeline: 2, status: "Top 5 passages retrieved", showPassages: true, showAnswer: false, showPerturbation: false },
  { pipeline: 3, status: "Applying perturbation to retrieved passages...", showPassages: true, showAnswer: false, showPerturbation: true },
  { pipeline: 4, status: "Generating answer with LLaMA 3.1:8b...", showPassages: true, showAnswer: true, showPerturbation: true },
  { pipeline: 5, status: "Evaluation complete", showPassages: true, showAnswer: true, showPerturbation: true },
];

export function DemoSection() {
  const [selectedQ, setSelectedQ] = useState(0);
  const [step, setStep] = useState(-1);
  const [perturbation, setPerturbation] = useState<PerturbationType>("none");

  const question = demoQuestions[selectedQ];
  const started = step >= 0;
  const atEnd = step === steps.length - 1;
  const current = started ? steps[step] : null;
  const activePerturbation = perturbationOptions.find((p) => p.id === perturbation)!;

  const handleNext = () => {
    if (!started) {
      setStep(0);
    } else if (!atEnd) {
      setStep((s) => s + 1);
    } else {
      setStep(-1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const reset = () => setStep(-1);

  return (
    <SectionWrapper id="demo">
      <AnimatedStep>
        <h2 className="text-3xl font-bold text-center mb-2">
          System Pipeline
        </h2>
        <p className="text-white/50 text-sm text-center mb-10 max-w-lg mx-auto">
          Step through how a biomedical question flows through each stage of the
          RAG pipeline
        </p>
      </AnimatedStep>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
        {/* Left: Pipeline Architecture */}
        <AnimatedStep delay={0.2} direction="left">
          <div className="space-y-2">
            {pipelineStages.map((s, i) => (
              <div key={s.label}>
                <motion.div
                  className={`px-4 py-3 rounded-lg border transition-all duration-500 ${
                    current && i === current.pipeline
                      ? "bg-ucm-red border-ucm-red text-white shadow-lg shadow-ucm-red/20"
                      : current && i < current.pipeline
                      ? "bg-white/10 border-white/20 text-white/80"
                      : "bg-white/5 border-white/10 text-white/40"
                  }`}
                  animate={current && i === current.pipeline ? { scale: [1, 1.02, 1] } : {}}
                >
                  <p className="text-sm font-semibold">{s.label}</p>
                  <p className="text-xs opacity-70 mt-0.5">{s.desc}</p>
                </motion.div>
                {i < pipelineStages.length - 1 && (
                  <div className="flex justify-center py-1">
                    <div
                      className={`w-px h-4 transition-colors duration-500 ${
                        current && i < current.pipeline ? "bg-ucm-red" : "bg-white/15"
                      }`}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </AnimatedStep>

        {/* Right: Step-by-step panel */}
        <AnimatedStep delay={0.4} direction="right">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex flex-col gap-4">
            {/* Question selector */}
            <div className="flex flex-col gap-2">
              <select
                value={selectedQ}
                onChange={(e) => {
                  setSelectedQ(Number(e.target.value));
                  reset();
                }}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white appearance-none cursor-pointer"
              >
                {demoQuestions.map((q, i) => (
                  <option key={q.id} value={i} className="bg-ucm-gray-800">
                    [{q.type}] {q.body}
                  </option>
                ))}
              </select>

              {/* Perturbation selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-widest text-white/30 font-semibold shrink-0">Perturbation:</span>
                {perturbationOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { setPerturbation(opt.id); reset(); }}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
                      perturbation === opt.id
                        ? opt.color + " opacity-100"
                        : "text-white/30 border-white/10 bg-white/5 hover:text-white/60"
                    }`}
                  >
                    {opt.badge}
                  </button>
                ))}
              </div>
            </div>

            {/* Question display */}
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <span className="text-[10px] uppercase tracking-wider text-ucm-red font-semibold">
                Question ({question.type})
              </span>
              <p className="text-sm text-white/90 mt-1">{question.body}</p>
            </div>

            {/* Status line */}
            <div className="h-6">
              <AnimatePresence mode="wait">
                {current && (
                  <motion.p
                    key={step}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs text-white/50 flex items-center gap-2"
                  >
                    {step < steps.length - 1 && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-ucm-red animate-pulse" />
                    )}
                    {current.status}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>

            {/* Passages */}
            <AnimatePresence>
              {current?.showPassages && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-2 max-h-56 overflow-y-auto pr-1"
                >
                  {question.passages.slice(0, 5).map((p, i) => (
                    <PassageCard key={p.pmid} passage={p} index={i} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Perturbation stage panel */}
            <AnimatePresence>
              {current?.showPerturbation && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`rounded-lg border p-3 ${activePerturbation.color}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold">
                      Perturbation: {activePerturbation.badge}
                    </span>
                  </div>
                  <p className="text-xs opacity-80 leading-relaxed">{activePerturbation.explanation}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Generated answer */}
            <AnimatePresence>
              {current?.showAnswer && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-ucm-red/10 border border-ucm-red/30 rounded-lg p-4"
                >
                  <span className="text-[10px] uppercase tracking-wider text-ucm-red font-semibold">
                    Generated Answer
                  </span>
                  <div className="text-sm text-white/90 mt-2 leading-relaxed">
                    {step === 3 ? (
                      <TypingAnimation text={question.generatedAnswer} speed={15} />
                    ) : (
                      question.generatedAnswer
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Metrics — shown on final step only */}
            <AnimatePresence>
              {step === steps.length - 1 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-3 gap-3"
                >
                  {[
                    { label: "MAP@k", value: question.metrics.map_at_k, color: "text-blue-400" },
                    { label: "MRR@k", value: question.metrics.mrr_at_k, color: "text-purple-400" },
                    { label: "nDCG@k", value: question.metrics.ndcg_at_k, color: "text-cyan-400" },
                    { label: "Claim Support", value: question.metrics.supported_claim_rate, color: "text-green-400" },
                    { label: "Citation Prec.", value: question.metrics.citation_precision, color: "text-yellow-400" },
                    { label: "Task Score", value: question.metrics.task_score, color: "text-ucm-red" },
                  ].map((m, i) => (
                    <motion.div
                      key={m.label}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.07 }}
                      className="bg-white/5 border border-white/10 rounded-lg p-3 text-center"
                    >
                      <p className={`text-lg font-bold ${m.color}`}>
                        {(m.value * 100).toFixed(0)}%
                      </p>
                      <p className="text-[10px] text-white/40 mt-0.5">{m.label}</p>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {!started && (
              <p className="text-center text-white/30 text-sm py-4">
                Select a question and step through the pipeline
              </p>
            )}

            {/* Navigation controls */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              {started && (
                <button
                  onClick={handleBack}
                  disabled={step === 0}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-5 py-2 bg-ucm-red hover:bg-ucm-red-light text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              >
                {!started ? "Start" : atEnd ? "Reset" : "Next"}
              </button>
              {started && (
                <span className="text-xs text-white/30 ml-auto">
                  Step {step + 1} / {steps.length}
                </span>
              )}
            </div>
          </div>
        </AnimatedStep>
      </div>
    </SectionWrapper>
  );
}
