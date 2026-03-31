"use client";

import { useStore } from "@/store/useStore";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvidenceList } from "./EvidenceList";
import { MetricsView } from "../metrics/MetricsView";
import { ComparisonChartPanel } from "../metrics/ComparisonChartPanel";
import { CompareEvidenceView } from "./CompareEvidenceView";

export function EvidencePanel() {
  const { activeTab, setActiveTab, mode } = useStore();
  const [evalTab, setEvalTab] = useState("comparison");

  // In evaluation mode, show comparison chart + evidence + metrics
  if (mode === "evaluation") {
    return (
      <div className="border-l bg-gray-50/50 flex flex-col h-full overflow-hidden">
        <Tabs value={evalTab} onValueChange={setEvalTab} className="flex flex-col h-full">
          <div className="px-3 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="comparison" className="flex-1 text-xs">
                Comparison
              </TabsTrigger>
              <TabsTrigger value="evidence" className="flex-1 text-xs">
                Evidence
              </TabsTrigger>
              <TabsTrigger value="details" className="flex-1 text-xs">
                Details
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="comparison" className="flex-1 overflow-y-auto p-3 mt-0">
            <ComparisonChartPanel />
          </TabsContent>
          <TabsContent value="evidence" className="flex-1 overflow-y-auto p-3 mt-0">
            <CompareEvidenceView />
          </TabsContent>
          <TabsContent value="details" className="flex-1 overflow-y-auto p-3 mt-0">
            <MetricsView />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  // Free-chat mode: show evidence + metrics as before
  return (
    <div className="border-l bg-gray-50/50 flex flex-col h-full overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="px-3 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="evidence" className="flex-1 text-xs">
              Evidence
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex-1 text-xs">
              Metrics
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="evidence" className="flex-1 overflow-y-auto p-3 mt-0">
          <EvidenceList />
        </TabsContent>
        <TabsContent value="metrics" className="flex-1 overflow-y-auto p-3 mt-0">
          <MetricsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
