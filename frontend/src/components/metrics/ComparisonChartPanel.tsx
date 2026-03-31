"use client";

import { useStore } from "@/store/useStore";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = {
  map_at_k: "#3b82f6",
  supported_claim_rate: "#10b981",
  task_score: "#f59e0b",
};

export function ComparisonChartPanel() {
  const { comparisonResult, currentResult } = useStore();

  if (!comparisonResult) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Run conditions to see comparison chart
      </div>
    );
  }

  const validResults = comparisonResult.results.filter((r) => r.metrics);
  const chartData = validResults.map((r) => ({
    condition: r.condition.replace(/_/g, " "),
    "MAP@k": r.metrics.retrieval.map_at_k,
    "Supported Claims": r.metrics.groundedness.supported_claim_rate,
    "Task Score": r.metrics.task.score,
  }));

  // Summary stats
  const avgMap = validResults.length
    ? validResults.reduce((s, r) => s + r.metrics.retrieval.map_at_k, 0) / validResults.length
    : 0;
  const avgScr = validResults.length
    ? validResults.reduce((s, r) => s + r.metrics.groundedness.supported_claim_rate, 0) / validResults.length
    : 0;
  const avgTask = validResults.length
    ? validResults.reduce((s, r) => s + r.metrics.task.score, 0) / validResults.length
    : 0;

  const errorCount = comparisonResult.results.filter(
    (r) => r.error || r.answer?.includes("Generation failed")
  ).length;

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-2 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Avg MAP@k</p>
          <p className="text-base font-bold text-blue-600">{(avgMap * 100).toFixed(1)}%</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Avg SCR</p>
          <p className="text-base font-bold text-emerald-600">{(avgScr * 100).toFixed(1)}%</p>
        </Card>
        <Card className="p-2 text-center">
          <p className="text-[9px] text-gray-400 uppercase tracking-wider">Avg Task</p>
          <p className="text-base font-bold text-amber-600">{(avgTask * 100).toFixed(1)}%</p>
        </Card>
      </div>

      {errorCount > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
          <p className="text-[11px] text-amber-700">
            {errorCount} condition{errorCount > 1 ? "s" : ""} failed to generate.
            Make sure Ollama is running: <code className="bg-amber-100 px-1 rounded text-[10px]">ollama serve</code>
          </p>
        </div>
      )}

      {/* Bar chart */}
      <Card className="p-3">
        <p className="text-xs font-medium text-gray-600 mb-2">
          Metrics by Condition
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ left: -10, right: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="condition"
              tick={{ fontSize: 8 }}
              angle={-35}
              textAnchor="end"
              height={55}
            />
            <YAxis tick={{ fontSize: 10 }} domain={[0, 1]} />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(v) =>
                typeof v === "number" ? v.toFixed(3) : String(v)
              }
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar
              dataKey="MAP@k"
              fill={COLORS.map_at_k}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="Supported Claims"
              fill={COLORS.supported_claim_rate}
              radius={[2, 2, 0, 0]}
            />
            <Bar
              dataKey="Task Score"
              fill={COLORS.task_score}
              radius={[2, 2, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Separator />

      {/* Per-condition metric details */}
      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-2">Per-Condition Breakdown</h3>
        <div className="space-y-2">
          {comparisonResult.results.map((r) => (
            <Card key={r.condition} className="p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{r.condition.replace(/_/g, " ")}</span>
                {r.from_cache && (
                  <span className="text-[9px] text-gray-400">cached</span>
                )}
              </div>
              {r.metrics ? (
                <div className="grid grid-cols-4 gap-1 text-[10px]">
                  <div>
                    <span className="text-gray-400">MAP</span>
                    <p className="font-medium">{(r.metrics.retrieval.map_at_k * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <span className="text-gray-400">MRR</span>
                    <p className="font-medium">{(r.metrics.retrieval.mrr_at_k * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <span className="text-gray-400">SCR</span>
                    <p className="font-medium">{(r.metrics.groundedness.supported_claim_rate * 100).toFixed(0)}%</p>
                  </div>
                  <div>
                    <span className="text-gray-400">Task</span>
                    <p className="font-medium">{(r.metrics.task.score * 100).toFixed(0)}%</p>
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-red-400">
                  {r.error ? "Error" : "No metrics"}
                </p>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* Detailed metrics for currently selected condition */}
      {currentResult?.metrics && (
        <>
          <Separator />
          <div>
            <h3 className="text-xs font-medium text-gray-600 mb-2">
              Selected: {currentResult.condition?.replace(/_/g, " ")}
            </h3>
            <div className="space-y-3">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Retrieval</p>
                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-2">
                    <p className="text-[9px] text-gray-400">MAP@k</p>
                    <p className="text-sm font-semibold">{(currentResult.metrics.retrieval.map_at_k * 100).toFixed(1)}%</p>
                  </Card>
                  <Card className="p-2">
                    <p className="text-[9px] text-gray-400">MRR@k</p>
                    <p className="text-sm font-semibold">{(currentResult.metrics.retrieval.mrr_at_k * 100).toFixed(1)}%</p>
                  </Card>
                  <Card className="p-2">
                    <p className="text-[9px] text-gray-400">nDCG@k</p>
                    <p className="text-sm font-semibold">{(currentResult.metrics.retrieval.ndcg_at_k * 100).toFixed(1)}%</p>
                  </Card>
                  <Card className="p-2">
                    <p className="text-[9px] text-gray-400">P@k</p>
                    <p className="text-sm font-semibold">{(currentResult.metrics.retrieval.precision_at_k * 100).toFixed(1)}%</p>
                  </Card>
                </div>
              </div>
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Groundedness</p>
                <div className="grid grid-cols-2 gap-2">
                  <Card className="p-2">
                    <p className="text-[9px] text-gray-400">SCR</p>
                    <p className="text-sm font-semibold">{(currentResult.metrics.groundedness.supported_claim_rate * 100).toFixed(1)}%</p>
                  </Card>
                  <Card className="p-2">
                    <p className="text-[9px] text-gray-400">Citation P</p>
                    <p className="text-sm font-semibold">{(currentResult.metrics.groundedness.citation_precision * 100).toFixed(1)}%</p>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
