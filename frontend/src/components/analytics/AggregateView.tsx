"use client";

import { useStore } from "@/store/useStore";
import { Card } from "@/components/ui/card";
import type { AggregateGroup } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

const METRIC_COLORS: Record<string, string> = {
  "MAP@k": "#3b82f6",
  SCR: "#10b981",
  "Task Score": "#f59e0b",
  "nDCG@k": "#8b5cf6",
};

function MetricTable({
  groups,
  groupLabel,
}: {
  groups: AggregateGroup[];
  groupLabel: string;
}) {
  const fmt = (v: number | null) =>
    v === null ? "--" : (v * 100).toFixed(1) + "%";
  const fmtDec = (v: number | null) => (v === null ? "--" : v.toFixed(3));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-left text-gray-500">
            <th className="py-2 pr-3 font-medium">{groupLabel}</th>
            <th className="py-2 px-2 font-medium">N</th>
            <th className="py-2 px-2 font-medium">MAP@k</th>
            <th className="py-2 px-2 font-medium">MRR@k</th>
            <th className="py-2 px-2 font-medium">nDCG@k</th>
            <th className="py-2 px-2 font-medium">P@k</th>
            <th className="py-2 px-2 font-medium">SCR</th>
            <th className="py-2 px-2 font-medium">CP</th>
            <th className="py-2 px-2 font-medium">Entailment</th>
            <th className="py-2 px-2 font-medium">Task</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.group} className="border-b hover:bg-gray-50">
              <td className="py-2 pr-3 font-medium text-gray-700">
                {g.group}
              </td>
              <td className="py-2 px-2 text-gray-500">{g.count}</td>
              <td className="py-2 px-2">{fmt(g.avg_map)}</td>
              <td className="py-2 px-2">{fmt(g.avg_mrr)}</td>
              <td className="py-2 px-2">{fmt(g.avg_ndcg)}</td>
              <td className="py-2 px-2">{fmt(g.avg_precision)}</td>
              <td className="py-2 px-2">{fmt(g.avg_scr)}</td>
              <td className="py-2 px-2">{fmt(g.avg_cp)}</td>
              <td className="py-2 px-2">{fmtDec(g.avg_entailment)}</td>
              <td className="py-2 px-2">{fmt(g.avg_task_score)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AggregateView() {
  const { aggregateByCondition, aggregateByQuestionType } = useStore();

  if (!aggregateByCondition || !aggregateByQuestionType) {
    return (
      <p className="text-center py-8 text-gray-400 text-sm">
        No aggregate data available. Run experiments first.
      </p>
    );
  }

  if (
    aggregateByCondition.groups.length === 0 &&
    aggregateByQuestionType.groups.length === 0
  ) {
    return (
      <p className="text-center py-8 text-gray-400 text-sm">
        No experiment data found. Run some evaluations first to see aggregate
        analytics.
      </p>
    );
  }

  const chartData = aggregateByCondition.groups.map((g) => ({
    condition: g.group.replace(/_/g, " "),
    "MAP@k": g.avg_map ?? 0,
    SCR: g.avg_scr ?? 0,
    "Task Score": g.avg_task_score ?? 0,
    "nDCG@k": g.avg_ndcg ?? 0,
  }));

  const radarData = aggregateByQuestionType.groups.map((g) => ({
    type: g.group,
    "MAP@k": g.avg_map ?? 0,
    SCR: g.avg_scr ?? 0,
    "Task Score": g.avg_task_score ?? 0,
  }));

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Average Metrics by Condition
        </h3>
        <MetricTable
          groups={aggregateByCondition.groups}
          groupLabel="Condition"
        />
      </Card>

      {chartData.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Metric Degradation by Condition
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="condition"
                tick={{ fontSize: 10 }}
                angle={-25}
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
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="MAP@k"
                fill={METRIC_COLORS["MAP@k"]}
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="SCR"
                fill={METRIC_COLORS["SCR"]}
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="Task Score"
                fill={METRIC_COLORS["Task Score"]}
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="nDCG@k"
                fill={METRIC_COLORS["nDCG@k"]}
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Average Metrics by Question Type
        </h3>
        <MetricTable
          groups={aggregateByQuestionType.groups}
          groupLabel="Question Type"
        />
      </Card>

      {radarData.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Performance Profile by Question Type
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="type" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis domain={[0, 1]} tick={{ fontSize: 9 }} />
              <Radar
                name="MAP@k"
                dataKey="MAP@k"
                stroke={METRIC_COLORS["MAP@k"]}
                fill={METRIC_COLORS["MAP@k"]}
                fillOpacity={0.15}
              />
              <Radar
                name="SCR"
                dataKey="SCR"
                stroke={METRIC_COLORS["SCR"]}
                fill={METRIC_COLORS["SCR"]}
                fillOpacity={0.15}
              />
              <Radar
                name="Task Score"
                dataKey="Task Score"
                stroke={METRIC_COLORS["Task Score"]}
                fill={METRIC_COLORS["Task Score"]}
                fillOpacity={0.15}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
