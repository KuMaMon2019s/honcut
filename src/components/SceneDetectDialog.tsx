// SceneDetectDialog.tsx — P7 场景检测结果对话框
// 显示检测到的场景列表 + 一键导入为片段

import { useState } from "react";
import { api, type SceneResult } from "../api/client";

interface SceneDetectDialogProps {
  projectId: string;
  assetId: string;
  assetName: string;
  scenes: SceneResult[];
  onClose: () => void;
  onImported: () => void;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${m}:${s.padStart(4, "0")}`;
}

export default function SceneDetectDialog({
  projectId, assetId, assetName, scenes, onClose, onImported,
}: SceneDetectDialogProps) {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      await api.autoSplit(projectId, { asset_id: assetId, scenes });
      setImported(true);
      onImported();
    } catch {
      /* ignore */
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "#1e1e1e", border: "1px solid #333", borderRadius: 10,
          width: 420, maxHeight: "70vh", display: "flex", flexDirection: "column",
          boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div style={{
          padding: "14px 16px", borderBottom: "1px solid #333",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>
            🎬 场景检测 — {assetName}
          </span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "#888",
              cursor: "pointer", fontSize: 16, padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* 场景列表 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>
            检测到 <span style={{ color: "#f59e0b", fontWeight: 700 }}>{scenes.length}</span> 个场景
          </div>
          {scenes.map(s => (
            <div
              key={s.index}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 10px", marginBottom: 4,
                background: "#252525", borderRadius: 6, fontSize: 12,
              }}
            >
              <span style={{
                background: "#f59e0b22", color: "#f59e0b", borderRadius: 4,
                padding: "1px 6px", fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                #{s.index + 1}
              </span>
              <span style={{ color: "#ccc", flex: 1 }}>
                {fmtTime(s.start_seconds)} → {fmtTime(s.end_seconds)}
              </span>
              <span style={{ color: "#666", fontSize: 10 }}>
                {s.start_frame}f–{s.end_frame}f ({s.end_frame - s.start_frame}f)
              </span>
            </div>
          ))}
          {scenes.length === 0 && (
            <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 20 }}>
              未检测到场景切换点
            </div>
          )}
        </div>

        {/* 操作按钮 */}
        <div style={{
          padding: "12px 16px", borderTop: "1px solid #333",
          display: "flex", gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "8px 0", borderRadius: 6, fontSize: 13,
              background: "transparent", border: "1px solid #444",
              color: "#aaa", cursor: "pointer",
            }}
          >
            关闭
          </button>
          <button
            onClick={handleImport}
            disabled={importing || imported || scenes.length === 0}
            style={{
              flex: 2, padding: "8px 0", borderRadius: 6, fontSize: 13, fontWeight: 600,
              background: imported ? "#166534" : "#f59e0b",
              border: "none",
              color: imported ? "#4ade80" : "#111",
              cursor: importing || imported ? "default" : "pointer",
              opacity: scenes.length === 0 ? 0.4 : 1,
            }}
          >
            {importing ? "导入中…" : imported ? "✅ 已导入" : `📥 导入为 ${scenes.length} 个片段`}
          </button>
        </div>
      </div>
    </div>
  );
}
