const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export interface Question {
  id: string;
  type: string;
  body: string;
}

export interface Passage {
  chunk_id: string;
  pmid: string;
  title: string;
  text: string;
  chunk_idx: number;
  faiss_score?: number;
  faiss_rank?: number;
  rerank_score?: number;
  rerank_rank?: number;
  is_noise?: boolean;
  noise_type?: string;
  is_conflict?: boolean;
  original_text?: string;
  was_removed?: boolean;
}

export interface Metrics {
  retrieval: {
    map_at_k: number;
    mrr_at_k: number;
    ndcg_at_k: number;
    precision_at_k: number;
    k: number;
    retrieved: number;
    relevant_total: number;
  };
  groundedness: {
    supported_claim_rate: number;
    citation_precision: number;
    avg_entailment_score: number;
  };
  task: {
    task_metric: string;
    score: number;
    [key: string]: unknown;
  };
}

export interface AskResponse {
  answer: string;
  citations: number[];
  passages: Passage[];
  condition: string;
  metrics: Metrics | null;
  duration_s: number;
}

export interface CompareResult {
  condition: string;
  answer: string;
  citations: number[];
  metrics: Metrics;
  duration_s: number;
  from_cache?: boolean;
  error?: string;
  passages?: Array<{
    text: string;
    pmid: string;
    chunk_id: string;
    rerank_score?: number;
    faiss_score?: number;
    source?: string;
  }>;
}

export interface CompareResponse {
  question_id: string;
  question: string;
  question_type: string;
  results: CompareResult[];
}

export interface Experiment {
  id: number;
  timestamp: string;
  question_id: string;
  question_type: string;
  question_body: string;
  condition: string;
  answer: string;
  metrics: Metrics | null;
  passages: Array<{ chunk_id?: string; pmid?: string }>;
  duration_s: number;
}

export interface AggregateGroup {
  group: string;
  count: number;
  avg_map: number | null;
  avg_mrr: number | null;
  avg_ndcg: number | null;
  avg_precision: number | null;
  avg_scr: number | null;
  avg_cp: number | null;
  avg_entailment: number | null;
  avg_task_score: number | null;
}

export interface AggregateResponse {
  group_by: string;
  groups: AggregateGroup[];
}

export interface MetricStats {
  mean: number | null;
  std: number | null;
  n: number;
}

export interface DegradationCondition {
  condition: string;
  count: number;
  map_at_k: MetricStats;
  mrr_at_k: MetricStats;
  ndcg_at_k: MetricStats;
  precision_at_k: MetricStats;
  scr: MetricStats;
  citation_precision: MetricStats;
  entailment: MetricStats;
  task_score: MetricStats;
}

export interface DegradationResponse {
  conditions: DegradationCondition[];
}

export interface CrosstabRow {
  condition: string;
  question_type: string;
  count: number;
  avg_map: number | null;
  avg_scr: number | null;
  avg_task_score: number | null;
  avg_ndcg: number | null;
}

export interface CrosstabResponse {
  rows: CrosstabRow[];
}

export interface BatchRunResult {
  question_id: string;
  condition?: string;
  task_score?: number;
  duration_s?: number;
  error?: string;
}

export interface BatchRunResponse {
  condition: string;
  total: number;
  completed: number;
  failed: number;
  results: BatchRunResult[];
}

export interface BatchExperimentJob {
  job_id: string;
  status: string;
  completed: number;
  total: number;
  failed: number;
  started_at: string;
}

export interface StartBatchExperimentRequest {
  n_per_type: number;
  conditions: string[];
  top_k: number;
}

export const api = {
  health: () => request<{ status: string }>("/health"),

  getQuestions: (params?: { qtype?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.qtype) qs.set("qtype", params.qtype);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<{ total: number; questions: Question[] }>(
      `/questions${query ? `?${query}` : ""}`
    );
  },

  getConditions: () =>
    request<{ conditions: string[] }>("/conditions"),

  ask: (body: {
    question: string;
    question_id?: string;
    condition?: string;
    top_k?: number;
  }) =>
    request<AskResponse>("/ask", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  retrieve: (body: { question: string; top_k?: number }) =>
    request<{ passages: Passage[]; faiss_top_score: number; count: number }>(
      "/retrieve",
      { method: "POST", body: JSON.stringify(body) }
    ),

  compare: (body: { question_id: string; conditions?: string[] }) =>
    request<CompareResponse>("/compare", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getHistory: (params?: {
    limit?: number;
    offset?: number;
    condition?: string;
    question_type?: string;
    question_id?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    if (params?.condition) qs.set("condition", params.condition);
    if (params?.question_type) qs.set("question_type", params.question_type);
    if (params?.question_id) qs.set("question_id", params.question_id);
    const query = qs.toString();
    return request<{ total: number; experiments: Experiment[] }>(
      `/history${query ? `?${query}` : ""}`
    );
  },

  getAggregateStats: (params?: { group_by?: string }) => {
    const qs = new URLSearchParams();
    if (params?.group_by) qs.set("group_by", params.group_by);
    const query = qs.toString();
    return request<AggregateResponse>(
      `/aggregate/stats${query ? `?${query}` : ""}`
    );
  },

  getDegradation: () =>
    request<DegradationResponse>("/aggregate/degradation"),

  getCrosstab: () =>
    request<CrosstabResponse>("/aggregate/crosstab"),

  batchRun: (body: {
    question_ids: string[];
    condition?: string;
    top_k?: number;
  }) =>
    request<BatchRunResponse>("/batch/run", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  prefetch: (body: { question: string; top_k?: number }) =>
    request<{ count: number; faiss_top_score: number; cached: boolean }>(
      "/prefetch",
      { method: "POST", body: JSON.stringify(body) }
    ),

  corpusStats: () =>
    request<{
      abstracts_by_source: Record<string, number>;
      total_abstracts: number;
      total_chunks: number;
      embedded_chunks: number;
      faiss_vectors: number | null;
    }>("/corpus/stats"),

  compareStream: async function* (body: {
    question_id: string;
    conditions?: string[];
    use_cache?: boolean;
  }): AsyncGenerator<
    | { type: "start"; total_conditions: number }
    | { type: "result"; data: CompareResult }
    | { type: "error"; condition: string; error: string }
  > {
    const res = await fetch(`${API_BASE}/compare/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;
        try {
          yield JSON.parse(payload);
        } catch {
          // skip malformed lines
        }
      }
    }
  },

  askStream: async function* (body: {
    question: string;
    question_id?: string;
    condition?: string;
    top_k?: number;
  }): AsyncGenerator<
    | { type: "token"; content: string }
    | { type: "complete"; citations: number[]; metrics: Metrics | null; passages: Passage[] }
  > {
    const res = await fetch(`${API_BASE}/ask/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${await res.text()}`);
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;
        try {
          yield JSON.parse(payload);
        } catch {
          // skip malformed lines
        }
      }
    }
  },

  startBatchExperiment: (body: StartBatchExperimentRequest) =>
    request<BatchExperimentJob>("/batch/experiment", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getBatchJobStatus: (jobId: string) =>
    request<BatchExperimentJob>(`/batch/experiment/${jobId}`),
};
