"use client";

import { useStore } from "@/store/useStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvidenceList } from "./EvidenceList";
import { MetricsView } from "../metrics/MetricsView";
import { ComparisonView } from "../metrics/ComparisonView";

export function EvidencePanel() {
  const { activeTab, setActiveTab } = useStore();

  return (
    <div className="w-96 border-l bg-gray-50/50 flex flex-col h-full overflow-hidden">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <div className="px-3 pt-3">
          <TabsList className="w-full">
            <TabsTrigger value="evidence" className="flex-1 text-xs">
              Evidence
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex-1 text-xs">
              Metrics
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex-1 text-xs">
              Compare
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="evidence" className="flex-1 overflow-y-auto p-3 mt-0">
          <EvidenceList />
        </TabsContent>
        <TabsContent value="metrics" className="flex-1 overflow-y-auto p-3 mt-0">
          <MetricsView />
        </TabsContent>
        <TabsContent value="comparison" className="flex-1 overflow-y-auto p-3 mt-0">
          <ComparisonView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
