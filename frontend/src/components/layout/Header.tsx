"use client";

import Link from "next/link";
import { useStore } from "@/store/useStore";
import { Button } from "@/components/ui/button";

export function Header() {
  const { mode, setMode, clearMessages, setCurrentResult, setComparisonResult } =
    useStore();

  const handleModeSwitch = (newMode: "evaluation" | "free-chat") => {
    setMode(newMode);
    clearMessages();
    setCurrentResult(null);
    setComparisonResult(null);
  };

  return (
    <header className="border-b bg-white px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-gray-900">
          RAG Stress-Test
        </h1>
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          BioASQ 13
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant={mode === "evaluation" ? "default" : "outline"}
          size="sm"
          onClick={() => handleModeSwitch("evaluation")}
        >
          Evaluation
        </Button>
        <Button
          variant={mode === "free-chat" ? "default" : "outline"}
          size="sm"
          onClick={() => handleModeSwitch("free-chat")}
        >
          Free Chat
        </Button>
        <div className="ml-2 flex items-center gap-3 border-l pl-3">
          <Link
            href="/analytics"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Analytics
          </Link>
          <Link
            href="/history"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            History
          </Link>
          <Link
            href="/batch"
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Batch Run
          </Link>
        </div>
      </div>
    </header>
  );
}
