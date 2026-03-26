"use client";

import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatBubble } from "./ChatBubble";

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
  } = useStore();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const question =
      mode === "evaluation" && selectedQuestion
        ? selectedQuestion.body
        : input.trim();
    if (!question || isLoading) return;

    const userMsg = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content: question,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput("");
    setIsLoading(true);

    try {
      const res = await api.ask({
        question,
        question_id:
          mode === "evaluation" ? selectedQuestion?.id : undefined,
        condition,
        top_k: topK,
      });

      setCurrentResult(res);

      const assistantMsg = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: res.answer,
        citations: res.citations,
        passages: res.passages,
        metrics: res.metrics,
        condition: res.condition,
        duration_s: res.duration_s,
        timestamp: Date.now(),
      };
      addMessage(assistantMsg);
      useStore.getState().setActiveTab("evidence");
    } catch (err) {
      const errMsg = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: Date.now(),
      };
      addMessage(errMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionClick = () => {
    if (mode === "evaluation" && selectedQuestion && !isLoading) {
      handleSubmit(new Event("submit") as unknown as React.FormEvent);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-w-0">
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              {mode === "evaluation" ? (
                <>
                  <p className="text-lg font-medium mb-2">
                    Select a question and run
                  </p>
                  <p className="text-sm">
                    Choose a BioASQ question from the left panel, pick a
                    condition, then click Run or press Enter
                  </p>
                </>
              ) : (
                <>
                  <p className="text-lg font-medium mb-2">
                    Ask a biomedical question
                  </p>
                  <p className="text-sm">
                    Retrieval is limited to ~2,000 PubMed abstracts from the
                    BioASQ Challenge 13 corpus. Questions outside this scope
                    may not receive useful answers.
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Topics covered include biomedical questions from BioASQ
                    training data (drug mechanisms, diseases, genes, proteins,
                    etc.)
                  </p>
                </>
              )}
            </div>
          )}
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 pl-2">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
              Retrieving and generating...
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="border-t bg-white p-4">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto flex gap-2">
          {mode === "evaluation" ? (
            <div className="flex-1 flex items-center gap-2">
              <p className="text-sm text-gray-600 truncate flex-1">
                {selectedQuestion
                  ? selectedQuestion.body
                  : "Select a question from the left panel"}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={handleQuestionClick}
                disabled={!selectedQuestion || isLoading}
              >
                {isLoading ? "Running..." : "Run"}
              </Button>
            </div>
          ) : (
            <>
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
            </>
          )}
        </form>
      </div>
    </div>
  );
}
