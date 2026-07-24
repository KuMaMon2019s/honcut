// MediaPoolPanel.tsx — 素材池面板：上传 + 项目素材管理（预览/重命名/删除）
// P7: 右键菜单 → 场景检测 / 转录文字
// 数据源: GET /api/projects/{id}/assets, POST /api/upload

import { useState, useRef, useEffect } from "react";
import UploadPanel from "../UploadPanel";
import SceneDetectDialog from "./SceneDetectDialog";
import { useAssets, useAssetActions } from "../api/hooks";
import { api, type Asset, type SceneResult, type TranscriptionSegment } from "../api/client";

interface MediaPoolPanelProps {
  projectId: string;
  onPreview: (media: { src: string; kind: "video" | "audio"; name: string }) => void;
  onClipsChanged?: () => void;
}

const KIND_ICONS: Record<string, string> = {
  video: "🎬", audio: "🎵", image: "🖼️",
};

const KIND_COLORS: Record<string, string> = {
  video: "#2d7fb5", audio: "#2f9e5a", image: "#c8912f",
};

export default function MediaPoolPanel({ projectId, onPreview, onClipsChanged }: MediaPoolPanelProps) {
  const { data: assets, loading, reload } = useAssets(projectId);
  const { remove, rename } = useAssetActions(projectId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // P7: 右键菜单
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; asset: Asset } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // P7: 场景检测
  const [detecting, setDetecting] = useState<string | null>(null);
  const [sceneDialog, setSceneDialog] = useState<{ asset: Asset; scenes: SceneResult[] } | null>(null);

  // P7: 转录
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<{ asset: Asset; segments: TranscriptionSegment[]; language: string } | null>(null);

  const list = assets ?? [];

  // 点击菜单外关闭
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

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

  // P7: 场景检测
  const handleDetectScenes = async (asset: Asset) => {
    setCtxMenu(null);
    setDetecting(asset.id);
    try {
      const res = await api.detectScenes(projectId, { asset_id: asset.id, threshold: 0.3, min_scene_length: 1.0 });
      setSceneDialog({ asset, scenes: res.scenes ?? [] });
    } catch { /* ignore */ }
    setDetecting(null);
  };

  // P7: 转录
  const handleTranscribe = async (asset: Asset) => {
    setCtxMenu(null);
    setTranscribing(asset.id);
    try {
      const res = await api.transcribe(projectId, { asset_id: asset.id, language: "auto" });
      setTranscription({ asset, segments: res.segments ?? [], language: res.language });
    } catch { /* ignore */ }
    setTranscribing(null);
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
          onContextMenu={e => {
            if (a.kind === "video") {
              e.preventDefault();
              setCtxMenu({ x: e.clientX, y: e.clientY, asset: a });
            }
          }}
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
            {/* P7: 检测/转录 loading 指示 */}
            {detecting === a.id && <span style={{ fontSize: 10, color: "#f59e0b" }}>⏳</span>}
            {transcribing === a.id && <span style={{ fontSize: 10, color: "#60a5fa" }}>⏳</span>}
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

      {/* ═══ P7: 右键菜单 ═══ */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          style={{
            position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 3000,
            background: "#1e1e1e", border: "1px solid #333", borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)", padding: "4px 0",
            minWidth: 160,
          }}
        >
          <div style={{ padding: "4px 10px 6px", fontSize: 10, color: "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ctxMenu.asset.name}
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
              fontSize: 12, color: "#e0e0e0", cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => handleDetectScenes(ctxMenu.asset)}
          >
            <span>🎬</span><span>场景检测</span>
          </div>
          <div
            style={{
              display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
              fontSize: 12, color: "#e0e0e0", cursor: "pointer",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            onClick={() => handleTranscribe(ctxMenu.asset)}
          >
            <span>📝</span><span>转录文字</span>
          </div>
        </div>
      )}

      {/* ═══ P7: 场景检测结果对话框 ═══ */}
      {sceneDialog && (
        <SceneDetectDialog
          projectId={projectId}
          assetId={sceneDialog.asset.id}
          assetName={sceneDialog.asset.name}
          scenes={sceneDialog.scenes}
          onClose={() => setSceneDialog(null)}
          onImported={() => onClipsChanged?.()}
        />
      )}

      {/* ═══ P7: 转录结果对话框 ═══ */}
      {transcription && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={e => { if (e.target === e.currentTarget) setTranscription(null); }}
        >
          <div
            style={{
              background: "#1e1e1e", border: "1px solid #333", borderRadius: 10,
              width: 420, maxHeight: "70vh", display: "flex", flexDirection: "column",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              padding: "14px 16px", borderBottom: "1px solid #333",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#eee" }}>
                📝 转录结果 — {transcription.asset.name}
              </span>
              <button onClick={() => setTranscription(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16, padding: 0 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                语言: {transcription.language} · {transcription.segments.length} 段
              </div>
              {transcription.segments.map((seg, i) => (
                <div key={i} style={{
                  padding: "6px 10px", marginBottom: 4,
                  background: "#252525", borderRadius: 6, fontSize: 12,
                }}>
                  <span style={{ color: "#f59e0b", fontSize: 10, marginRight: 8 }}>
                    {seg.start.toFixed(1)}s–{seg.end.toFixed(1)}s
                  </span>
                  <span style={{ color: "#ddd" }}>{seg.text}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 16px", borderTop: "1px solid #333" }}>
              <button
                onClick={() => setTranscription(null)}
                style={{
                  width: "100%", padding: "8px 0", borderRadius: 6, fontSize: 13,
                  background: "transparent", border: "1px solid #444", color: "#aaa", cursor: "pointer",
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
