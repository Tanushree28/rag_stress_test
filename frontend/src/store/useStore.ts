import { create } from "zustand";
import type {
  AskResponse,
  CompareResponse,
  AggregateResponse,
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
  questionType: string;
  setQuestionType: (qt: string) => void;

  // Controls
  condition: string;
  setCondition: (c: string) => void;
  topK: number;
  setTopK: (k: number) => void;

  // Selective comparison
  selectedConditions: string[];
  setSelectedConditions: (conditions: string[]) => void;
  toggleCondition: (condition: string) => void;

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

  // Panel widths
  leftPanelWidth: number;
  setLeftPanelWidth: (w: number) => void;
  rightPanelWidth: number;
  setRightPanelWidth: (w: number) => void;

  // Analytics
  aggregateByCondition: AggregateResponse | null;
  setAggregateByCondition: (data: AggregateResponse | null) => void;
  aggregateByQuestionType: AggregateResponse | null;
  setAggregateByQuestionType: (data: AggregateResponse | null) => void;
  analyticsLoading: boolean;
  setAnalyticsLoading: (loading: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  mode: "evaluation",
  setMode: (mode) => set({ mode }),

  questions: [],
  setQuestions: (questions) => set({ questions }),
  selectedQuestion: null,
  setSelectedQuestion: (q) => set({ selectedQuestion: q }),
  questionType: "all",
  setQuestionType: (questionType) => set({ questionType }),

  condition: "clean",
  setCondition: (condition) => set({ condition }),
  topK: 5,
  setTopK: (topK) => set({ topK }),

  selectedConditions: [
    "clean",
    "noise_30",
    "noise_50",
    "noise_70",
    "conflict_50",
    "conflict_70",
    "unanswerable_partial",
    "unanswerable_full",
  ],
  setSelectedConditions: (selectedConditions) => set({ selectedConditions }),
  toggleCondition: (condition) =>
    set((state) => ({
      selectedConditions: state.selectedConditions.includes(condition)
        ? state.selectedConditions.filter((c) => c !== condition)
        : [...state.selectedConditions, condition],
    })),

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

  leftPanelWidth: 288,
  setLeftPanelWidth: (w) =>
    set({ leftPanelWidth: Math.max(200, Math.min(480, w)) }),
  rightPanelWidth: 384,
  setRightPanelWidth: (w) =>
    set({ rightPanelWidth: Math.max(280, Math.min(600, w)) }),

  aggregateByCondition: null,
  setAggregateByCondition: (aggregateByCondition) =>
    set({ aggregateByCondition }),
  aggregateByQuestionType: null,
  setAggregateByQuestionType: (aggregateByQuestionType) =>
    set({ aggregateByQuestionType }),
  analyticsLoading: false,
  setAnalyticsLoading: (analyticsLoading) => set({ analyticsLoading }),
}));
