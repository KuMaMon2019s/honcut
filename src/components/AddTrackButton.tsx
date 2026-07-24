// AddTrackButton.tsx — 添加轨道按钮 + 类型选择菜单

import { useState, useRef, useEffect } from "react";

interface AddTrackButtonProps {
  onAdd: (kind: "video" | "audio") => void;
}

export default function AddTrackButton({ onAdd }: AddTrackButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "4px 12px",
          fontSize: 12,
          color: "#999",
          background: "transparent",
          border: "1px dashed #444",
          borderRadius: 4,
          cursor: "pointer",
        }}
      >
        + 添加轨道
      </button>
      {open && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: 0,
          marginBottom: 4,
          background: "#1e1e1e",
          border: "1px solid #333",
          borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          overflow: "hidden",
          zIndex: 100,
          minWidth: 120,
        }}>
          <button
            onClick={() => { onAdd("video"); setOpen(false); }}
            style={{
              display: "block", width: "100%", padding: "8px 14px",
              fontSize: 13, color: "#ccc", background: "transparent",
              border: "none", cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            🎬 视频轨道
          </button>
          <button
            onClick={() => { onAdd("audio"); setOpen(false); }}
            style={{
              display: "block", width: "100%", padding: "8px 14px",
              fontSize: 13, color: "#ccc", background: "transparent",
              border: "none", cursor: "pointer", textAlign: "left",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            🎵 音频轨道
          </button>
        </div>
      )}
    </div>
  );
}