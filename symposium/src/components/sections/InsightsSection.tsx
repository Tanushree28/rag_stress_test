import { motion } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";
import { findings, implications } from "../../data/findings";

export function InsightsSection() {
  return (
    <SectionWrapper id="insights">
      <AnimatedStep>
        <h2 className="text-3xl font-bold text-center mb-2">Key Findings</h2>
        <p className="text-white/50 text-sm text-center mb-12 max-w-lg mx-auto">
          What we learned from stress-testing RAG in biomedical question
          answering
        </p>
      </AnimatedStep>

      {/* Findings */}
      <div className="space-y-6 mb-16 max-w-3xl mx-auto">
        {findings.map((f, i) => (
          <AnimatedStep key={i} delay={0.1 + i * 0.15}>
            <div className="flex gap-4 items-start">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-ucm-red flex items-center justify-center text-sm font-bold">
                {i + 1}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">
                  {f.statement}
                </h3>
                <p className="text-sm text-white/60 leading-relaxed">
                  {f.detail}
                </p>
                {f.metric && (
                  <p className="text-xs text-ucm-red mt-2 font-medium">
                    {f.metric}
                  </p>
                )}
              </div>
            </div>
          </AnimatedStep>
        ))}
      </div>

      {/* Implications */}
      <AnimatedStep delay={0.8}>
        <div className="max-w-2xl mx-auto mb-16">
          <h3 className="text-xl font-bold text-center mb-6">
            Implications for Healthcare AI
          </h3>
          <div className="space-y-3">
            {implications.map((imp, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 1.0 + i * 0.15 }}
                className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-lg p-4"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-ucm-red mt-1.5 flex-shrink-0" />
                <p className="text-sm text-white/80">{imp}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </AnimatedStep>

      {/* Closing */}
      <AnimatedStep delay={1.2}>
        <div className="text-center border-t border-white/10 pt-12">
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: 60 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 1.3 }}
            className="h-1 bg-ucm-red mx-auto mb-8"
          />
          <img
            src="./ucm-logo.jpg"
            alt="UCM"
            className="h-12 mx-auto mb-6 opacity-80"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h3 className="text-2xl font-bold mb-2">Thank You</h3>
          <p className="text-base text-white/70 mb-1">Tanushree Nepal</p>
          <p className="text-sm text-white/50">
            Graduate Assistant, Data Science and AI
          </p>
          <p className="text-sm text-white/40 mt-1">
            University of Central Missouri
          </p>
          <p className="text-xs text-white/30 mt-3">txn99360@ucmo.edu</p>
        </div>
      </AnimatedStep>
    </SectionWrapper>
  );
}
