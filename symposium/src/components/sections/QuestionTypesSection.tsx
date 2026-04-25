import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";

interface QuestionType {
  id: string;
  label: string;
  tagColor: string;
  cardColor: string;
  description: string;
  example: string;
  answerFormat: string;
  count: string;
  vulnerability: string;
}

const questionTypes: QuestionType[] = [
  {
    id: "factoid",
    label: "Factoid",
    tagColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    cardColor: "border-blue-500/20 bg-blue-500/5",
    description:
      "Asks for a single specific entity — a drug name, gene, protein, organism, or numeric value. The correct answer is a short, precise noun phrase.",
    example: "Which gene is most frequently mutated in non-small cell lung cancer?",
    answerFormat: "Single entity (e.g., KRAS, metformin, p53)",
    count: "~1,500 questions",
    vulnerability:
      "Highest — a single wrong entity invalidates the answer completely.",
  },
  {
    id: "list",
    label: "List",
    tagColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    cardColor: "border-emerald-500/20 bg-emerald-500/5",
    description:
      "Asks for an enumeration of multiple correct items. Evaluated using precision and recall over the full set of expected entities.",
    example: "What are the approved indications for trastuzumab?",
    answerFormat: "Multiple entities (list of drugs, genes, conditions...)",
    count: "~1,200 questions",
    vulnerability:
      "Moderate — partial credit possible; noise causes omissions.",
  },
  {
    id: "yesno",
    label: "Yes / No",
    tagColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    cardColor: "border-amber-500/20 bg-amber-500/5",
    description:
      "A binary assertion about a biomedical relationship. The model must commit to a definitive yes or no — no hedging. Most resilient to perturbation.",
    example: "Is BRCA1 a tumor suppressor gene?",
    answerFormat: "yes or no",
    count: "~1,400 questions",
    vulnerability:
      "Lowest — binary structure limits the ways an answer can be wrong.",
  },
  {
    id: "summary",
    label: "Summary",
    tagColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    cardColor: "border-purple-500/20 bg-purple-500/5",
    description:
      "Requires a paragraph-length synthesis of multiple sources. Evaluated on coverage, coherence, and citation support — the most demanding format.",
    example: "What is the role of metformin in treating type 2 diabetes?",
    answerFormat: "2–4 sentence paragraph with citations",
    count: "~1,200 questions",
    vulnerability:
      "High — groundedness and citation quality degrade visibly under stress.",
  },
];

export function QuestionTypesSection() {
  const [active, setActive] = useState<string | null>(null);

  return (
    <SectionWrapper id="questions" dark={false}>
      <AnimatedStep>
        <div className="text-center mb-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-ucm-red">
            BioASQ Challenge 13B
          </span>
          <h2 className="text-3xl font-bold text-ucm-black mt-2 mb-2">
            Four Question Types
          </h2>
          <p className="text-ucm-gray-500 text-sm max-w-lg mx-auto">
            The dataset covers four distinct question formats — each requires a
            different kind of reasoning and responds differently under adversarial
            stress.
          </p>
        </div>
      </AnimatedStep>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 max-w-4xl mx-auto">
        {questionTypes.map((qt, i) => (
          <AnimatedStep key={qt.id} delay={0.1 + i * 0.12}>
            <motion.div
              onClick={() => setActive(active === qt.id ? null : qt.id)}
              className={`rounded-xl border-2 p-5 cursor-pointer transition-all duration-300 ${qt.cardColor} ${
                active === qt.id ? "shadow-lg" : "hover:shadow-md"
              }`}
              whileHover={{ y: -2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${qt.tagColor}`}
                >
                  {qt.label}
                </span>
                <span className="text-xs text-ucm-gray-500">{qt.count}</span>
              </div>

              <p className="text-sm text-ucm-gray-600 leading-relaxed mb-3">
                {qt.description}
              </p>

              {/* Example question */}
              <div className="bg-white/60 rounded-lg px-3 py-2 mb-3 border border-black/5">
                <span className="text-[10px] uppercase tracking-wider text-ucm-gray-500 font-semibold block mb-1">
                  Example
                </span>
                <p className="text-xs text-ucm-gray-700 italic">
                  "{qt.example}"
                </p>
              </div>

              {/* Expandable details */}
              <AnimatePresence>
                {active === qt.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-2 space-y-2 border-t border-black/10 mt-1">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-ucm-gray-500 font-semibold">
                          Answer Format
                        </span>
                        <p className="text-xs text-ucm-gray-600 mt-0.5">
                          {qt.answerFormat}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-ucm-gray-500 font-semibold">
                          Stress Vulnerability
                        </span>
                        <p className="text-xs text-ucm-gray-600 mt-0.5">
                          {qt.vulnerability}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="text-[10px] text-ucm-gray-400 mt-2 text-right">
                {active === qt.id ? "Click to collapse" : "Click for details"}
              </p>
            </motion.div>
          </AnimatedStep>
        ))}
      </div>

      <AnimatedStep delay={0.6}>
        <p className="text-center text-xs text-ucm-gray-400 mt-8 max-w-xl mx-auto">
          Results in the next section show how each question type responds to
          stress — factoid questions lose the most, yes/no questions survive the most.
        </p>
      </AnimatedStep>
    </SectionWrapper>
  );
}
