"use client";

import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/api";
import type { CompareResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatBubble } from "./ChatBubble";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CONDITION_COLORS: Record<string, string> = {
  clean: "#3b82f6",
  noise_30: "#f59e0b",
  noise_50: "#f97316",
  noise_70: "#ef4444",
  conflict_50: "#a855f7",
  conflict_70: "#ec4899",
  unanswerable_partial: "#6b7280",
  unanswerable_full: "#374151",
};

function ConditionAnswerCard({ r }: { r: CompareResult }) {
  const hasError = r.error || r.answer?.includes("Generation failed");
  const accentColor = CONDITION_COLORS[r.condition] || "#6b7280";

  return (
    <Card
      className="overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderLeft: `3px solid ${accentColor}` }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <span className="text-sm font-semibold text-gray-800">
              {r.condition.replace(/_/g, " ")}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {r.from_cache && (
              <Badge variant="outline" className="text-[10px] text-gray-400 px-1.5 py-0">
                cached
              </Badge>
            )}
            <span className="text-[10px] text-gray-400">{r.duration_s}s</span>
          </div>
        </div>

        {/* Answer text */}
        {hasError ? (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-xs text-red-600 font-medium">
              Generation failed
            </p>
            <p className="text-[11px] text-red-500 mt-0.5">
              {r.error || "Ollama may not be running. Start it with: ollama serve"}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {r.answer}
          </p>
        )}

        {/* Citation badges */}
        {!hasError && r.citations && r.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {r.citations.map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0">
                [{c}]
              </Badge>
            ))}
          </div>
        )}

        {/* Mini metrics row */}
        {r.metrics && (
          <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-3">
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">MAP@k</span>
              <p className="text-sm font-semibold text-gray-700">
                {(r.metrics.retrieval.map_at_k * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">SCR</span>
              <p className="text-sm font-semibold text-gray-700">
                {(r.metrics.groundedness.supported_claim_rate * 100).toFixed(1)}%
              </p>
            </div>
            <div>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">Task</span>
              <p className="text-sm font-semibold text-gray-700">
                {(r.metrics.task.score * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function SkeletonCard() {
  return (
    <Card className="p-4 border-l-[3px] border-l-gray-200">
      <div className="flex items-center justify-between mb-3">
        <div className="h-3.5 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-3 w-8 bg-gray-200 rounded animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-4/5 bg-gray-100 rounded animate-pulse" />
        <div className="h-3 w-3/5 bg-gray-100 rounded animate-pulse" />
      </div>
      <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-3">
        <div className="h-8 bg-gray-50 rounded animate-pulse" />
        <div className="h-8 bg-gray-50 rounded animate-pulse" />
        <div className="h-8 bg-gray-50 rounded animate-pulse" />
      </div>
    </Card>
  );
}

export function ChatPanel() {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    mode,
    messages,
    addMessage,
    selectedQuestion,
    condition,
    topK,
    isLoading,
    setIsLoading,
    setCurrentResult,
    selectedConditions,
    isComparing,
    setIsComparing,
    setComparisonResult,
    comparisonResult,
    partialResults,
    completedConditions,
    totalConditions,
  } = useStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Evaluation mode: run all selected conditions via compare stream
  const handleRunAll = async () => {
    if (!selectedQuestion || selectedConditions.length === 0 || isComparing) return;
    setIsComparing(true);
    useStore.getState().clearPartialResults();
    useStore.getState().setActiveTab("metrics");

    try {
      const results: CompareResult[] = [];
      for await (const event of api.compareStream({
        question_id: selectedQuestion.id,
        conditions: selectedConditions,
        use_cache: true,
      })) {
        if (event.type === "start") {
          useStore.getState().setCompareProgress(0, event.total_conditions);
        } else if (event.type === "result") {
          results.push(event.data);
          useStore.getState().addPartialResult(event.data);
          useStore.getState().setCompareProgress(results.length, selectedConditions.length);
        }
      }

      setComparisonResult({
        question_id: selectedQuestion.id,
        question: selectedQuestion.body,
        question_type: selectedQuestion.type,
        results,
      });

      // Populate current result with the clean condition result (for evidence tab)
      const cleanResult = results.find((r) => r.condition === "clean") ?? results[0];
      if (cleanResult) {
        setCurrentResult({
          answer: cleanResult.answer,
          citations: cleanResult.citations,
          passages: [],
          condition: cleanResult.condition,
          metrics: cleanResult.metrics,
          duration_s: cleanResult.duration_s,
        });
      }
    } catch (err) {
      console.error("Compare stream failed:", err);
    } finally {
      setIsComparing(false);
    }
  };

  // Free-chat mode: stream single answer into center chat
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = input.trim();
    if (!question || isLoading) return;

    addMessage({ id: crypto.randomUUID(), role: "user", content: question, timestamp: Date.now() });
    setInput("");
    setIsLoading(true);

    try {
      const assistantId = crypto.randomUUID();
      addMessage({ id: assistantId, role: "assistant", content: "", timestamp: Date.now() });

      let fullAnswer = "";
      let finalCitations: number[] = [];
      let finalMetrics: import("@/lib/api").Metrics | null = null;
      let finalPassages: import("@/lib/api").Passage[] = [];

      for await (const event of api.askStream({ question, condition, top_k: topK })) {
        if (event.type === "token") {
          fullAnswer += event.content;
          useStore.setState((state) => ({
            messages: state.messages.map((m) =>
              m.id === assistantId ? { ...m, content: fullAnswer } : m
            ),
          }));
        } else if (event.type === "complete") {
          finalCitations = event.citations;
          finalMetrics = event.metrics;
          finalPassages = event.passages ?? [];
        }
      }

      useStore.setState((state) => ({
        messages: state.messages.map((m) =>
          m.id === assistantId
            ? { ...m, content: fullAnswer, citations: finalCitations, metrics: finalMetrics, condition }
            : m
        ),
      }));

      setCurrentResult({
        answer: fullAnswer,
        citations: finalCitations,
        passages: finalPassages,
        condition,
        metrics: finalMetrics,
        duration_s: 0,
      });
      useStore.getState().setActiveTab("evidence");
    } catch (err) {
      addMessage({
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Evaluation mode: center shows answers per condition
  if (mode === "evaluation") {
    return (
      <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-3xl mx-auto">
            {/* While comparing, show progressive results */}
            {isComparing && (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <p className="text-sm font-medium text-gray-600">
                    Running conditions: {completedConditions}/{totalConditions}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2 max-w-xs mx-auto">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{
                        width: totalConditions
                          ? `${(completedConditions / totalConditions) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  {partialResults.map((r) => (
                    <ConditionAnswerCard key={r.condition} r={r} />
                  ))}
                  {Array.from({ length: totalConditions - completedConditions }).map((_, i) => (
                    <SkeletonCard key={`skeleton-${i}`} />
                  ))}
                </div>
              </div>
            )}

            {/* After comparison is done */}
            {!isComparing && comparisonResult && (
              <div className="space-y-4">
                {/* Question header */}
                <div className="rounded-lg bg-white border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">
                      {comparisonResult.question_type}
                    </Badge>
                    <span className="text-[10px] text-gray-400">
                      {comparisonResult.results.length} conditions
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {comparisonResult.question}
                  </p>
                </div>

                {/* Answer cards - one per condition */}
                <div className="space-y-3">
                  {comparisonResult.results.map((r) => (
                    <ConditionAnswerCard key={r.condition} r={r} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {!isComparing && !comparisonResult && (
              <div className="text-center py-16 text-gray-400">
                <div className="w-12 h-12 rounded-full bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <p className="text-sm font-medium mb-1">No comparison results yet</p>
                <p className="text-xs">
                  Select a question and click &quot;Run Conditions&quot; to see answers across stress-test scenarios
                </p>
              </div>
            )}
          </div>
          <div ref={scrollRef} />
        </div>

        {/* Bottom bar */}
        <div className="border-t bg-white p-4">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <p className="text-sm text-gray-600 truncate flex-1">
              {selectedQuestion ? selectedQuestion.body : "Select a question from the left panel"}
            </p>
            <Button
              size="sm"
              onClick={handleRunAll}
              disabled={!selectedQuestion || isComparing || selectedConditions.length === 0}
            >
              {isComparing
                ? "Running..."
                : `Run ${selectedConditions.length} Condition${selectedConditions.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Free-chat mode
  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-medium mb-2">Ask a biomedical question</p>
              <p className="text-sm">
                Retrieval searches ~150K PubMed abstracts from the BioASQ corpus.
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isLoading && messages.length > 0 && messages[messages.length - 1].content === "" && (
            <div className="flex items-center gap-2 text-sm text-gray-500 pl-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
              Retrieving passages...
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>
      <div className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a biomedical question..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" size="sm" disabled={!input.trim() || isLoading}>
            Send
          </Button>
        </form>
      </div>
    </div>
  );
}
