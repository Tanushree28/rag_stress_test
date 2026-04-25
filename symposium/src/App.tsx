import { useEffect, useCallback } from "react";
import { Header } from "./components/layout/Header";
import { ProgressIndicator } from "./components/layout/ProgressIndicator";
import { HeroSection } from "./components/sections/HeroSection";
import { ConceptSection } from "./components/sections/ConceptSection";
import { DemoSection } from "./components/sections/DemoSection";
import { StressTestSection } from "./components/sections/StressTestSection";
import { QuestionTypesSection } from "./components/sections/QuestionTypesSection";
import { ShowcaseSection } from "./components/sections/ShowcaseSection";
import { ResultsSection } from "./components/sections/ResultsSection";
import { InsightsSection } from "./components/sections/InsightsSection";

const sectionIds = [
  "hero",
  "concepts",
  "demo",
  "questions",
  "stress",
  "dashboard",
  "results",
  "insights",
];

function getCurrentSectionIndex(): number {
  const scrollTop = window.scrollY + window.innerHeight / 2;
  for (let i = sectionIds.length - 1; i >= 0; i--) {
    const el = document.getElementById(sectionIds[i]);
    if (el && el.offsetTop <= scrollTop) return i;
  }
  return 0;
}

function navigateSection(direction: number) {
  const currentIndex = getCurrentSectionIndex();
  const nextIndex = Math.max(
    0,
    Math.min(sectionIds.length - 1, currentIndex + direction)
  );
  document
    .getElementById(sectionIds[nextIndex])
    ?.scrollIntoView({ behavior: "smooth" });
}

export default function App() {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't intercept keyboard when focus is on interactive elements
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

    if (
      e.key === "ArrowDown" ||
      e.key === "ArrowRight" ||
      e.key === " "
    ) {
      e.preventDefault();
      navigateSection(1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      navigateSection(-1);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <>
      <Header />
      <ProgressIndicator />
      <main>
        <HeroSection />
        <ConceptSection />
        <DemoSection />
        <QuestionTypesSection />
        <StressTestSection />
        <ShowcaseSection />
        <ResultsSection />
        <InsightsSection />
      </main>
    </>
  );
}
