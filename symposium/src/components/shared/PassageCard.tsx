import { motion } from "framer-motion";
import type { DemoPassage } from "../../data/demo-questions";

interface PassageCardProps {
  passage: DemoPassage;
  index: number;
}

const labelColors: Record<string, string> = {
  clean: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  noise: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  conflict: "bg-red-500/20 text-red-300 border-red-500/30",
  removed: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export function PassageCard({ passage, index }: PassageCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
      className="bg-white/5 border border-white/10 rounded-lg p-4 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ucm-red">#{passage.rank}</span>
          <span className="text-xs text-white/50">PMID: {passage.pmid}</span>
        </div>
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full border ${
            labelColors[passage.label]
          }`}
        >
          {passage.label}
        </span>
      </div>
      <p className="text-xs font-medium text-white/80 mb-1">{passage.title}</p>
      <p className="text-xs text-white/50 leading-relaxed">{passage.snippet}</p>
    </motion.div>
  );
}
