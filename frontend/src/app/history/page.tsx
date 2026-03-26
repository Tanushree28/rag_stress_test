"use client";

import { useEffect, useState } from "react";
import { api, type Experiment } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";

function conditionColor(condition: string) {
  if (condition.startsWith("noise")) return "secondary";
  if (condition.startsWith("conflict")) return "destructive";
  if (condition.startsWith("unanswerable")) return "outline";
  return "default";
}

export default function HistoryPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  useEffect(() => {
    api.getHistory({ limit, offset }).then((res) => {
      setExperiments(res.experiments);
      setTotal(res.total);
    });
  }, [offset]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-lg font-semibold text-gray-900 hover:text-blue-600"
          >
            RAG Stress-Test
          </Link>
          <span className="text-sm text-gray-500">/</span>
          <span className="text-sm text-gray-700">Experiment History</span>
        </div>
        <span className="text-xs text-gray-500">{total} experiments</span>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-3">
        {experiments.length === 0 && (
          <p className="text-center py-16 text-gray-400">
            No experiments yet. Run some queries first.
          </p>
        )}
        {experiments.map((exp) => (
          <Collapsible key={exp.id}>
            <Card className="p-4">
              <CollapsibleTrigger className="w-full text-left cursor-pointer">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        variant={conditionColor(exp.condition)}
                        className="text-xs"
                      >
                        {exp.condition}
                      </Badge>
                      {exp.question_type && (
                        <span className="text-xs text-gray-400">
                          {exp.question_type}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(exp.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 truncate">
                      {exp.question_body}
                    </p>
                    {exp.answer && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {exp.answer}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-400 shrink-0">
                    {exp.duration_s}s
                    {exp.metrics && (
                      <div className="mt-1 space-y-0.5">
                        <p>
                          MAP:{" "}
                          {(exp.metrics.retrieval.map_at_k * 100).toFixed(0)}%
                        </p>
                        <p>
                          Task:{" "}
                          {(exp.metrics.task.score * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 pt-3 border-t space-y-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-1">
                      Question
                    </p>
                    <p className="text-sm text-gray-700">
                      {exp.question_body}
                    </p>
                  </div>
                  {exp.answer && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        Answer
                      </p>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">
                        {exp.answer}
                      </p>
                    </div>
                  )}
                  {exp.metrics && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        Metrics
                      </p>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <p className="font-medium text-gray-600">Retrieval</p>
                          <p>
                            MAP@k:{" "}
                            {(
                              exp.metrics.retrieval.map_at_k * 100
                            ).toFixed(1)}
                            %
                          </p>
                          <p>
                            MRR@k:{" "}
                            {(
                              exp.metrics.retrieval.mrr_at_k * 100
                            ).toFixed(1)}
                            %
                          </p>
                          <p>
                            nDCG@k:{" "}
                            {(
                              exp.metrics.retrieval.ndcg_at_k * 100
                            ).toFixed(1)}
                            %
                          </p>
                          <p>
                            P@k:{" "}
                            {(
                              exp.metrics.retrieval.precision_at_k * 100
                            ).toFixed(1)}
                            %
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-600">
                            Groundedness
                          </p>
                          <p>
                            SCR:{" "}
                            {(
                              exp.metrics.groundedness.supported_claim_rate *
                              100
                            ).toFixed(1)}
                            %
                          </p>
                          <p>
                            CP:{" "}
                            {(
                              exp.metrics.groundedness.citation_precision * 100
                            ).toFixed(1)}
                            %
                          </p>
                          <p>
                            Entailment:{" "}
                            {exp.metrics.groundedness.avg_entailment_score.toFixed(
                              3
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="font-medium text-gray-600">
                            Task ({exp.metrics.task.task_metric})
                          </p>
                          <p>
                            Score:{" "}
                            {(exp.metrics.task.score * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  {exp.passages && exp.passages.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        Passages ({exp.passages.length})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {exp.passages.map((p, i) => (
                          <a
                            key={i}
                            href={`https://pubmed.ncbi.nlm.nih.gov/${p.pmid}/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {p.pmid}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}

        {total > limit && (
          <div className="flex justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <span className="text-xs text-gray-500 self-center">
              {offset + 1}-{Math.min(offset + limit, total)} of {total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total}
              onClick={() => setOffset(offset + limit)}
            >
              Next
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
