"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { DegradationCondition, CrosstabRow } from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ErrorBar,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

// ---- Perturbation Families (ordered by intensity) ----

interface CurveFamily {
  label: string;
  description: string;
  conditions: string[];
  xLabels: string[];
  color: string;
}

const PERTURBATION_FAMILIES: CurveFamily[] = [
  {
    label: "Noise Injection",
    description:
      "How adding irrelevant/near-miss passages degrades retrieval and generation",
    conditions: ["clean", "noise_30", "noise_50", "noise_70"],
    xLabels: ["0%", "30%", "50%", "70%"],
    color: "#f59e0b",
  },
  {
    label: "Conflict Injection",
    description:
      "How contradicted gold passages affect groundedness and answer quality",
    conditions: ["clean", "conflict_50", "conflict_70"],
    xLabels: ["0%", "50%", "70%"],
    color: "#ef4444",
  },
  {
    label: "Unanswerable",
    description:
      "Impact of removing answer-bearing passages on the pipeline",
    conditions: ["clean", "unanswerable_partial", "unanswerable_full"],
    xLabels: ["None", "Partial", "Full"],
    color: "#6b7280",
  },
];

const METRIC_DEFS = [
  { key: "map_at_k", label: "MAP@k", color: "#3b82f6", family: "Retrieval" },
  { key: "ndcg_at_k", label: "nDCG@k", color: "#8b5cf6", family: "Retrieval" },
  { key: "scr", label: "SCR", color: "#10b981", family: "Groundedness" },
  {
    key: "citation_precision",
    label: "Citation P",
    color: "#06b6d4",
    family: "Groundedness",
  },
  { key: "task_score", label: "Task Score", color: "#f59e0b", family: "Task" },
] as const;

type MetricKey = (typeof METRIC_DEFS)[number]["key"];

// ---- Helpers ----

function buildCurveData(
  family: CurveFamily,
  allConditions: DegradationCondition[],
  metricKey: MetricKey
) {
  const condMap = new Map(allConditions.map((c) => [c.condition, c]));
  return family.conditions.map((cond, i) => {
    const data = condMap.get(cond);
    const stats = data ? data[metricKey] : null;
    return {
      x: family.xLabels[i],
      condition: cond,
      mean: stats?.mean ?? null,
      std: stats?.std ?? null,
      n: stats?.n ?? 0,
      // For error bars: Recharts ErrorBar wants [lower, upper] delta from mean
      errorY: stats?.std != null ? [stats.std, stats.std] : [0, 0],
    };
  });
}

// ---- Custom Tooltip ----

function CurveTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    name: string;
    color: string;
    payload: { std: number | null; n: number; condition: string };
  }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const data = entry.payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-gray-700 mb-1">
        {data.condition.replace(/_/g, " ")} ({label})
      </p>
      <p style={{ color: entry.color }}>
        {entry.name}: {(entry.value * 100).toFixed(1)}%
        {data.std != null && (
          <span className="text-gray-400"> +/- {(data.std * 100).toFixed(1)}%</span>
        )}
      </p>
      <p className="text-gray-400 mt-0.5">n = {data.n}</p>
    </div>
  );
}

// ---- Family Degradation Card (multi-metric lines) ----

