import { create } from "zustand";
import type {
  AskResponse,
  CompareResponse,
  Passage,
  Metrics,
  Question,
} from "@/lib/api";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: number[];
  passages?: Passage[];
  metrics?: Metrics | null;
  condition?: string;
  duration_s?: number;
  timestamp: number;
}

interface AppState {
  // Mode
  mode: "evaluation" | "free-chat";
  setMode: (mode: "evaluation" | "free-chat") => void;

  // Questions
  questions: Question[];
  setQuestions: (questions: Question[]) => void;
  selectedQuestion: Question | null;
  setSelectedQuestion: (q: Question | null) => void;

  // Controls
  condition: string;
  setCondition: (c: string) => void;
  topK: number;
  setTopK: (k: number) => void;

  // Chat
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  // Loading
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Current result (latest /ask response)
  currentResult: AskResponse | null;
  setCurrentResult: (r: AskResponse | null) => void;

  // Comparison
  comparisonResult: CompareResponse | null;
  setComparisonResult: (r: CompareResponse | null) => void;
  isComparing: boolean;
  setIsComparing: (c: boolean) => void;

  // Right panel tab
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const useStore = create<AppState>((set) => ({
  mode: "evaluation",
  setMode: (mode) => set({ mode }),

  questions: [],
  setQuestions: (questions) => set({ questions }),
  selectedQuestion: null,
  setSelectedQuestion: (q) => set({ selectedQuestion: q }),

  condition: "clean",
  setCondition: (condition) => set({ condition }),
  topK: 5,
  setTopK: (topK) => set({ topK }),

  messages: [],
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  currentResult: null,
  setCurrentResult: (currentResult) => set({ currentResult }),

  comparisonResult: null,
  setComparisonResult: (comparisonResult) => set({ comparisonResult }),
  isComparing: false,
  setIsComparing: (isComparing) => set({ isComparing }),

  activeTab: "evidence",
  setActiveTab: (activeTab) => set({ activeTab }),
}));
