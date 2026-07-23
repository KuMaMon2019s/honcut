// Sidebar.tsx — 左侧边栏：素材池 (MediaPool) + 素材库 (Library) 双 Tab
// 组合 MediaPoolPanel 和 LibraryPanel，替代原内联左侧面板

import { useState } from "react";
import MediaPoolPanel from "./MediaPoolPanel";
import LibraryPanel from "./LibraryPanel";
import { type ClipData } from "./ClipBlock";

type TabId = "pool" | "library";

interface SidebarProps {
  projectId: string;
  selectedClip: ClipData | null;
  onClipUpdated: () => void;
  onPreview: (media: { src: string; kind: "video" | "audio"; name: string }) => void;
  width?: number;
}

const TABS: { id: TabId; icon: string; label: string }[] = [
  { id: "pool", icon: "📦", label: "素材池" },
  { id: "library", icon: "🎛️", label: "素材库" },
];

export default function Sidebar({ projectId, selectedClip, onClipUpdated, onPreview, width = 260 }: SidebarProps) {
  const [tab, setTab] = useState<TabId>("pool");

  return (
    <div
      style={{
        width,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--cc-border)",
        background: "var(--cc-inset)",
        overflow: "hidden",
      }}
    >
      {/* ═══ Tab 栏 ═══ */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--cc-border)",
          flexShrink: 0,
          background: "var(--cc-panel)",
        }}
      >
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "9px 0",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                transition: "all 0.15s",
                background: active ? "var(--cc-panel-alt)" : "transparent",
                color: active ? "var(--cc-text-strong)" : "var(--cc-text-dim)",
                borderBottom: active ? "2px solid var(--cc-accent)" : "2px solid transparent",
                letterSpacing: "0.03em",
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {/* ═══ 面板内容 ═══ */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
        {tab === "pool" ? (
          <MediaPoolPanel projectId={projectId} onPreview={onPreview} />
        ) : (
          <LibraryPanel
            projectId={projectId}
            selectedClip={selectedClip}
            onClipUpdated={onClipUpdated}
          />
        )}
      </div>
    </div>
  );
}
