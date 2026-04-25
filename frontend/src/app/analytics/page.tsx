"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AggregateView } from "@/components/analytics/AggregateView";
import { MetricImpactView } from "@/components/analytics/MetricImpactView";
import { DegradationCurvesView } from "@/components/analytics/DegradationCurvesView";
import { SignificanceView } from "@/components/analytics/SignificanceView";

export default function AnalyticsPage() {
  const {
    setAggregateByCondition,
    setAggregateByQuestionType,
    setAnalyticsLoading,
    analyticsLoading,
  } = useStore();

  const [retrieverMode, setRetrieverMode] = useState<string>("hybrid");
  const [availableModes, setAvailableModes] = useState<string[]>(["hybrid"]);
  const [normalizeByType, setNormalizeByType] = useState<boolean>(false);
  const normalize = normalizeByType ? "by_type" : undefined;

  useEffect(() => {
    api
      .getConditions()
      .then((r) => {
        if (r.retriever_modes && r.retriever_modes.length > 0) {
          setAvailableModes(r.retriever_modes);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setAnalyticsLoading(true);
    Promise.all([
      api.getAggregateStats({
        group_by: "condition",
        retriever_mode: retrieverMode,
        normalize,
      }),
      api.getAggregateStats({
        group_by: "question_type",
        retriever_mode: retrieverMode,
      }),
    ])
      .then(([byCondition, byType]) => {
        setAggregateByCondition(byCondition);
        setAggregateByQuestionType(byType);
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [
    retrieverMode,
    normalize,
    setAggregateByCondition,
    setAggregateByQuestionType,
    setAnalyticsLoading,
  ]);

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
          <span className="text-sm text-gray-700">Analytics</span>
        </div>
        <div className="flex items-center gap-4">
          <label
            className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none"
            title="Macro-average: mean per question-type, then mean across types. Removes bias from uneven type mix in batch runs."
          >
            <input
              type="checkbox"
              checked={normalizeByType}
              onChange={(e) => setNormalizeByType(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Normalize by question type
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Retriever</label>
            <select
              value={retrieverMode}
              onChange={(e) => setRetrieverMode(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableModes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {analyticsLoading ? (
          <p className="text-center py-16 text-gray-400">
            Loading aggregate data...
          </p>
        ) : (
          <Tabs defaultValue="degradation">
            <TabsList>
              <TabsTrigger value="degradation">Degradation Curves</TabsTrigger>
              <TabsTrigger value="aggregate">Condition Summary</TabsTrigger>
              <TabsTrigger value="impact">Metric Impact</TabsTrigger>
              <TabsTrigger value="significance">Significance</TabsTrigger>
            </TabsList>
            <TabsContent value="degradation" className="mt-4">
              <DegradationCurvesView
                retrieverMode={retrieverMode}
                normalize={normalize}
              />
            </TabsContent>
            <TabsContent value="aggregate" className="mt-4">
              <AggregateView />
            </TabsContent>
            <TabsContent value="impact" className="mt-4">
              <MetricImpactView />
            </TabsContent>
            <TabsContent value="significance" className="mt-4">
              <SignificanceView />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
