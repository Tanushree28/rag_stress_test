import { motion } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";

function FloatingDoc({ delay, x, y }: { delay: number; x: string; y: string }) {
  return (
    <motion.div
      className="absolute w-8 h-10 rounded border border-white/10 bg-white/5"
      style={{ left: x, top: y }}
      initial={{ opacity: 0, y: 20 }}
      animate={{
        opacity: [0, 0.3, 0.1, 0.3, 0],
        y: [20, -10, 0, -15, 20],
      }}
      transition={{
        duration: 8,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    >
      <div className="mt-2 mx-1.5 space-y-1">
        <div className="h-[1px] bg-white/20 w-full" />
        <div className="h-[1px] bg-white/15 w-3/4" />
        <div className="h-[1px] bg-white/10 w-full" />
      </div>
    </motion.div>
  );
}

export function HeroSection() {
  return (
    <SectionWrapper id="hero" className="relative">
      {/* Floating document icons in background */}
      <FloatingDoc delay={0} x="10%" y="20%" />
      <FloatingDoc delay={1.5} x="85%" y="15%" />
      <FloatingDoc delay={3} x="75%" y="70%" />
      <FloatingDoc delay={2} x="15%" y="75%" />
      <FloatingDoc delay={4} x="50%" y="10%" />
      <FloatingDoc delay={2.5} x="90%" y="50%" />
      <FloatingDoc delay={1} x="5%" y="45%" />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-ucm-red/5 via-transparent to-transparent pointer-events-none" />

      <div className="text-center relative z-10">
        {/* Red accent line */}
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: 80 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="h-1 bg-ucm-red mx-auto mb-8"
        />

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight max-w-4xl mx-auto"
        >
          What Hurts Retrieval-Augmented Generation in Biomedical Question
          Answering
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.7 }}
          className="text-xl md:text-2xl text-ucm-red font-medium mt-6 max-w-3xl mx-auto"
        >
          A Stress-Test Study of Noise, Conflict and Unanswerability
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 1.0 }}
          className="mt-12 space-y-1"
        >
          <p className="text-base font-medium text-white/90">
            Tanushree Nepal
          </p>
          <p className="text-sm text-white/60">
            Graduate Assistant, Data Science and AI
          </p>
          <p className="text-sm text-white/40">
            700779936 &middot; txn99360@ucmo.edu
          </p>
        </motion.div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
          className="mt-16"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="inline-flex flex-col items-center text-white/30"
          >
            <span className="text-xs mb-2">Scroll to explore</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </motion.div>
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
