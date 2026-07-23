// MediaPoolPanel.tsx — 素材池面板：上传 + 项目素材管理（预览/重命名/删除）
// 数据源: GET /api/projects/{id}/assets, POST /api/upload
// 复用 UploadPanel 组件和 api/hooks

import { useState } from "react";
import UploadPanel from "../UploadPanel";
import { useAssets, useAssetActions } from "../api/hooks";

interface MediaPoolPanelProps {
  projectId: string;
  onPreview: (media: { src: string; kind: "video" | "audio"; name: string }) => void;
}

const KIND_ICONS: Record<string, string> = {
  video: "🎬", audio: "🎵", image: "🖼️",
};

const KIND_COLORS: Record<string, string> = {
  video: "#2d7fb5", audio: "#2f9e5a", image: "#c8912f",
};

export default function MediaPoolPanel({ projectId, onPreview }: MediaPoolPanelProps) {
  const { data: assets, loading, reload } = useAssets(projectId);
  const { remove, rename } = useAssetActions(projectId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const list = assets ?? [];

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    try {
      await rename(renamingId, renameValue.trim());
      reload();
    } catch { /* ignore */ }
    setRenamingId(null);
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    setConfirmDeleteId(null);
    try {
      await remove(id);
      reload();
    } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ═══ 上传区 ═══ */}
      <UploadPanel projectId={projectId} onUploaded={reload} />

      {/* ═══ 素材列表头 ═══ */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#bbb", letterSpacing: "0.04em" }}>
          📦 素材 <span style={{ color: "#555", fontWeight: 400 }}>({list.length})</span>
        </span>
        {list.length > 0 && (
          <button
            onClick={reload}
            style={{
              background: "none", border: "none", color: "#dc7036",
              cursor: "pointer", fontSize: 11, padding: 0, fontWeight: 600,
            }}
          >
            ↻ 刷新
          </button>
        )}
      </div>

      {/* ═══ 状态 ═══ */}
      {loading && (
        <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 16 }}>加载中…</div>
      )}

      {!loading && list.length === 0 && (
        <div style={{
          textAlign: "center", color: "#555", fontSize: 12, padding: 24,
          border: "1px dashed #333", borderRadius: 8,
        }}>
          暂无素材
          <div style={{ fontSize: 10, marginTop: 4 }}>拖拽文件到上方区域上传</div>
        </div>
      )}

      {/* ═══ 素材卡片 ═══ */}
      {list.map(a => (
        <div
          key={a.id}
          style={{
            background: "#1e1e1e", borderRadius: 6, padding: 8,
            border: "1px solid #333", transition: "border-color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "#555")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
        >
          {/* 缩略图 */}
          {a.kind === "video" ? (
            <video
              src={a.src}
              muted
              style={{ width: "100%", borderRadius: 4, background: "#000", marginBottom: 6, cursor: "pointer" }}
              onClick={() => onPreview({ src: a.src, kind: "video", name: a.name })}
              onMouseEnter={e => (e.target as HTMLVideoElement).play()}
              onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
            />
          ) : a.kind === "image" ? (
            <img
              src={a.src}
              alt={a.name}
              style={{ width: "100%", borderRadius: 4, background: "#000", marginBottom: 6, cursor: "pointer" }}
              onClick={() => onPreview({ src: a.src, kind: "video", name: a.name })}
            />
          ) : (
            <div
              style={{
                height: 36, background: "#111", borderRadius: 4, marginBottom: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, cursor: "pointer",
              }}
              onClick={() => onPreview({ src: a.src, kind: "audio", name: a.name })}
            >
              🎵
            </div>
          )}

          {/* 名称 + 操作 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                width: 3, height: 14, borderRadius: 2, flexShrink: 0,
                background: KIND_COLORS[a.kind] ?? "#666",
              }}
            />
            {renamingId === a.id ? (
              <input
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
                autoFocus
                style={{
                  flex: 1, background: "#111", border: "1px solid #dc7036",
                  borderRadius: 3, color: "#eee", fontSize: 11, padding: "2px 4px",
                  outline: "none", minWidth: 0,
                }}
              />
            ) : (
              <span
                onClick={() => onPreview({ src: a.src, kind: (a.kind === "audio" ? "audio" : "video") as "video" | "audio", name: a.name })}
                style={{
                  flex: 1, fontSize: 11, overflow: "hidden", cursor: "pointer",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={a.name}
              >
                {KIND_ICONS[a.kind] ?? "📄"} {a.name}
              </span>
            )}
            <button
              onClick={() => { setRenamingId(a.id); setRenameValue(a.name); }}
              title="重命名"
              style={{
                background: "none", border: "none", color: "#666",
                cursor: "pointer", fontSize: 11, padding: "0 2px", flexShrink: 0,
              }}
            >
              ✏️
            </button>
            <button
              onClick={() => handleDelete(a.id)}
              title={confirmDeleteId === a.id ? "再点一次确认删除" : "删除"}
              style={{
                background: "none", border: "none", padding: "0 2px", flexShrink: 0,
                cursor: "pointer", fontSize: 11,
                color: confirmDeleteId === a.id ? "#e06c60" : "#666",
              }}
            >
              {confirmDeleteId === a.id ? "❗" : "🗑️"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
