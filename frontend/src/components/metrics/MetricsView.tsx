"use client";

import { useStore } from "@/store/useStore";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function MetricCard({
  label,
  value,
  format = "percent",
}: {
  label: string;
  value: number | undefined;
  format?: "percent" | "decimal" | "raw";
}) {
  const display =
    value === undefined
      ? "--"
      : format === "percent"
        ? `${(value * 100).toFixed(1)}%`
        : format === "decimal"
          ? value.toFixed(3)
          : String(value);

  return (
    <Card className="p-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-lg font-semibold text-gray-800 mt-0.5">{display}</p>
    </Card>
  );
}

export function MetricsView() {
  const { currentResult } = useStore();
  const metrics = currentResult?.metrics;

  if (!metrics) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        Run an evaluation query to see metrics
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-2">Retrieval</h3>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="MAP@k" value={metrics.retrieval.map_at_k} />
          <MetricCard label="MRR@k" value={metrics.retrieval.mrr_at_k} />
          <MetricCard label="nDCG@k" value={metrics.retrieval.ndcg_at_k} />
          <MetricCard label="P@k" value={metrics.retrieval.precision_at_k} />
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-2">
          Groundedness
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Supported Claims"
            value={metrics.groundedness.supported_claim_rate}
          />
          <MetricCard
            label="Citation Precision"
            value={metrics.groundedness.citation_precision}
          />
          <MetricCard
            label="Avg Entailment"
            value={metrics.groundedness.avg_entailment_score}
            format="decimal"
          />
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-xs font-medium text-gray-600 mb-2">
          Task ({metrics.task.task_metric})
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <MetricCard label="Score" value={metrics.task.score} />
          {metrics.task.rouge1_f !== undefined && (
            <MetricCard
              label="ROUGE-1"
              value={metrics.task.rouge1_f as number}
            />
          )}
          {metrics.task.rouge2_f !== undefined && (
            <MetricCard
              label="ROUGE-2"
              value={metrics.task.rouge2_f as number}
            />
          )}
          {metrics.task.rougeL_f !== undefined && (
            <MetricCard
              label="ROUGE-L"
              value={metrics.task.rougeL_f as number}
            />
          )}
        </div>
      </div>
    </div>
  );
}
