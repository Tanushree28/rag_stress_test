import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";
import { getMetricsByCategory, stressResults } from "../../data/stress-results";

type Category = "noise" | "conflict" | "unanswerable";

const categories: { id: Category; label: string; desc: string }[] = [
  {
    id: "noise",
    label: "Noise",
    desc: "Irrelevant passages are injected into the evidence pool, diluting useful information",
  },
  {
    id: "conflict",
    label: "Conflict",
    desc: "Some retrieved evidence is rewritten to say the opposite, creating contradictions the AI must navigate",
  },
  {
    id: "unanswerable",
    label: "Unanswerable",
    desc: "Answer-bearing passages are removed, forcing the system to work without key evidence",
  },
];

function ConditionAnimation({ category }: { category: Category }) {
  const docs = [1, 2, 3, 4, 5];

  if (category === "noise") {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        {docs.map((d) => (
          <motion.div
            key={d}
            className="w-12 h-16 rounded border flex items-center justify-center text-xs font-bold"
            animate={
              d > 3
                ? {
                    backgroundColor: [
                      "rgba(59,130,246,0.2)",
                      "rgba(249,115,22,0.3)",
                    ],
                    borderColor: [
                      "rgba(59,130,246,0.4)",
                      "rgba(249,115,22,0.5)",
                    ],
                    color: ["rgba(147,197,253,1)", "rgba(253,186,116,1)"],
                  }
                : {}
            }
            transition={{
              duration: 1.5,
              repeat: Infinity,
              repeatType: "reverse",
            }}
            style={{
              backgroundColor: d <= 3 ? "rgba(59,130,246,0.2)" : undefined,
              borderColor: d <= 3 ? "rgba(59,130,246,0.4)" : undefined,
              color: d <= 3 ? "rgba(147,197,253,1)" : undefined,
            }}
          >
            {d <= 3 ? "OK" : "?"}
          </motion.div>
        ))}
      </div>
    );
  }

  if (category === "conflict") {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        {docs.map((d) => (
          <motion.div
            key={d}
            className="w-12 h-16 rounded border flex items-center justify-center text-xs font-bold"
            animate={
              d === 2 || d === 4
                ? {
                    rotateY: [0, 180, 360],
                    backgroundColor: [
                      "rgba(59,130,246,0.2)",
                      "rgba(239,68,68,0.3)",
                      "rgba(239,68,68,0.3)",
                    ],
                    borderColor: [
                      "rgba(59,130,246,0.4)",
                      "rgba(239,68,68,0.5)",
                      "rgba(239,68,68,0.5)",
                    ],
                  }
                : {}
            }
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatType: "reverse",
            }}
            style={{
              backgroundColor:
                d !== 2 && d !== 4 ? "rgba(59,130,246,0.2)" : undefined,
              borderColor:
                d !== 2 && d !== 4 ? "rgba(59,130,246,0.4)" : undefined,
              color:
                d !== 2 && d !== 4
                  ? "rgba(147,197,253,1)"
                  : "rgba(252,165,165,1)",
            }}
          >
            {d === 2 || d === 4 ? "!!" : "OK"}
          </motion.div>
        ))}
      </div>
    );
  }

  // Unanswerable
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {docs.map((d) => (
        <motion.div
          key={d}
          className="w-12 h-16 rounded border border-blue-500/40 bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-300"
          animate={
            d >= 3
              ? {
                  opacity: [1, 0.1],
                  scale: [1, 0.8],
                }
              : {}
          }
          transition={{
            duration: 1.5,
            delay: (d - 3) * 0.4,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        >
          {d < 3 ? "OK" : "..."}
        </motion.div>
      ))}
    </div>
  );
}

function MetricChart({ category }: { category: Category }) {
  const data = getMetricsByCategory(category).map((r) => ({
    condition: r.label,
    "MAP@k": r.metrics.retrieval.map_at_k,
    "Supported Claims": r.metrics.groundedness.supported_claim_rate,
    "Task Score": r.metrics.task.score,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: -10, right: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="condition"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }}
          angle={-20}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }}
          domain={[0, 1]}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#1F2937",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            fontSize: 11,
            color: "#fff",
          }}
          formatter={(v) =>
            typeof v === "number" ? v.toFixed(3) : String(v)
          }
        />
        <Legend wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }} />
        <Bar dataKey="MAP@k" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Supported Claims" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Task Score" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function AnswerComparison({ category }: { category: Category }) {
  const clean = stressResults.find((r) => r.condition === "clean")!;
  const worstMap: Record<Category, string> = {
    noise: "noise_70",
    conflict: "conflict_70_30",
    unanswerable: "unanswerable_full",
  };
  const stressed = stressResults.find((r) => r.condition === worstMap[category])!;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
        <span className="text-[10px] uppercase tracking-wider text-green-400 font-semibold">
          Clean Answer
        </span>
        <p className="text-xs text-white/80 mt-2 leading-relaxed">
          {clean.answer}
        </p>
      </div>
      <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
        <span className="text-[10px] uppercase tracking-wider text-red-400 font-semibold">
          {stressed.label} Answer
        </span>
        <p className="text-xs text-white/80 mt-2 leading-relaxed">
          {stressed.answer}
        </p>
      </div>
    </div>
  );
}

export function StressTestSection() {
  const [activeCategory, setActiveCategory] = useState<Category>("noise");

  return (
    <SectionWrapper id="stress">
      <AnimatedStep>
        <h2 className="text-3xl font-bold text-center mb-2">
          Stress Testing the Pipeline
        </h2>
        <p className="text-white/50 text-sm text-center mb-8 max-w-lg mx-auto">
          What happens when the evidence is corrupted? We test three adversarial
          conditions.
        </p>
      </AnimatedStep>

      {/* Category selector */}
      <AnimatedStep delay={0.2}>
        <div className="flex justify-center gap-3 mb-8">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-5 py-3 rounded-xl border text-sm font-medium transition-all duration-300 cursor-pointer ${
                activeCategory === cat.id
                  ? "bg-ucm-red border-ucm-red text-white shadow-lg shadow-ucm-red/20"
                  : "bg-white/5 border-white/15 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </AnimatedStep>

      {/* Active category details */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeCategory}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {/* Description + Animation */}
          <div className="text-center">
            <p className="text-sm text-white/70 mb-4 max-w-md mx-auto">
              {categories.find((c) => c.id === activeCategory)?.desc}
            </p>
            <ConditionAnimation category={activeCategory} />
          </div>

          {/* Metrics chart */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <h4 className="text-sm font-semibold mb-4 text-white/80">
              Performance Under {categories.find((c) => c.id === activeCategory)?.label} Conditions
            </h4>
            <MetricChart category={activeCategory} />
          </div>

          {/* Answer comparison */}
          <div>
            <h4 className="text-sm font-semibold mb-3 text-white/80">
              Answer Comparison: Clean vs Worst Case
            </h4>
            <AnswerComparison category={activeCategory} />
          </div>
        </motion.div>
      </AnimatePresence>
    </SectionWrapper>
  );
}
