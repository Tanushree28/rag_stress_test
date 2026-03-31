"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useStore } from "@/store/useStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

const N_PER_TYPE_OPTIONS = [
  { value: 5, label: "5 per type (20 total) — quick test" },
  { value: 10, label: "10 per type (40 total) — test" },
  { value: 25, label: "25 per type (100 total)" },
  { value: 37, label: "37 per type (~148 total)" },
  { value: 50, label: "50 per type (200 total)" },
];

export default function BatchPage() {
  const { batchJob, setBatchJob, clearBatchJob } = useStore();

  const [nPerType, setNPerType] = useState(25);
  const [selectedConditions, setSelectedConditions] = useState<string[]>(
    CONDITIONS.map((c) => c.value)
  );
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const toggleCondition = (value: string) => {
    setSelectedConditions((prev) =>
      prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]
    );
  };

  // Poll when a job is running.
  useEffect(() => {
    if (!batchJob || batchJob.status !== "running") {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      api
        .getBatchJobStatus(batchJob.job_id)
        .then((job) => setBatchJob(job))
        .catch(() => {
          // Network hiccup — keep polling.
        });
    }, 3000);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [batchJob?.job_id, batchJob?.status, setBatchJob]);

  const handleStart = async () => {
    if (selectedConditions.length === 0) return;
    setError(null);
    clearBatchJob();
    try {
      const job = await api.startBatchExperiment({
        n_per_type: nPerType,
        conditions: selectedConditions,
        top_k: 5,
      });
      setBatchJob(job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start batch run.");
    }
  };

  const isRunning = batchJob?.status === "running";
  const isDone = batchJob?.status === "done";
  const isError = batchJob?.status === "error";

  const progressPercent =
    batchJob && batchJob.total > 0
      ? Math.round((batchJob.completed / batchJob.total) * 100)
      : 0;

  const totalRuns = nPerType * 4 * selectedConditions.length;

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
          <span className="text-sm text-gray-700">Batch Run</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <Card className="p-5 space-y-5">
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-2">
              Questions per Type
            </h2>
            <p className="text-xs text-gray-500 mb-2">
              Balanced across factoid, list, yes/no, and summary.
            </p>
            <Select
              value={String(nPerType)}
              onValueChange={(v) => v && setNPerType(Number(v))}
            >
              <SelectTrigger className="h-8 text-xs w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {N_PER_TYPE_OPTIONS.map((o) => (
                  <SelectItem
                    key={o.value}
                    value={String(o.value)}
                    className="text-xs"
                  >
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-2">
              Conditions ({selectedConditions.length} selected)
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {CONDITIONS.map((c) => (
                <label
                  key={c.value}
                  className="flex items-center gap-2 text-xs cursor-pointer"
                >
                  <Checkbox
                    checked={selectedConditions.includes(c.value)}
                    onCheckedChange={() => toggleCondition(c.value)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() =>
                  setSelectedConditions(CONDITIONS.map((c) => c.value))
                }
              >
                Select All
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => setSelectedConditions([])}
              >
                Clear
              </Button>
            </div>
          </div>

          {selectedConditions.length > 0 && (
            <p className="text-xs text-gray-500">
              Estimated runs: {totalRuns} ({nPerType} questions x 4 types x{" "}
              {selectedConditions.length} conditions)
            </p>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button
            size="sm"
            className="w-full"
            onClick={handleStart}
            disabled={isRunning || selectedConditions.length === 0}
          >
            {isRunning ? "Running..." : "Start Batch Run"}
          </Button>
        </Card>

        {batchJob && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-gray-700">Progress</h2>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded ${
                  isDone
                    ? "bg-green-100 text-green-700"
                    : isError
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {batchJob.status}
              </span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <p className="text-xs text-gray-600">
              {batchJob.completed} / {batchJob.total} runs complete
              {batchJob.failed > 0 && (
                <span className="text-red-500 ml-2">
                  ({batchJob.failed} failed)
                </span>
              )}
              {isRunning && (
                <span className="text-gray-400 ml-2">— polling every 3s</span>
              )}
            </p>

            {isDone && (
              <Link href="/analytics">
                <Button size="sm" className="w-full">
                  View Analytics
                </Button>
              </Link>
            )}

            {isError && (
              <p className="text-xs text-red-600">
                The batch job encountered an error. Check the backend logs for
                details.
              </p>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
