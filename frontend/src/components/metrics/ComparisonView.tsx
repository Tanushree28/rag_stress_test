"use client";

import { useStore } from "@/store/useStore";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { CompareResult } from "@/lib/api";

const COLORS = {
  map_at_k: "#3b82f6",
  supported_claim_rate: "#10b981",
  task_score: "#f59e0b",
};

function ConditionCard({ r }: { r: CompareResult }) {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium">{r.condition}</span>
        <div className="flex items-center gap-1">
          {r.from_cache && (
            <Badge variant="outline" className="text-[9px] text-gray-400">
              cached
            </Badge>
          )}
          <span className="text-[10px] text-gray-400">{r.duration_s}s</span>
        </div>
      </div>
      {r.metrics ? (
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div>
            <span className="text-gray-500">MAP@k</span>
            <p className="font-medium">
              {(r.metrics.retrieval.map_at_k * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <span className="text-gray-500">SCR</span>
            <p className="font-medium">
              {(r.metrics.groundedness.supported_claim_rate * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <span className="text-gray-500">Task</span>
            <p className="font-medium">
              {(r.metrics.task.score * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      ) : r.error ? (
        <p className="text-xs text-red-500">{r.error}</p>
      ) : null}
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-1">
        <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="h-6 bg-gray-100 rounded animate-pulse" />
        <div className="h-6 bg-gray-100 rounded animate-pulse" />
        <div className="h-6 bg-gray-100 rounded animate-pulse" />
      </div>
    </Card>
  );
}

export function ComparisonView() {
  const {
    comparisonResult,
    isComparing,
    partialResults,
    completedConditions,
    totalConditions,
  } = useStore();

  // While comparing, show progressive results
  if (isComparing) {
    const pending = totalConditions - completedConditions;
    return (
      <div className="space-y-4">
        <div className="text-center py-2">
          <p className="text-sm text-gray-500">
            {completedConditions}/{totalConditions} conditions complete
          </p>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
            <div
              className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
              style={{
                width: totalConditions
                  ? `${(completedConditions / totalConditions) * 100}%`
                  : "0%",
              }}
            />
          </div>
        </div>

        {/* Show completed condition cards */}
        <div className="space-y-2">
          {partialResults.map((r) => (
            <ConditionCard key={r.condition} r={r} />
          ))}
          {/* Skeleton cards for pending conditions */}
          {Array.from({ length: pending }).map((_, i) => (
            <SkeletonCard key={`skeleton-${i}`} />
          ))}
        </div>
      </div>
    );
  }

  if (!comparisonResult) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Select a question and choose conditions to compare
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

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-1">
          {comparisonResult.question_type} question
        </h3>
        <p className="text-xs text-gray-500 line-clamp-2">
          {comparisonResult.question}
        </p>
      </div>

      <Card className="p-3">
        <p className="text-xs font-medium text-gray-600 mb-2">
          Metrics by Condition
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ left: -10, right: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="condition"
              tick={{ fontSize: 9 }}
              angle={-30}
              textAnchor="end"
              height={60}
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

      <div className="space-y-2">
        {comparisonResult.results.map((r) => (
          <ConditionCard key={r.condition} r={r} />
        ))}
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-2">
          Answers by Condition
        </h3>
        <div className="space-y-2">
          {comparisonResult.results
            .filter((r) => r.answer)
            .map((r) => (
              <Card key={`answer-${r.condition}`} className="p-3">
                <p className="text-xs font-medium mb-1">{r.condition}</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap">{r.answer}</p>
                {r.citations && r.citations.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.citations.map((c) => (
                      <Badge key={c} variant="secondary" className="text-[10px]">
                        [{c}]
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
        </div>
      </div>
    </div>
  );
}
