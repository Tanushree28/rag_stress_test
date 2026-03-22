"use client";

import { Header } from "@/components/layout/Header";
import { ControlPanel } from "@/components/controls/ControlPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { EvidencePanel } from "@/components/evidence/EvidencePanel";

export default function Home() {
  return (
    <div className="h-screen flex flex-col bg-gray-100">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <ControlPanel />
        <ChatPanel />
        <EvidencePanel />
      </div>
    </div>
  );
}
