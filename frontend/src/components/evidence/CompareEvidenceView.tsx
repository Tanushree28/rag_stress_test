"use client";

import { useState } from "react";
import { useStore } from "@/store/useStore";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CONDITION_COLORS: Record<string, string> = {
  clean: "#3b82f6",
  noise_30: "#f59e0b",
  noise_50: "#f97316",
  noise_70: "#ef4444",
  conflict_50: "#a855f7",
  conflict_70: "#ec4899",
  unanswerable_partial: "#6b7280",
  unanswerable_full: "#374151",
};

function PassageCard({
  passage,
  index,
  isCited,
}: {
  passage: { text: string; pmid: string; chunk_id: string; rerank_score?: number; source?: string };
  index: number;
  isCited: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const text = passage.text || "";
  const truncated = text.length > 200 && !expanded;

  return (
    <Card
      className={`p-3 text-xs transition-colors ${
        isCited ? "border-blue-200 bg-blue-50/50" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 font-mono">[{index + 1}]</span>
          {passage.pmid && (
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${passage.pmid}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
            >
              PMID: {passage.pmid}
            </a>
          )}
          {isCited && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700">
              cited
            </Badge>
          )}
        </div>
        {passage.rerank_score != null && (
          <span className="text-[9px] text-gray-400 shrink-0">
            score: {passage.rerank_score.toFixed(3)}
          </span>
        )}
      </div>
      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
        {truncated ? text.slice(0, 200) + "..." : text}
      </p>
      {text.length > 200 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-blue-500 hover:text-blue-700 mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {passage.source && (
        <p className="text-[9px] text-gray-400 mt-1">Source: {passage.source}</p>
      )}
    </Card>
  );
}

export function CompareEvidenceView() {
  const { comparisonResult } = useStore();
  const [selectedCondition, setSelectedCondition] = useState<string>("clean");

  if (!comparisonResult || comparisonResult.results.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Run conditions to see retrieved evidence with clickable PMIDs
      </div>
    );
  }

  const conditions = comparisonResult.results.map((r) => r.condition);
  const selectedResult = comparisonResult.results.find((r) => r.condition === selectedCondition);

  // Fallback if selected condition doesn't exist
  const activeResult = selectedResult || comparisonResult.results[0];
  const passages = activeResult?.passages || [];
  const citedIndices = new Set(activeResult?.citations?.map((c: number) => c - 1) || []);

  return (
    <div className="space-y-3">
      {/* Condition picker */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
          Select condition
        </p>
        <div className="flex flex-wrap gap-1">
          {conditions.map((cond) => {
            const isActive = cond === (activeResult?.condition || selectedCondition);
            const color = CONDITION_COLORS[cond] || "#6b7280";
            return (
              <button
                key={cond}
                onClick={() => setSelectedCondition(cond)}
                className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                  isActive
                    ? "text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                style={isActive ? { backgroundColor: color } : undefined}
              >
                {cond.replace(/_/g, " ")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Answer snippet */}
      {activeResult && (
        <Card className="p-3 bg-white">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">
            Answer — {activeResult.condition.replace(/_/g, " ")}
          </p>
          <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">
            {activeResult.answer}
          </p>
        </Card>
      )}

      {/* Passages */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
          Retrieved passages ({passages.length})
        </p>
        {passages.length === 0 ? (
          <p className="text-xs text-gray-400 py-3">
            No passages available for this condition.
            {activeResult?.condition?.startsWith("unanswerable") &&
              " (Expected — unanswerable conditions remove passages)"}
          </p>
        ) : (
          <div className="space-y-2">
            {passages.map((p: any, i: number) => (
              <PassageCard
                key={`${p.pmid}-${p.chunk_id}-${i}`}
                passage={p}
                index={i}
                isCited={citedIndices.has(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
