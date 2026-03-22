"use client";

import { useEffect } from "react";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const CONDITIONS = [
  { value: "clean", label: "Clean (Baseline)" },
  { value: "noise_30", label: "Noise 30%" },
  { value: "noise_50", label: "Noise 50%" },
  { value: "noise_70", label: "Noise 70%" },
  { value: "conflict_50", label: "Conflict 50/50" },
  { value: "conflict_70", label: "Conflict 70/30" },
  { value: "unanswerable_partial", label: "Unanswerable (Partial)" },
  { value: "unanswerable_full", label: "Unanswerable (Full)" },
];

const QUESTION_TYPES = [
  { value: "all", label: "All Types" },
  { value: "factoid", label: "Factoid" },
  { value: "yesno", label: "Yes/No" },
  { value: "list", label: "List" },
  { value: "summary", label: "Summary" },
];

export function ControlPanel() {
  const {
    mode,
    questions,
    setQuestions,
    selectedQuestion,
    setSelectedQuestion,
    condition,
    setCondition,
    topK,
    setTopK,
    isComparing,
    setIsComparing,
    setComparisonResult,
    isLoading,
    clearMessages,
    setCurrentResult,
  } = useStore();

  useEffect(() => {
    api.getQuestions({ limit: 400 }).then((res) => setQuestions(res.questions));
  }, [setQuestions]);

  const handleCompare = async () => {
    if (!selectedQuestion) return;
    setIsComparing(true);
    try {
      const res = await api.compare({ question_id: selectedQuestion.id });
      setComparisonResult(res);
      useStore.getState().setActiveTab("comparison");
    } finally {
      setIsComparing(false);
    }
  };

  const handleReset = () => {
    clearMessages();
    setCurrentResult(null);
    setComparisonResult(null);
    setSelectedQuestion(null);
    setCondition("clean");
  };

  const filteredQuestions = questions;

  return (
    <div className="w-72 border-r bg-gray-50/50 flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-sm font-medium text-gray-700 mb-1">Mode</h2>
          <p className="text-xs text-gray-500">
            {mode === "evaluation"
              ? "BioASQ question with gold answer and full metrics"
              : "Any biomedical question with live retrieval"}
          </p>
        </div>

        <Separator />

        {mode === "evaluation" && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Question Type
              </label>
              <Select defaultValue="all">
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUESTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">
                Question ({filteredQuestions.length})
              </label>
              <Select
                value={selectedQuestion?.id || ""}
                onValueChange={(id) => {
                  if (!id) return;
                  const q = questions.find((q) => q.id === id);
                  if (q) setSelectedQuestion(q);
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select a question..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {filteredQuestions.map((q) => (
                    <SelectItem key={q.id} value={q.id} className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-gray-400">[{q.type}]</span>{" "}
                        {q.body.slice(0, 60)}...
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />
          </>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">
            Condition
          </label>
          <Select value={condition} onValueChange={(v) => v && setCondition(v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">
            Top-K Passages
          </label>
          <Select
            value={String(topK)}
            onValueChange={(v) => v && setTopK(Number(v))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 5, 10, 15, 20].map((k) => (
                <SelectItem key={k} value={String(k)} className="text-xs">
                  {k} passages
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        {mode === "evaluation" && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={handleCompare}
            disabled={!selectedQuestion || isComparing || isLoading}
          >
            {isComparing ? "Comparing..." : "Compare All Conditions"}
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          className="w-full text-xs text-gray-500"
          onClick={handleReset}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
