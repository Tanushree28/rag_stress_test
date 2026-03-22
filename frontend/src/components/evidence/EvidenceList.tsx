"use client";

import { useStore } from "@/store/useStore";
import { EvidenceCard } from "./EvidenceCard";

export function EvidenceList() {
  const { currentResult } = useStore();

  if (!currentResult) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Run a query to see retrieved evidence
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-2">
        {currentResult.passages.length} passages retrieved
      </p>
      {currentResult.passages.map((passage, idx) => (
        <EvidenceCard key={passage.chunk_id || idx} passage={passage} index={idx + 1} />
      ))}
    </div>
  );
}
