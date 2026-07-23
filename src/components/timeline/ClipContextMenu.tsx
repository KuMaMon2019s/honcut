// ClipContextMenu.tsx — 时间线片段右键菜单
// 操作: 分割 / 复制 / 删除 / 添加转场，通过 POST /api/mcp 调用后端工具

import { useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import { type ClipData } from "../ClipBlock";

export interface ContextMenuState {
  x: number;
  y: number;
  clip: ClipData;
}

interface ClipContextMenuProps {
  state: ContextMenuState;
  projectId: string;
  playhead: number;
  onClose: () => void;
  onChanged: () => void;
  onAddTransition: (clip: ClipData) => void;
}

interface MenuItem {
  label: string;
  icon: string;
  shortcut?: string;
  danger?: boolean;
  action: () => Promise<void> | void;
}

export default function ClipContextMenu({
  state, projectId, playhead, onClose, onChanged, onAddTransition,
}: ClipContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 点击外部 / Esc 关闭
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const clip = state.clip;
  const splitFrame = Math.max(clip.startFrame + 1, Math.min(playhead, clip.startFrame + clip.durationInFrames - 1));

  const items: MenuItem[] = [
    {
      label: "分割", icon: "✂️", shortcut: "C",
      action: () => run("分割", () =>
        api.mcpCall("split_clip", { project_id: projectId, clip_id: clip.id, at_frame: splitFrame }).then(() => {})),
    },
    {
      label: "复制", icon: "📋", shortcut: "⌘D",
      action: () => run("复制", () =>
        api.mcpCall("duplicate_clip", { project_id: projectId, clip_id: clip.id }).then(() => {})),
    },
    {
      label: "添加转场", icon: "🔀",
      action: () => { onAddTransition(clip); onClose(); },
    },
    {
      label: "删除", icon: "🗑️", shortcut: "⌫", danger: true,
      action: () => run("删除", () =>
        api.mcpCall("delete_clip", { project_id: projectId, clip_id: clip.id }).then(() => {})),
    },
  ];

  // 防止菜单超出视口
  const menuW = 180;
  const menuH = items.length * 34 + 12;
  const left = Math.min(state.x, window.innerWidth - menuW - 8);
  const top = Math.min(state.y, window.innerHeight - menuH - 8);

  return (
    <div
      ref={ref}
      onContextMenu={e => e.preventDefault()}
      style={{
        position: "fixed", left, top, zIndex: 2000,
        width: menuW,
        background: "#232323",
        border: "1px solid #3a3a3a",
        borderRadius: 8,
        boxShadow: "0 8px 28px rgba(0,0,0,0.6)",
        padding: "5px 0",
        userSelect: "none",
      }}
    >
      {/* 片段名 */}
      <div style={{
        padding: "4px 12px 7px",
        fontSize: 10, color: "#777",
        borderBottom: "1px solid #333",
        marginBottom: 4,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {clip.name}
      </div>

      {items.map(item => (
        <div
          key={item.label}
          onClick={() => { if (!busy) item.action(); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 12px",
            fontSize: 12,
            cursor: busy ? "wait" : "pointer",
            opacity: busy && busy !== item.label ? 0.4 : 1,
            color: item.danger ? "#f87171" : "#ddd",
            transition: "background 0.1s",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = item.danger ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.06)")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <span style={{ fontSize: 13, width: 18, textAlign: "center", flexShrink: 0 }}>
            {busy === item.label ? "⏳" : item.icon}
          </span>
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.shortcut && (
            <span style={{ fontSize: 9, color: "#666", fontFamily: "monospace" }}>{item.shortcut}</span>
          )}
        </div>
      ))}

      {error && (
        <div style={{
          margin: "4px 10px 2px", padding: "5px 8px",
          fontSize: 10, color: "#f87171",
          background: "rgba(248,113,113,0.1)", borderRadius: 4,
          wordBreak: "break-all",
        }}>
          {error}
        </div>
      )}
    </div>
  );
}
