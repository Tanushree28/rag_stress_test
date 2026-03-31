import { type ReactNode, forwardRef } from "react";
import { motion } from "framer-motion";

interface SectionWrapperProps {
  children: ReactNode;
  id: string;
  className?: string;
  dark?: boolean;
}

export const SectionWrapper = forwardRef<HTMLElement, SectionWrapperProps>(
  function SectionWrapper({ children, id, className = "", dark = true }, ref) {
    return (
      <section
        ref={ref}
        id={id}
        className={`min-h-screen w-full snap-start snap-always flex flex-col items-center justify-center relative overflow-hidden px-8 py-16 ${
          dark ? "bg-ucm-black text-white" : "bg-ucm-gray-50 text-ucm-gray-800"
        } ${className}`}
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.8 }}
          className="w-full max-w-6xl mx-auto"
        >
          {children}
        </motion.div>
      </section>
    );
  }
);
