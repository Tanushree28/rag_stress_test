"use client";

import { useState } from "react";
import type { Passage } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface EvidenceCardProps {
  passage: Passage;
  index: number;
}

function getPerturbationStyle(passage: Passage) {
  if (passage.is_conflict) return { border: "border-red-300", bg: "bg-red-50", label: "Conflict", color: "destructive" as const };
  if (passage.is_noise) return { border: "border-orange-300", bg: "bg-orange-50", label: passage.noise_type === "near_miss" ? "Near-miss" : "Noise", color: "secondary" as const };
  if (passage.was_removed) return { border: "border-gray-300", bg: "bg-gray-100", label: "Removed", color: "outline" as const };
  return { border: "border-blue-200", bg: "bg-white", label: "Clean", color: "default" as const };
}

export function EvidenceCard({ passage, index }: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const style = getPerturbationStyle(passage);

  return (
    <Card
      className={`p-3 cursor-pointer transition-colors ${style.border} ${style.bg}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-mono font-medium text-gray-500">
            [{index}]
          </span>
          <span className="text-xs text-gray-500">PMID: {passage.pmid}</span>
        </div>
        <Badge variant={style.color} className="text-[10px] px-1.5 py-0">
          {style.label}
        </Badge>
      </div>
      {passage.title && (
        <p className="text-xs font-medium text-gray-700 mb-1 line-clamp-1">
          {passage.title}
        </p>
      )}
      <p className={`text-xs text-gray-600 ${expanded ? "" : "line-clamp-3"}`}>
        {passage.text}
      </p>
      {passage.rerank_score !== undefined && (
        <p className="text-[10px] text-gray-400 mt-1">
          Score: {passage.rerank_score.toFixed(3)}
        </p>
      )}
      {expanded && passage.is_conflict && passage.original_text && (
        <div className="mt-2 pt-2 border-t border-red-200">
          <p className="text-[10px] font-medium text-red-600 mb-1">
            Original text:
          </p>
          <p className="text-xs text-gray-600">{passage.original_text}</p>
        </div>
      )}
    </Card>
  );
}
