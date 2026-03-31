import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SectionWrapper } from "../layout/SectionWrapper";
import { AnimatedStep } from "../shared/AnimatedStep";

interface Screenshot {
  id: string;
  src: string;
  title: string;
  description: string;
  callouts: { label: string; x: string; y: string }[];
}

const screenshots: Screenshot[] = [
  {
    id: "main",
    src: "./screenshots/main1.png",
    title: "Main Dashboard",
    description:
      "Three-panel resizable layout: controls (left), chat interface (center), and evidence panel with metrics (right)",
    callouts: [
      { label: "Question Selector", x: "8%", y: "30%" },
      { label: "Condition Controls", x: "8%", y: "55%" },
      { label: "Chat Interface", x: "45%", y: "40%" },
      { label: "Evidence Panel", x: "82%", y: "35%" },
    ],
  },
  {
    id: "analytics",
    src: "./screenshots/dashboard-analytics.png",
    title: "Analytics Dashboard",
    description:
      "Aggregate metrics across all experiments: condition summaries, degradation heatmaps, and question type breakdowns",
    callouts: [
      { label: "Condition Summary", x: "25%", y: "35%" },
      { label: "Impact Heatmap", x: "75%", y: "35%" },
      { label: "Metric Trends", x: "50%", y: "70%" },
    ],
  },
  {
    id: "history",
    src: "./screenshots/dashboard-history.png",
    title: "Experiment History",
    description:
      "Searchable log of all pipeline runs with expandable details showing full answers, metrics, and passages",
    callouts: [
      { label: "Experiment Log", x: "50%", y: "30%" },
      { label: "Expandable Details", x: "50%", y: "60%" },
    ],
  },
];

export function ShowcaseSection() {
  const [activeScreenshot, setActiveScreenshot] = useState(0);
  const [showCallouts, setShowCallouts] = useState(true);
  const current = screenshots[activeScreenshot];

  return (
    <SectionWrapper id="dashboard" dark={false}>
      <AnimatedStep>
        <h2 className="text-3xl font-bold text-center mb-2 text-ucm-black">
          Research Dashboard
        </h2>
        <p className="text-ucm-gray-500 text-sm text-center mb-8 max-w-lg mx-auto">
          A full-featured web application built to run experiments,
          visualize results, and track research progress
        </p>
      </AnimatedStep>

      {/* Tab selector */}
      <AnimatedStep delay={0.2}>
        <div className="flex justify-center gap-2 mb-6">
          {screenshots.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveScreenshot(i)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 cursor-pointer ${
                activeScreenshot === i
                  ? "bg-ucm-red text-white shadow-md"
                  : "bg-ucm-gray-100 text-ucm-gray-500 hover:bg-ucm-gray-200"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </AnimatedStep>

      {/* Screenshot display */}
      <AnimatedStep delay={0.3}>
        <div className="relative max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              {/* Screenshot container */}
              <div
                className="relative bg-ucm-gray-200 rounded-xl overflow-hidden border border-ucm-gray-200 shadow-2xl cursor-pointer"
                onClick={() => setShowCallouts(!showCallouts)}
              >
                <img
                  src={current.src}
                  alt={current.title}
                  className="w-full h-auto"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                    target.parentElement!.classList.add(
                      "min-h-80",
                      "flex",
                      "items-center",
                      "justify-center"
                    );
                    const placeholder = document.createElement("div");
                    placeholder.className = "text-center p-8";
                    placeholder.innerHTML = `
                      <div class="text-ucm-gray-500 mb-2">
                        <svg class="w-16 h-16 mx-auto opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p class="text-sm text-ucm-gray-500">${current.title} screenshot</p>
                      <p class="text-xs text-ucm-gray-500/60 mt-1">Add screenshot to public/screenshots/</p>
                    `;
                    target.parentElement!.appendChild(placeholder);
                  }}
                />

                {/* Callout labels */}
                {showCallouts &&
                  current.callouts.map((c, i) => (
                    <motion.div
                      key={c.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 + i * 0.15 }}
                      className="absolute"
                      style={{ left: c.x, top: c.y }}
                    >
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 bg-ucm-red rounded-full animate-pulse shadow-lg shadow-ucm-red/40" />
                        <span className="text-[10px] font-semibold bg-ucm-red text-white px-2 py-0.5 rounded shadow-lg whitespace-nowrap">
                          {c.label}
                        </span>
                      </div>
                    </motion.div>
                  ))}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Description */}
          <motion.p
            key={current.id + "-desc"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-ucm-gray-500 text-center mt-4"
          >
            {current.description}
          </motion.p>
          <p className="text-xs text-ucm-gray-500/50 text-center mt-1">
            Click the image to toggle callout labels
          </p>
        </div>
      </AnimatedStep>
    </SectionWrapper>
  );
}
