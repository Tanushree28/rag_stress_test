"use client";

import type { ChatMessage } from "@/store/useStore";
import { Badge } from "@/components/ui/badge";

interface ChatBubbleProps {
  message: ChatMessage;
}

export function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-white border border-gray-200 text-gray-800"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap leading-relaxed">
          {message.content}
        </p>
        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.citations.map((c) => (
              <Badge key={c} variant="secondary" className="text-xs">
                [{c}]
              </Badge>
            ))}
          </div>
        )}
        {!isUser && message.condition && (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
            <span>Condition: {message.condition}</span>
            {message.duration_s && <span>{message.duration_s}s</span>}
          </div>
        )}
      </div>
    </div>
  );
}
