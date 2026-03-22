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
  duration_s: number;
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

  getHistory: (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.offset) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<{ total: number; experiments: Experiment[] }>(
      `/history${query ? `?${query}` : ""}`
    );
  },
};
