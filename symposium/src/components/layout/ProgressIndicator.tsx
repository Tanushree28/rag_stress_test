import { useState, useEffect } from "react";

const sectionIds = ["hero", "concepts", "demo", "stress", "dashboard", "insights"];

export function ProgressIndicator() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = sectionIds.indexOf(entry.target.id);
            if (idx !== -1) setActiveIndex(idx);
          }
        });
      },
      { threshold: 0.5 }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3">
      {sectionIds.map((id, i) => (
        <button
          key={id}
          onClick={() => scrollTo(id)}
          className="group relative cursor-pointer"
          aria-label={`Go to ${id} section`}
        >
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
              i === activeIndex
                ? "bg-ucm-red scale-125"
                : "bg-white/30 hover:bg-white/60"
            }`}
          />
          <span className="absolute right-6 top-1/2 -translate-y-1/2 text-xs text-white/70 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-ucm-black/80 px-2 py-1 rounded">
            {id.charAt(0).toUpperCase() + id.slice(1)}
          </span>
        </button>
      ))}
    </div>
  );
}
