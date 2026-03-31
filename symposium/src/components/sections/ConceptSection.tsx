import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";

const ragSteps = [
  {
    icon: "?",
    label: "Question",
    desc: "A biomedical question enters the system",
    color: "bg-ucm-red",
  },
  {
    icon: "S",
    label: "Search",
    desc: "Search 2,000+ PubMed abstracts using dense retrieval",
    color: "bg-blue-600",
  },
  {
    icon: "R",
    label: "Rerank",
    desc: "Cross-encoder reranks top 20 to select the best 5",
    color: "bg-purple-600",
  },
  {
    icon: "G",
    label: "Generate",
    desc: "LLM reads passages and generates a cited answer",
    color: "bg-green-600",
  },
  {
    icon: "A",
    label: "Answer",
    desc: "Answer with citations pointing to evidence",
    color: "bg-ucm-red",
  },
];

function LLMExplainer() {
  const [hovered, setHovered] = useState("");

  const concepts = [
    {
      id: "trained",
      label: "Trained on text",
      tip: "LLMs learn patterns from billions of words -- books, articles, websites",
    },
    {
      id: "generates",
      label: "Generates responses",
      tip: "They predict the next word, one at a time, to form coherent answers",
    },
    {
      id: "hallucinate",
      label: "Can hallucinate",
      tip: "Sometimes they confidently produce information that is completely wrong or made up",
    },
  ];

  return (
    <div className="text-center">
      <AnimatedStep delay={0.1}>
        <h3 className="text-2xl font-bold mb-6">
          What is a Large Language Model?
        </h3>
      </AnimatedStep>

      {/* LLM diagram */}
      <AnimatedStep delay={0.3}>
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className="bg-white/10 border border-white/20 rounded-lg px-6 py-3 text-sm">
            "What causes diabetes?"
          </div>
          <motion.div
            animate={{ x: [0, 5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-ucm-red text-2xl"
          >
            &rarr;
          </motion.div>
          <div className="bg-gradient-to-br from-ucm-red/30 to-purple-600/30 border border-ucm-red/40 rounded-xl px-8 py-5 text-lg font-bold">
            LLM
          </div>
          <motion.div
            animate={{ x: [0, 5, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
            className="text-ucm-red text-2xl"
          >
            &rarr;
          </motion.div>
          <div className="bg-white/10 border border-white/20 rounded-lg px-6 py-3 text-sm max-w-48">
            "Diabetes is caused by..."
          </div>
        </div>
      </AnimatedStep>

      {/* Concept bullets */}
      <div className="flex justify-center gap-6 flex-wrap">
        {concepts.map((c, i) => (
          <AnimatedStep key={c.id} delay={0.5 + i * 0.15}>
            <div
              className="relative"
              onMouseEnter={() => setHovered(c.id)}
              onMouseLeave={() => setHovered("")}
            >
              <div
                className={`px-5 py-3 rounded-lg border transition-all duration-300 cursor-default ${
                  c.id === "hallucinate"
                    ? "border-ucm-red/50 bg-ucm-red/10 text-ucm-red-light"
                    : "border-white/20 bg-white/5"
                }`}
              >
                {c.label}
              </div>
              <AnimatePresence>
                {hovered === c.id && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-ucm-gray-800 text-white text-xs p-3 rounded-lg shadow-xl max-w-60 z-10 border border-white/10"
                  >
                    {c.tip}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </AnimatedStep>
        ))}
      </div>
    </div>
  );
}

function RAGExplainer() {
  const [activeStep, setActiveStep] = useState(-1);

  const started = activeStep >= 0;
  const atEnd = activeStep === ragSteps.length - 1;

  const handleNext = () => {
    if (!started) {
      setActiveStep(0);
    } else if (!atEnd) {
      setActiveStep((s) => s + 1);
    } else {
      setActiveStep(-1);
    }
  };

  const handleBack = () => {
    if (activeStep > 0) setActiveStep((s) => s - 1);
  };

  return (
    <div className="text-center mt-20">
      <AnimatedStep delay={0.1}>
        <h3 className="text-2xl font-bold mb-2">
          What is Retrieval-Augmented Generation?
        </h3>
        <p className="text-white/50 text-sm mb-8 max-w-lg mx-auto">
          Instead of relying only on what the LLM memorized, RAG first searches
          for relevant evidence, then generates an answer grounded in that
          evidence.
        </p>
      </AnimatedStep>

      <AnimatedStep delay={0.3}>
        <div className="flex items-center justify-center gap-2 flex-wrap mb-8">
          {ragSteps.map((step, i) => (
            <div key={step.label} className="flex items-center gap-2">
              <motion.div
                className={`flex flex-col items-center gap-2 px-4 py-3 rounded-xl border transition-all duration-500 min-w-24 ${
                  i <= activeStep
                    ? `${step.color} border-transparent text-white shadow-lg`
                    : "bg-white/5 border-white/15 text-white/40"
                }`}
                animate={i === activeStep ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                <span className="text-lg font-bold">{step.icon}</span>
                <span className="text-xs font-medium">{step.label}</span>
              </motion.div>
              {i < ragSteps.length - 1 && (
                <span
                  className={`text-xl transition-colors duration-500 ${
                    i < activeStep ? "text-white" : "text-white/20"
                  }`}
                >
                  &rarr;
                </span>
              )}
            </div>
          ))}
        </div>
      </AnimatedStep>

      {/* Step description */}
      <div className="h-8 mb-4">
        <AnimatePresence mode="wait">
          {started && (
            <motion.p
              key={activeStep}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="text-sm text-white/70"
            >
              {ragSteps[activeStep].desc}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <AnimatedStep delay={0.5}>
        <div className="flex items-center justify-center gap-3">
          {started && (
            <button
              onClick={handleBack}
              disabled={activeStep === 0}
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="px-6 py-2.5 bg-ucm-red hover:bg-ucm-red-light text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            {!started ? "Start walkthrough" : atEnd ? "Reset" : "Next"}
          </button>
          {started && (
            <span className="text-xs text-white/30">
              {activeStep + 1} / {ragSteps.length}
            </span>
          )}
        </div>
      </AnimatedStep>
    </div>
  );
}

export function ConceptSection() {
  return (
    <SectionWrapper id="concepts">
      <LLMExplainer />
      <RAGExplainer />
    </SectionWrapper>
  );
}
