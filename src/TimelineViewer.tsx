// TimelineViewer.tsx — 时间线查看器（重构版）
// 集成 Ruler + TrackLane + ClipBlock 三组件
// 左侧面板：SidePanel（素材池 + 素材库）
// 支持缩放、播放头定位、片段选中

import { useState, useEffect } from "react";
import RenderProgress from "./RenderProgress";
import MediaPlayer from "./components/MediaPlayer";
import SidePanel from "./components/SidePanel";
import Ruler from "./components/Ruler";
import TrackLane from "./components/TrackLane";
import { type ClipData } from "./components/ClipBlock";

interface Transition {
  id: string; fromItemId: string; toItemId: string;
  type: string; durationInFrames: number;
}

interface TimelineData {
  fps: number; items: ClipData[]; transitions: Transition[];
}

// 轨道颜色
const TRACK_COLORS: Record<string, string> = {
  V1: "#3b82f6", V2: "#22c55e", V3: "#f59e0b", V4: "#06b6d4",
  A1: "#8b5cf6", A2: "#ec4899", A3: "#f97316",
};

function colorForTrack(track: string): string {
  return TRACK_COLORS[track] ?? "#6b7280";
}

function frameToTime(f: number, fps: number): string {
  const s = Math.floor(f / fps);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// 缩放级别 → pxPerFrame
const ZOOM_LEVELS = [1, 2, 3, 5, 8, 12];
const DEFAULT_ZOOM_IDX = 2; // pxPerFrame = 3

export default function TimelineViewer({ projectId, onBack }: { projectId: string; onBack?: () => void }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [selectedClip, setSelectedClip] = useState<ClipData | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ src: string; kind: "video" | "audio"; name: string } | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [projectName, setProjectName] = useState("");

  const pxPerFrame = ZOOM_LEVELS[zoomIdx];

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${encodeURIComponent(projectId)}`).then(r => r.json()),
      fetch(`/api/projects/${encodeURIComponent(projectId)}/clips`).then(r => r.json()),
      fetch(`/api/projects/${encodeURIComponent(projectId)}/transitions`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/projects/${encodeURIComponent(projectId)}/timelines`).then(r => r.json()).catch(() => []),
    ])
      .then(([project, clips, transitions, timelines]) => {
        setProjectName(project.name || projectId);
        const items: ClipData[] = Array.isArray(clips) ? clips.map((c: any) => ({
          id: c.id,
          name: c.name || c.id?.slice(0, 8),
          kind: c.kind || "video",
          track: c.track || "V1",
          startFrame: c.start_frame || 0,
          durationInFrames: c.duration_frames || 60,
          src: c.src || "",
          props: typeof c.props === "string" ? JSON.parse(c.props || "{}") : (c.props || {}),
        })) : [];
        const trans = Array.isArray(transitions) ? transitions : [];
        const tlFps = Array.isArray(timelines) && timelines.length > 0 && timelines[0].fps ? timelines[0].fps : 24;
        setData({
          fps: tlFps,
          items,
          transitions: trans.map((t: any) => ({
            id: t.id, fromItemId: t.from_item_id, toItemId: t.to_item_id,
            type: t.type, durationInFrames: t.duration_frames,
          })),
        });
      })
      .catch(e => setError("加载失败: " + e.message));
  }, [projectId]);

  if (error) return <div style={{ color: "#f87171", padding: 24 }}>{error}</div>;
  if (!data) return <div style={{ color: "#888", padding: 24 }}>加载中…</div>;

  const { fps, items, transitions } = data;
  const totalFrames = items.length > 0
    ? Math.max(...items.map(i => i.startFrame + i.durationInFrames), fps * 5)
    : fps * 10;

  // 按轨道分组
  const tracks = new Map<string, ClipData[]>();
  for (const item of items) {
    const list = tracks.get(item.track) ?? [];
    list.push(item);
    tracks.set(item.track, list);
  }
  const sortedTrackIds = [...tracks.keys()].sort((a, b) => {
    const aIsAudio = a.startsWith("A");
    const bIsAudio = b.startsWith("A");
    if (aIsAudio !== bIsAudio) return aIsAudio ? 1 : -1;
    return a.localeCompare(b);
  });

  const headerWidth = 80;

  const handleSelectClip = (clip: ClipData) => {
    setSelectedClip(prev => prev?.id === clip.id ? null : clip);
  };

  const zoomIn = () => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1));
  const zoomOut = () => setZoomIdx(i => Math.max(i - 1, 0));

  return (
    <div style={{ fontFamily: "system-ui", background: "#111", color: "#eee", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ═══ 顶栏 ═══ */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={() => onBack ? onBack() : window.history.back()} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 20 }}>←</button>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{projectName || projectId}</span>
        <span style={{ color: "#666", fontSize: 13, marginLeft: 8 }}>
          {fps}fps · {items.length} 片段 · {transitions.length} 转场 · {frameToTime(totalFrames, fps)}
        </span>

        {/* 渲染按钮 */}
        <button
          onClick={() => setIsRendering(true)}
          disabled={isRendering}
          style={{
            background: isRendering ? "#333" : "#3b82f6",
            border: "none", color: isRendering ? "#666" : "#fff",
            borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600,
            cursor: isRendering ? "default" : "pointer",
            marginLeft: 8, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {isRendering ? "⏳ 渲染中" : "🎬 渲染"}
        </button>

        {/* 导出按钮 */}
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify({ projectId, projectName, fps, items, transitions }, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${projectName || projectId}-timeline.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{
            background: "none", border: "1px solid #555", color: "#ccc",
            borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          📦 导出
        </button>

        {/* 导入按钮 */}
        <label
          style={{
            background: "none", border: "1px solid #555", color: "#ccc",
            borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
          }}
        >
          📥 导入
          <input
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const imported = JSON.parse(text);
                const clips = imported.items ?? imported.clips ?? [];
                for (const clip of clips) {
                  await fetch(`/api/projects/${encodeURIComponent(projectId)}/clips`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: clip.name,
                      kind: clip.kind ?? "video",
                      track: clip.track ?? "V1",
                      start_frame: clip.startFrame ?? 0,
                      duration_frames: clip.durationInFrames ?? 60,
                      src: clip.src ?? "",
                    }),
                  });
                }
                window.location.reload();
              } catch (err) {
                alert("导入失败: " + (err as Error).message);
              }
            }}
          />
        </label>

        {/* 缩放控制 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
          <button onClick={zoomOut} disabled={zoomIdx === 0} style={{
            background: "#222", border: "1px solid #444", color: zoomIdx === 0 ? "#555" : "#ccc",
            borderRadius: 4, width: 26, height: 26, cursor: zoomIdx === 0 ? "default" : "pointer", fontSize: 14,
          }}>−</button>
          <span style={{ fontSize: 11, color: "#888", minWidth: 36, textAlign: "center" }}>
            {pxPerFrame}px/f
          </span>
          <button onClick={zoomIn} disabled={zoomIdx === ZOOM_LEVELS.length - 1} style={{
            background: "#222", border: "1px solid #444", color: zoomIdx === ZOOM_LEVELS.length - 1 ? "#555" : "#ccc",
            borderRadius: 4, width: 26, height: 26, cursor: zoomIdx === ZOOM_LEVELS.length - 1 ? "default" : "pointer", fontSize: 14,
          }}>+</button>
        </div>
      </div>

      {/* 渲染进度 */}
      <RenderProgress
        projectId={projectId}
        active={isRendering}
        onComplete={() => setIsRendering(false)}
        onCancel={() => setIsRendering(false)}
      />

      {/* ═══ 主体 ═══ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* 左侧面板：素材池 + 素材库 */}
        <SidePanel
          projectId={projectId}
          onPreview={(media) => setSelectedMedia(media)}
        />

        {/* ═══ 右侧：时间线区域 ═══ */}
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {/* 标尺 */}
          <Ruler
            totalFrames={totalFrames}
            fps={fps}
            pxPerFrame={pxPerFrame}
            playhead={playhead}
            onSeek={setPlayhead}
            headerWidth={headerWidth}
          />

          {/* 轨道列表 */}
          <div style={{ padding: "4px 0", flex: 1 }}>
            {sortedTrackIds.map(trackId => (
              <TrackLane
                key={trackId}
                trackId={trackId}
                clips={tracks.get(trackId) ?? []}
                pxPerFrame={pxPerFrame}
                totalFrames={totalFrames}
                color={colorForTrack(trackId)}
                selectedClipId={selectedClip?.id ?? null}
                onSelectClip={handleSelectClip}
                fps={fps}
                headerWidth={headerWidth}
              />
            ))}

            {sortedTrackIds.length === 0 && (
              <div style={{ padding: 24, color: "#555", fontSize: 13, textAlign: "center" }}>
                暂无轨道数据
              </div>
            )}
          </div>

          {/* 播放头控制条 */}
          <div style={{ padding: "8px 16px", borderTop: "1px solid #2a2a2a", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "#ef4444", fontFamily: "monospace", minWidth: 60 }}>
                {frameToTime(playhead, fps)}
              </span>
              <input type="range" min={0} max={totalFrames} value={playhead}
                onChange={e => setPlayhead(Number(e.target.value))}
                style={{ flex: 1, cursor: "pointer", accentColor: "#ef4444" }}
              />
              <span style={{ fontSize: 12, color: "#666", fontFamily: "monospace", minWidth: 60, textAlign: "right" }}>
                {frameToTime(totalFrames, fps)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 选中片段信息浮层 */}
      {selectedClip && (
        <div style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 900,
          background: "#1e1e1e", border: "1px solid #444", borderRadius: 8,
          padding: 12, width: 220, boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
            🎬 片段详情
            <button onClick={() => setSelectedClip(null)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>
              ✕
            </button>
          </div>
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{selectedClip.name}</div>
            <div style={{ color: "#888", lineHeight: 1.8 }}>
              <div>轨道: <span style={{ color: colorForTrack(selectedClip.track) }}>{selectedClip.track}</span></div>
              <div>类型: {selectedClip.kind}</div>
              <div>起始: {frameToTime(selectedClip.startFrame, fps)} ({selectedClip.startFrame}f)</div>
              <div>时长: {frameToTime(selectedClip.durationInFrames, fps)} ({selectedClip.durationInFrames}f)</div>
              <div>结束: {frameToTime(selectedClip.startFrame + selectedClip.durationInFrames, fps)}</div>
            </div>
            {selectedClip.src && (
              <button
                onClick={() => setSelectedMedia({ src: selectedClip.src, kind: selectedClip.kind as "video" | "audio", name: selectedClip.name })}
                style={{
                  marginTop: 8, background: "#3b82f6", border: "none", color: "#fff",
                  borderRadius: 4, padding: "4px 12px", fontSize: 11, cursor: "pointer",
                }}
              >
                ▶ 预览
              </button>
            )}
          </div>
        </div>
      )}

      {/* MediaPlayer 弹层 */}
      {selectedMedia && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.85)", display: "flex",
          alignItems: "center", justifyContent: "center",
          padding: 24,
        }} onClick={e => { if (e.target === e.currentTarget) setSelectedMedia(null); }}>
          <MediaPlayer
            src={selectedMedia.src}
            kind={selectedMedia.kind}
            title={selectedMedia.name}
            onClose={() => setSelectedMedia(null)}
            autoPlay
          />
        </div>
      )}
    </div>
  );
}