function FamilyDegradationCard({
  family,
  allConditions,
}: {
  family: CurveFamily;
  allConditions: DegradationCondition[];
}) {
  // Build combined data with all metrics (including CI delta for ErrorBar)
  const condMap = new Map(allConditions.map((c) => [c.condition, c]));
  const combinedData = family.conditions.map((cond, i) => {
    const data = condMap.get(cond);
    const point: Record<string, unknown> = {
      x: family.xLabels[i],
      condition: cond,
    };
    for (const metric of METRIC_DEFS) {
      const stats = data ? data[metric.key] : null;
      point[metric.label] = stats?.mean ?? null;
      point[`${metric.label}_std`] = stats?.std ?? null;
      point[`${metric.label}_n`] = stats?.n ?? 0;
      // Recharts ErrorBar expects [below-mean, above-mean] deltas
      if (stats?.mean != null && stats?.ci95_lo != null && stats?.ci95_hi != null) {
        point[`${metric.label}_ci`] = [
          Math.max(0, stats.mean - stats.ci95_lo),
          Math.max(0, stats.ci95_hi - stats.mean),
        ];
        point[`${metric.label}_ci_lo`] = stats.ci95_lo;
        point[`${metric.label}_ci_hi`] = stats.ci95_hi;
      } else {
        point[`${metric.label}_ci`] = [0, 0];
      }
    }
    return point;
  });

  // Check if any data exists for this family
  const hasData = combinedData.some((d) =>
    METRIC_DEFS.some((m) => d[m.label] !== null)
  );

  if (!hasData) {
    return (
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-800 mb-1">{family.label}</h4>
        <p className="text-xs text-gray-400">
          No experiment data for this perturbation family yet.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-800">{family.label}</h4>
        <p className="text-xs text-gray-500">{family.description}</p>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={combinedData} margin={{ left: 0, right: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 11, fill: "#6b7280" }}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={{ stroke: "#e5e7eb" }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                  <p className="font-semibold text-gray-700 mb-1">{label}</p>
                  {payload.map((entry) => {
                    if (entry.value == null) return null;
                    const val = entry.value as number;
                    const nKey = `${entry.name}_n`;
                    const loKey = `${entry.name}_ci_lo`;
                    const hiKey = `${entry.name}_ci_hi`;
                    const n = entry.payload?.[nKey] as number;
                    const lo = entry.payload?.[loKey] as number | undefined;
                    const hi = entry.payload?.[hiKey] as number | undefined;
                    return (
                      <p key={entry.name} style={{ color: entry.color }}>
                        {entry.name}: {(val * 100).toFixed(1)}%
                        {lo != null && hi != null && (
                          <span className="text-gray-400">
                            {" "}[{(lo * 100).toFixed(1)}-{(hi * 100).toFixed(1)}%]
                          </span>
                        )}
                        <span className="text-gray-400"> (n={n})</span>
                      </p>
                    );
                  })}
                </div>
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="plainline"
          />
          {METRIC_DEFS.map((metric) => (
            <Line
              key={metric.key}
              type="monotone"
              dataKey={metric.label}
              stroke={metric.color}
              strokeWidth={2}
              dot={{ r: 4, strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls
            >
              <ErrorBar
                dataKey={`${metric.label}_ci`}
                width={4}
                strokeWidth={1.5}
                stroke={metric.color}
                direction="y"
              />
            </Line>
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ---- Single Metric Focus Card (with area fill + error shading) ----

function SingleMetricCurveCard({
  allConditions,
  metricKey,
  metricLabel,
  metricColor,
}: {
  allConditions: DegradationCondition[];
  metricKey: MetricKey;
  metricLabel: string;
  metricColor: string;
}) {
  // Show that metric across ALL perturbation families side-by-side
  const allData: Array<{
    x: string;
    family: string;
    mean: number | null;
    upper: number | null;
    lower: number | null;
    n: number;
  }> = [];

  for (const family of PERTURBATION_FAMILIES) {
    const condMap = new Map(allConditions.map((c) => [c.condition, c]));
    for (let i = 0; i < family.conditions.length; i++) {
      const cond = family.conditions[i];
      const data = condMap.get(cond);
      const stats = data ? data[metricKey] : null;
      const mean = stats?.mean ?? null;
      // Prefer bootstrap CI if present, fall back to +/- 1 SD
      const lo =
        stats?.ci95_lo != null
          ? stats.ci95_lo
          : mean != null && stats?.std != null
          ? Math.max(0, mean - stats.std)
          : null;
      const hi =
        stats?.ci95_hi != null
          ? stats.ci95_hi
          : mean != null && stats?.std != null
          ? mean + stats.std
          : null;
      allData.push({
        x: `${family.label.split(" ")[0]} ${family.xLabels[i]}`,
        family: family.label,
        mean,
        upper: hi,
        lower: lo,
        n: stats?.n ?? 0,
      });
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold" style={{ color: metricColor }}>
          {metricLabel} Across All Perturbation Types
        </h4>
        <p className="text-xs text-gray-500">
          Shaded area shows 95% bootstrap confidence interval
        </p>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={allData} margin={{ left: 0, right: 10, bottom: 30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 9, fill: "#6b7280" }}
            angle={-30}
            textAnchor="end"
            height={55}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            axisLine={{ stroke: "#e5e7eb" }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              if (!d) return null;
              return (
                <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-xs">
                  <p className="font-semibold text-gray-700">{d.x}</p>
                  <p style={{ color: metricColor }}>
                    {metricLabel}: {d.mean != null ? (d.mean * 100).toFixed(1) + "%" : "N/A"}
                  </p>
                  {d.upper != null && (
                    <p className="text-gray-400">
                      Range: {(d.lower * 100).toFixed(1)}% - {(d.upper * 100).toFixed(1)}%
                    </p>
                  )}
                  <p className="text-gray-400">n = {d.n}</p>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="upper"
            stroke="none"
            fill={metricColor}
            fillOpacity={0.1}
          />
          <Area
            type="monotone"
            dataKey="lower"
            stroke="none"
            fill="#ffffff"
            fillOpacity={1}
          />
          <Line
            type="monotone"
            dataKey="mean"
            stroke={metricColor}
            strokeWidth={2.5}
            dot={{ r: 4, fill: metricColor, strokeWidth: 0 }}
            activeDot={{ r: 6, strokeWidth: 2, fill: "#fff", stroke: metricColor }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ---- Question Type x Condition Heatmap ----

function CrosstabHeatmap({ rows }: { rows: CrosstabRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">
          Question Type x Condition Breakdown
        </h4>
        <p className="text-xs text-gray-400">
          No cross-tabulation data available yet.
        </p>
      </Card>
    );
  }

  const conditions = [...new Set(rows.map((r) => r.condition))];
  const qTypes = [...new Set(rows.map((r) => r.question_type))];

  // Order conditions logically
  const conditionOrder = [
    "clean",
    "noise_30",
    "noise_50",
    "noise_70",
    "conflict_50",
    "conflict_70",
    "unanswerable_partial",
    "unanswerable_full",
  ];
  conditions.sort(
    (a, b) => (conditionOrder.indexOf(a) ?? 99) - (conditionOrder.indexOf(b) ?? 99)
  );

  const lookup = new Map(rows.map((r) => [`${r.condition}:${r.question_type}`, r]));

  // Build chart data grouped by question type
  const chartData = conditions.map((cond) => {
    const point: Record<string, unknown> = {
      condition: cond.replace(/_/g, " "),
    };
    for (const qt of qTypes) {
      const row = lookup.get(`${cond}:${qt}`);
      point[qt] = row?.avg_task_score ?? null;
    }
    return point;
  });

  const typeColors: Record<string, string> = {
    factoid: "#3b82f6",
    yesno: "#10b981",
    list: "#f59e0b",
    summary: "#8b5cf6",
  };

  return (
    <Card className="p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-800">
          Task Score by Question Type x Condition
        </h4>
        <p className="text-xs text-gray-500">
          Shows which question types are most affected by each perturbation
        </p>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ bottom: 40, left: 0, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="condition"
            tick={{ fontSize: 9, fill: "#6b7280" }}
            angle={-25}
            textAnchor="end"
            height={55}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fontSize: 10, fill: "#9ca3af" }}
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
          {qTypes.map((qt) => (
            <Bar
              key={qt}
              dataKey={qt}
              fill={typeColors[qt] || "#6b7280"}
              radius={[2, 2, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ---- Main Component ----

export function DegradationCurvesView({
  retrieverMode = "hybrid",
  normalize,
}: {
  retrieverMode?: string;
  normalize?: string;
} = {}) {
  const [conditions, setConditions] = useState<DegradationCondition[]>([]);
  const [crosstabRows, setCrosstabRows] = useState<CrosstabRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("map_at_k");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getDegradation({
        bootstrap: 1000,
        retriever_mode: retrieverMode,
        normalize,
      }),
      api.getCrosstab(),
    ])
      .then(([deg, ct]) => {
        setConditions(deg.conditions);
        setCrosstabRows(ct.rows);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load data")
      )
      .finally(() => setLoading(false));
  }, [retrieverMode, normalize]);

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          Loading degradation data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-center">
        <p className="text-sm text-red-600">{error}</p>
        <p className="text-xs text-red-400 mt-1">
          Make sure the backend is running and has experiment data.
        </p>
      </div>
    );
  }

  if (conditions.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm font-medium mb-1">No experiment data yet</p>
        <p className="text-xs">
          Run evaluations with different perturbation conditions to see
          degradation curves.
        </p>
      </div>
    );
  }

  const selectedMetric = METRIC_DEFS.find((m) => m.key === activeMetric)!;

  return (
    <div className="space-y-6">
      {/* Overview text */}
      <div className="rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Degradation Curves
        </h3>
        <p className="text-xs text-gray-600 leading-relaxed">
          These charts show how pipeline performance degrades as perturbation
          intensity increases. Each curve represents a metric tracked across
          increasing levels of noise, conflict, or passage removal. The baseline
          (clean condition) anchors the left of each curve.
        </p>
      </div>

      {/* Per-family multi-metric curves */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          By Perturbation Family
        </h3>
        <div className="grid grid-cols-1 gap-4">
          {PERTURBATION_FAMILIES.map((family) => (
            <FamilyDegradationCard
              key={family.label}
              family={family}
              allConditions={conditions}
            />
          ))}
        </div>
      </div>

      {/* Single metric focus view */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Single Metric Across All Families
        </h3>
        <div className="flex gap-2 mb-3 flex-wrap">
          {METRIC_DEFS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeMetric === m.key
                  ? "text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
              style={
                activeMetric === m.key
                  ? { backgroundColor: m.color }
                  : undefined
              }
            >
              {m.label}
            </button>
          ))}
        </div>
        <SingleMetricCurveCard
          allConditions={conditions}
          metricKey={activeMetric}
          metricLabel={selectedMetric.label}
          metricColor={selectedMetric.color}
        />
      </div>

      {/* Question type x Condition crosstab */}
      <div>
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Question Type Resilience
        </h3>
        <CrosstabHeatmap rows={crosstabRows} />
      </div>
    </div>
  );
}
