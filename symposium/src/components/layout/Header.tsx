import { motion } from "framer-motion";

const sections = [
  { id: "hero", label: "Home" },
  { id: "concepts", label: "Concepts" },
  { id: "demo", label: "Demo" },
  { id: "stress", label: "Stress Test" },
  { id: "dashboard", label: "Dashboard" },
  { id: "insights", label: "Insights" },
];

export function Header() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-ucm-black/80 backdrop-blur-md border-b border-white/10"
    >
      <div className="flex items-center gap-3">
        <img
          src="./ucm-logo.jpg"
          alt="UCM"
          className="h-8 w-auto"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <span className="text-sm font-semibold text-white tracking-wide">
          UCM
        </span>
      </div>

      <nav className="flex items-center gap-1">
        {sections.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className="px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white hover:bg-white/10 rounded-md transition-all duration-200 cursor-pointer"
          >
            {s.label}
          </button>
        ))}
      </nav>
    </motion.header>
  );
}
