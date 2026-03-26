"use client";

import { useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { ControlPanel } from "@/components/controls/ControlPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useStore } from "@/store/useStore";

export default function Home() {
  const {
    leftPanelWidth,
    setLeftPanelWidth,
    rightPanelWidth,
    setRightPanelWidth,
  } = useStore();

  const handleLeftResize = useCallback(
    (delta: number) => setLeftPanelWidth(leftPanelWidth + delta),
    [leftPanelWidth, setLeftPanelWidth]
  );

  const handleRightResize = useCallback(
    (delta: number) => setRightPanelWidth(rightPanelWidth + delta),
    [rightPanelWidth, setRightPanelWidth]
  );

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <div
          style={{ width: leftPanelWidth, minWidth: 200, maxWidth: 480 }}
          className="shrink-0"
        >
          <ControlPanel />
        </div>
        <ResizeHandle side="left" onResize={handleLeftResize} />
        <ChatPanel />
        <ResizeHandle side="right" onResize={handleRightResize} />
        <div
          style={{ width: rightPanelWidth, minWidth: 280, maxWidth: 600 }}
          className="shrink-0"
        >
          <EvidencePanel />
        </div>
      </div>
    </div>
  );
}
