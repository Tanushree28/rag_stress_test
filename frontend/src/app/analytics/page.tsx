"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AggregateView } from "@/components/analytics/AggregateView";
import { MetricImpactView } from "@/components/analytics/MetricImpactView";
import { DegradationCurvesView } from "@/components/analytics/DegradationCurvesView";

export default function AnalyticsPage() {
  const {
    setAggregateByCondition,
    setAggregateByQuestionType,
    setAnalyticsLoading,
    analyticsLoading,
  } = useStore();

  useEffect(() => {
    setAnalyticsLoading(true);
    Promise.all([
      api.getAggregateStats({ group_by: "condition" }),
      api.getAggregateStats({ group_by: "question_type" }),
    ])
      .then(([byCondition, byType]) => {
        setAggregateByCondition(byCondition);
        setAggregateByQuestionType(byType);
      })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  }, [setAggregateByCondition, setAggregateByQuestionType, setAnalyticsLoading]);

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
            </TabsList>
            <TabsContent value="degradation" className="mt-4">
              <DegradationCurvesView />
            </TabsContent>
            <TabsContent value="aggregate" className="mt-4">
              <AggregateView />
            </TabsContent>
            <TabsContent value="impact" className="mt-4">
              <MetricImpactView />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
