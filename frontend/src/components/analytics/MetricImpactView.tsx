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
  ReferenceLine,
} from "recharts";

function heatColor(value: number | null): string {
  if (value === null) return "#f3f4f6";
  const r = Math.round(255 * (1 - value));
  const g = Math.round(200 * value);
  return `rgb(${r}, ${g}, 80)`;
}

function extractRetrieval(g: AggregateGroup): number {
  const vals = [g.avg_map, g.avg_ndcg, g.avg_mrr].filter(
    (v): v is number => v !== null
  );
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function extractGroundedness(g: AggregateGroup): number {
  const vals = [g.avg_scr, g.avg_cp].filter(
    (v): v is number => v !== null
  );
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

function extractTask(g: AggregateGroup): number {
  return g.avg_task_score ?? 0;
}

export function MetricImpactView() {
  const { aggregateByCondition } = useStore();

  if (
    !aggregateByCondition ||
    aggregateByCondition.groups.length === 0
  ) {
    return (
      <p className="text-center py-8 text-gray-400 text-sm">
        No aggregate data available. Run experiments first.
      </p>
    );
  }

  const groups = aggregateByCondition.groups;
  const cleanGroup = groups.find((g) => g.group === "clean");

  const metricFamilies = [
    { label: "Retrieval", extract: extractRetrieval },
    { label: "Groundedness", extract: extractGroundedness },
    { label: "Task", extract: extractTask },
  ];

  const heatmapRows = metricFamilies.map((family) => ({
    family: family.label,
    values: Object.fromEntries(
      groups.map((g) => [g.group, family.extract(g)])
    ) as Record<string, number>,
  }));

  const deltaData = groups
    .filter((g) => g.group !== "clean")
    .map((g) => ({
      condition: g.group.replace(/_/g, " "),
      "Retrieval Delta":
        cleanGroup
          ? extractRetrieval(g) - extractRetrieval(cleanGroup)
          : 0,
      "Groundedness Delta":
        cleanGroup
          ? extractGroundedness(g) - extractGroundedness(cleanGroup)
          : 0,
      "Task Delta":
        cleanGroup
          ? extractTask(g) - extractTask(cleanGroup)
          : 0,
    }));

  const fmt = (v: number) => (v * 100).toFixed(1) + "%";

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Impact Matrix: Metric Families vs. Conditions
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-3 font-medium">Metric Family</th>
                {groups.map((g) => (
                  <th
                    key={g.group}
                    className="py-2 px-2 font-medium text-center"
                  >
                    {g.group.replace(/_/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapRows.map((row) => (
                <tr key={row.family} className="border-b">
                  <td className="py-2 pr-3 font-medium text-gray-700">
                    {row.family}
                  </td>
                  {groups.map((g) => {
                    const val = row.values[g.group];
                    return (
                      <td
                        key={g.group}
                        className="py-2 px-2 text-center font-mono"
                        style={{
                          backgroundColor: heatColor(val),
                          color: val > 0.5 ? "#1f2937" : "#ffffff",
                        }}
                      >
                        {fmt(val)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-gray-400 mt-2">
          Cell color: green = higher score, red = lower score
        </p>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Performance Degradation from Clean Baseline
        </h3>
        {!cleanGroup ? (
          <p className="text-xs text-gray-400">
            No clean baseline data available. Run at least one clean experiment.
          </p>
        ) : deltaData.length === 0 ? (
          <p className="text-xs text-gray-400">
            Run experiments with perturbation conditions to see degradation.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={deltaData} margin={{ bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="condition"
                tick={{ fontSize: 10 }}
                angle={-25}
                textAnchor="end"
                height={60}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Tooltip
                contentStyle={{ fontSize: 11 }}
                formatter={(v) =>
                  typeof v === "number"
                    ? `${(v * 100).toFixed(1)}%`
                    : String(v)
                }
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
              <Bar
                dataKey="Retrieval Delta"
                fill="#3b82f6"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="Groundedness Delta"
                fill="#10b981"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="Task Delta"
                fill="#f59e0b"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          Negative values indicate degradation from the clean baseline.
        </p>
      </Card>
    </div>
  );
}
