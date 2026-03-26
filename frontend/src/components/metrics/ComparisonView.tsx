"use client";

import { useStore } from "@/store/useStore";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

export function ComparisonView() {
  const { comparisonResult, isComparing } = useStore();

  if (isComparing) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Running comparison across conditions...
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

  const chartData = comparisonResult.results.map((r) => ({
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
          <Card key={r.condition} className="p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">{r.condition}</span>
              <span className="text-[10px] text-gray-400">
                {r.duration_s}s
              </span>
            </div>
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
                  {(r.metrics.groundedness.supported_claim_rate * 100).toFixed(
                    1
                  )}
                  %
                </p>
              </div>
              <div>
                <span className="text-gray-500">Task</span>
                <p className="font-medium">
                  {(r.metrics.task.score * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-2">
          Answers by Condition
        </h3>
        <div className="space-y-2">
          {comparisonResult.results.map((r) => (
            <Collapsible key={`answer-${r.condition}`}>
              <Card className="p-3">
                <CollapsibleTrigger className="w-full text-left cursor-pointer">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{r.condition}</span>
                    <span className="text-[10px] text-gray-400">
                      Click to expand answer
                    </span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">
                    {r.answer}
                  </p>
                  {r.citations && r.citations.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.citations.map((c) => (
                        <Badge
                          key={c}
                          variant="secondary"
                          className="text-[10px]"
                        >
                          [{c}]
                        </Badge>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Card>
            </Collapsible>
          ))}
        </div>
      </div>
    </div>
  );
}
