"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SignificanceResult } from "@/lib/api";
import { Card } from "@/components/ui/card";

const METRICS: Array<{ key: string; label: string }> = [
  { key: "map_at_k", label: "MAP@k" },
  { key: "ndcg_at_k", label: "nDCG@k" },
  { key: "mrr_at_k", label: "MRR@k" },
  { key: "scr", label: "SCR" },
  { key: "citation_precision", label: "Citation P" },
  { key: "entailment", label: "Entail" },
  { key: "task_score", label: "Task" },
];

const CONDITION_ORDER = [
  "noise_30",
  "noise_50",
  "noise_70",
  "conflict_50",
  "conflict_70",
  "unanswerable_partial",
  "unanswerable_full",
];

function starsFor(p: number | null | undefined): string {
  if (p == null) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

function pColor(p: number | null | undefined): string {
  if (p == null) return "#9ca3af";
  if (p < 0.001) return "#059669";
  if (p < 0.01) return "#10b981";
  if (p < 0.05) return "#84cc16";
  return "#9ca3af";
}

function formatP(p: number | null | undefined): string {
  if (p == null) return "n/a";
  if (p < 1e-10) return p.toExponential(1);
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(3);
}

function dMagnitude(d: number | null | undefined): string {
  if (d == null) return "";
  const abs = Math.abs(d);
  if (abs < 0.2) return "negligible";
  if (abs < 0.5) return "small";
  if (abs < 0.8) return "medium";
  return "large";
}

export function SignificanceView() {
  const [results, setResults] = useState<SignificanceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<"wilcoxon" | "ttest">("wilcoxon");
  const [baseline, setBaseline] = useState("clean");

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getSignificance({ baseline, test })
      .then((r) => setResults(r.results))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load")
      )
      .finally(() => setLoading(false));
  }, [baseline, test]);

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          Running significance tests...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  // Sort results by CONDITION_ORDER
  const ordered = [...results].sort(
    (a, b) =>
      (CONDITION_ORDER.indexOf(a.condition) + 100) -
      (CONDITION_ORDER.indexOf(b.condition) + 100)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-100 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Paired Significance Tests vs {baseline}
        </h3>
        <p className="text-xs text-gray-600 leading-relaxed">
          Each cell compares a condition against the baseline on matched
          question-IDs. Reports p-value, Cohen&apos;s d effect size, and
          Δ (mean difference). Lower p = stronger evidence the metric actually
          changed. Stars mark p{"<"}0.05 (*), p{"<"}0.01 (**), p{"<"}0.001 (***).
        </p>
      </div>

      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-2 text-gray-600">
          Test:
          <select
            value={test}
            onChange={(e) => setTest(e.target.value as "wilcoxon" | "ttest")}
            className="border border-gray-200 rounded-md px-2 py-1 bg-white"
          >
            <option value="wilcoxon">Wilcoxon signed-rank</option>
            <option value="ttest">Paired t-test</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-gray-600">
          Baseline:
          <select
            value={baseline}
            onChange={(e) => setBaseline(e.target.value)}
            className="border border-gray-200 rounded-md px-2 py-1 bg-white"
          >
            <option value="clean">clean</option>
            <option value="noise_30">noise_30</option>
            <option value="noise_50">noise_50</option>
          </select>
        </label>
      </div>

      {ordered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">
            No paired data available for baseline &quot;{baseline}&quot;.
          </p>
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700">
                  Condition
                </th>
                {METRICS.map((m) => (
                  <th
                    key={m.key}
                    className="px-3 py-2 text-left font-semibold text-gray-700 border-l border-gray-200"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr
                  key={row.condition}
                  className="border-b border-gray-100 hover:bg-gray-50/50"
                >
                  <td className="sticky left-0 bg-white px-3 py-2 font-medium text-gray-800 whitespace-nowrap">
                    {row.condition.replace(/_/g, " ")}
                  </td>
                  {METRICS.map((m) => {
                    const cell = row.metrics[m.key];
                    if (!cell || cell.p_value == null) {
                      return (
                        <td
                          key={m.key}
                          className="px-3 py-2 text-gray-300 border-l border-gray-100"
                        >
                          —
                        </td>
                      );
                    }
                    const p = cell.p_value;
                    const d = cell.cohens_d;
                    const diff = cell.mean_diff;
                    return (
                      <td
                        key={m.key}
                        className="px-3 py-2 border-l border-gray-100 leading-tight"
                      >
                        <div
                          className="font-mono font-semibold"
                          style={{ color: pColor(p) }}
                        >
                          p = {formatP(p)}
                          <span className="ml-1">{starsFor(p)}</span>
                        </div>
                        {d != null && (
                          <div className="text-gray-500">
                            d = {d.toFixed(2)}{" "}
                            <span className="text-gray-400">
                              ({dMagnitude(d)})
                            </span>
                          </div>
                        )}
                        {diff != null && (
                          <div className="text-gray-400 text-[10px]">
                            Δ = {diff > 0 ? "+" : ""}
                            {(diff * 100).toFixed(1)}%
                          </div>
                        )}
                        {cell.n_pairs != null && (
                          <div className="text-gray-300 text-[10px]">
                            n = {cell.n_pairs}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <div className="text-[11px] text-gray-500 leading-relaxed space-y-1">
        <p>
          <span className="font-semibold">p-value:</span> probability of
          observing a difference at least this large if the perturbation had no
          effect.
        </p>
        <p>
          <span className="font-semibold">Cohen&apos;s d:</span> effect size on
          paired differences. 0.2 = small, 0.5 = medium, 0.8+ = large.
        </p>
        <p>
          <span className="font-semibold">Δ:</span> absolute change in the
          metric (condition − baseline), in percentage points.
        </p>
      </div>
    </div>
  );
}
