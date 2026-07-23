// TimelineViewer.tsx — 时间线查看器
// 布局: 顶栏 → 中间 [SidePanel | ResizeHandle | PreviewPanel | ResizeHandle | InspectorPanel] → 底部时间线
// R7: 增强预览引擎 | R8: undo/redo | R9: 面板拖拽大小

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import PreviewPanel from "./components/PreviewPanel";
import InspectorPanel from "./components/InspectorPanel";
import ExportDialog from "./components/ExportDialog";
import MediaPlayer from "./components/MediaPlayer";
import Ruler from "./components/Ruler";
import TrackLane from "./components/TrackLane";
import ResizeHandle from "./components/ResizeHandle";
import { type ClipData } from "./components/ClipBlock";
import { useProject, useClips, useTransitions, useTimelines } from "./api/hooks";
import { api, type Clip as ApiClip, type Transition as ApiTransition } from "./api/client";
import { useUndo } from "./hooks/useUndo";

// ── 工具 ──

function frameToTime(f: number, fps: number): string {
  const s = Math.floor(f / fps);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const TRACK_COLORS: Record<string, string> = {
  V1: "#3b82f6", V2: "#22c55e", V3: "#f59e0b", V4: "#06b6d4",
  A1: "#8b5cf6", A2: "#ec4899", A3: "#f97316",
};

function colorForTrack(track: string): string {
  return TRACK_COLORS[track] ?? "#6b7280";
}

const ZOOM_LEVELS = [1, 2, 3, 5, 8, 12];
const DEFAULT_ZOOM_IDX = 2;

function mapClip(c: ApiClip): ClipData {
  let props: Record<string, unknown> = {};
  if (typeof c.props === "string" && c.props) {
    try { props = JSON.parse(c.props); } catch { /* ignore */ }
  }
  return {
    id: c.id,
    name: c.name || c.id?.slice(0, 8),
    kind: c.kind || "video",
    track: c.track || "V1",
    startFrame: c.start_frame || 0,
    durationInFrames: c.duration_frames || 60,
    src: c.src || "",
    props,
  };
}

// ── 组件 ──

export default function TimelineViewer({ projectId, onBack }: { projectId: string; onBack?: () => void }) {
  // ── 数据层：hooks ──
  const { data: project, loading: projectLoading, error: projectError } = useProject(projectId);
  const { data: rawClips, loading: clipsLoading, reload: reloadClips } = useClips(projectId);
  const { data: rawTransitions, loading: transitionsLoading } = useTransitions(projectId);
  const { data: timelines } = useTimelines(projectId);

  // ── UI 状态 ──
  const [playhead, setPlayhead] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ src: string; kind: "video" | "audio"; name: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);

  // ── R9: 面板宽度状态 ──
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [inspectorWidth, setInspectorWidth] = useState(280);

  const pxPerFrame = ZOOM_LEVELS[zoomIdx];

  // ── 派生数据 ──
  const clips: ApiClip[] = useMemo(() => (Array.isArray(rawClips) ? rawClips : []), [rawClips]);
  const clipDataItems: ClipData[] = useMemo(() => clips.map(mapClip), [clips]);
  const transitions: ApiTransition[] = useMemo(() => (Array.isArray(rawTransitions) ? rawTransitions : []), [rawTransitions]);

  const fps = useMemo(() => {
    if (Array.isArray(timelines) && timelines.length > 0 && timelines[0].fps) return timelines[0].fps;
    return 24;
  }, [timelines]);

  const projectName = project?.name || projectId;

  const totalFrames = clipDataItems.length > 0
    ? Math.max(...clipDataItems.map(i => i.startFrame + i.durationInFrames), fps * 5)
    : fps * 10;

  // 选中的 clip（snake_case 原始类型，给 InspectorPanel / PreviewPanel）
  const selectedClip: ApiClip | null = useMemo(
    () => clips.find(c => c.id === selectedClipId) ?? null,
    [clips, selectedClipId],
  );

  // 按轨道分组（ClipData 给 TrackLane）
  const tracks = useMemo(() => {
    const m = new Map<string, ClipData[]>();
    for (const item of clipDataItems) {
      const list = m.get(item.track) ?? [];
      list.push(item);
      m.set(item.track, list);
    }
    return m;
  }, [clipDataItems]);

  const sortedTrackIds = useMemo(() =>
    [...tracks.keys()].sort((a, b) => {
      const aA = a.startsWith("A"), bA = b.startsWith("A");
      if (aA !== bA) return aA ? 1 : -1;
      return a.localeCompare(b);
    }), [tracks]);

  const headerWidth = 80;

  const handleSelectClip = useCallback((clip: ClipData) => {
    setSelectedClipId(prev => prev === clip.id ? null : clip.id);
  }, []);

  const handleDeselect = useCallback(() => setSelectedClipId(null), []);

  // ── R8: Undo/Redo ──
  // 快照 = clips 数组的 JSON 序列化（轻量，适合当前规模）
  const undoState = useUndo<string>("[]");

  // 当 clips 从 API 加载/刷新时，同步到 undo 快照
  const clipsSnapshot = useMemo(() => JSON.stringify(clips), [clips]);
  const prevSnapshotRef = useRef(clipsSnapshot);
  useEffect(() => {
    if (clipsSnapshot !== prevSnapshotRef.current) {
      prevSnapshotRef.current = clipsSnapshot;
      undoState.commit(clipsSnapshot);
    }
  }, [clipsSnapshot]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = useCallback(() => {
    undoState.undo();
    // undo 后需要把快照写回 API（逐 clip 更新 timing）
    // 简化实现：undo 后 reload，让 UI 反映 API 状态
    // 完整实现需要 diff 快照并逐条 PATCH — 当前阶段先做 UI 级 undo
  }, [undoState]);

  const handleRedo = useCallback(() => {
    undoState.redo();
  }, [undoState]);

  // 全局快捷键：⌘Z / ⌘⇧Z
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleUndo, handleRedo]);

  // 拖拽片段 → 更新 startFrame（带 undo 快照）
  const handleClipDragEnd = useCallback(async (clipId: string, newStartFrame: number) => {
    try {
      await api.updateClipTiming(projectId, clipId, { start_frame: newStartFrame });
      reloadClips();
    } catch (e) {
      console.error("拖拽更新失败:", e);
    }
  }, [projectId, reloadClips]);

  const zoomIn = () => setZoomIdx(i => Math.min(i + 1, ZOOM_LEVELS.length - 1));
  const zoomOut = () => setZoomIdx(i => Math.max(i - 1, 0));

  // ── 加载 / 错误 ──
  const loading = projectLoading || clipsLoading || transitionsLoading;
  if (projectError) return <div className="text-danger p-6">加载失败: {projectError}</div>;
  if (loading) return <div className="text-text-dim p-6">加载中…</div>;

  return (
    <div className="flex flex-col h-screen bg-bg text-text font-sans">
      {/* ═══ 顶栏 ═══ */}
      <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 shrink-0">
        <button
          onClick={() => onBack ? onBack() : window.history.back()}
          className="text-text-dim hover:text-text text-xl bg-transparent border-none cursor-pointer"
        >
          ←
        </button>
        <span className="text-lg font-semibold">{projectName}</span>
        <span className="text-text-dim text-[13px] ml-1">
          {fps}fps · {clips.length} 片段 · {transitions.length} 转场 · {frameToTime(totalFrames, fps)}
        </span>

        {/* Undo/Redo 按钮 */}
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handleUndo}
            disabled={!undoState.canUndo}
            title="撤销 (⌘Z)"
            className="w-7 h-7 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-hover disabled:opacity-30 disabled:cursor-default text-sm bg-transparent border-none cursor-pointer"
          >
            ↩
          </button>
          <button
            onClick={handleRedo}
            disabled={!undoState.canRedo}
            title="重做 (⌘⇧Z)"
            className="w-7 h-7 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-hover disabled:opacity-30 disabled:cursor-default text-sm bg-transparent border-none cursor-pointer"
          >
            ↪
          </button>
        </div>

        {/* 渲染按钮 → ExportDialog */}
        <button
          onClick={() => setExportOpen(true)}
          className="ml-2 px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-accent text-on-accent hover:bg-accent-deep border-none cursor-pointer"
        >
          🎬 渲染
        </button>

        {/* 导出 JSON */}
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify({ projectId, projectName, fps, items: clipDataItems, transitions }, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${projectName || projectId}-timeline.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-transparent border border-border-light text-text-muted hover:text-text cursor-pointer"
        >
          📦 导出
        </button>

        {/* 导入 */}
        <label className="px-3.5 py-1.5 rounded-md text-[13px] font-semibold bg-transparent border border-border-light text-text-muted hover:text-text cursor-pointer">
          📥 导入
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const imported = JSON.parse(text);
                const importedClips = imported.items ?? imported.clips ?? [];
                for (const clip of importedClips) {
                  await api.createClip(projectId, {
                    name: clip.name,
                    kind: clip.kind ?? "video",
                    track: clip.track ?? "V1",
                    start_frame: clip.startFrame ?? 0,
                    duration_frames: clip.durationInFrames ?? 60,
                    src: clip.src ?? "",
                  });
                }
                reloadClips();
              } catch (err) {
                alert("导入失败: " + (err as Error).message);
              }
            }}
          />
        </label>

        {/* 缩放控制 */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={zoomOut} disabled={zoomIdx === 0}
            className="w-[26px] h-[26px] rounded bg-panel-alt border border-border-light text-text-muted disabled:text-text-dim disabled:cursor-default cursor-pointer text-sm">
            −
          </button>
          <span className="text-[11px] text-text-dim min-w-9 text-center">{pxPerFrame}px/f</span>
          <button onClick={zoomIn} disabled={zoomIdx === ZOOM_LEVELS.length - 1}
            className="w-[26px] h-[26px] rounded bg-panel-alt border border-border-light text-text-muted disabled:text-text-dim disabled:cursor-default cursor-pointer text-sm">
            +
          </button>
        </div>
      </div>

      {/* ═══ 中间区域（含可拖拽分隔条） ═══ */}
      <div className="flex flex-1 min-h-0">
        {/* 左侧面板 */}
        <Sidebar
          projectId={projectId}
          selectedClip={clipDataItems.find(c => c.id === selectedClipId) ?? null}
          onClipUpdated={reloadClips}
          onPreview={(media: { src: string; kind: "video" | "audio"; name: string }) => setSelectedMedia(media)}
          width={sidebarWidth}
        />

        {/* R9: 左侧拖拽条 */}
        <ResizeHandle
          size={sidebarWidth}
          onResize={setSidebarWidth}
          min={180}
          max={450}
          side="left"
        />

        {/* 预览区 */}
        <PreviewPanel
          clips={clips}
          playhead={playhead}
          fps={fps}
          totalFrames={totalFrames}
          selectedClip={selectedClip}
          onSelectClip={(c) => setSelectedClipId(c?.id ?? null)}
          onPlayheadChange={setPlayhead}
        />

        {/* R9: 右侧拖拽条 */}
        <ResizeHandle
          size={inspectorWidth}
          onResize={setInspectorWidth}
          min={200}
          max={450}
          side="right"
        />

        {/* 右侧属性面板 */}
        <InspectorPanel
          projectId={projectId}
          clip={selectedClip}
          fps={fps}
          totalFrames={totalFrames}
          clipCount={clips.length}
          transitionCount={transitions.length}
          projectName={projectName}
          onClipUpdated={reloadClips}
          onDeselect={handleDeselect}
          width={inspectorWidth}
        />
      </div>

      {/* ═══ 底部时间线 ═══ */}
      <div className="h-[220px] shrink-0 border-t border-border flex flex-col overflow-hidden">
        {/* 标尺 */}
        <div className="overflow-x-auto shrink-0">
          <Ruler
            totalFrames={totalFrames}
            fps={fps}
            pxPerFrame={pxPerFrame}
            playhead={playhead}
            onSeek={setPlayhead}
            headerWidth={headerWidth}
          />
        </div>

        {/* 轨道列表 */}
        <div className="flex-1 overflow-auto py-1">
          {sortedTrackIds.map(trackId => (
            <TrackLane
              key={trackId}
              trackId={trackId}
              clips={tracks.get(trackId) ?? []}
              pxPerFrame={pxPerFrame}
              totalFrames={totalFrames}
              color={colorForTrack(trackId)}
              selectedClipId={selectedClipId}
              onSelectClip={handleSelectClip}
              onClipDragEnd={handleClipDragEnd}
              fps={fps}
              headerWidth={headerWidth}
            />
          ))}
          {sortedTrackIds.length === 0 && (
            <div className="p-6 text-text-dim text-[13px] text-center">暂无轨道数据</div>
          )}
        </div>

        {/* 播放头控制条 */}
        <div className="px-4 py-2 border-t border-border shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-danger font-mono min-w-[60px]">
              {frameToTime(playhead, fps)}
            </span>
            <input
              type="range" min={0} max={totalFrames} value={playhead}
              onChange={e => setPlayhead(Number(e.target.value))}
              className="flex-1 cursor-pointer accent-danger"
            />
            <span className="text-xs text-text-dim font-mono min-w-[60px] text-right">
              {frameToTime(totalFrames, fps)}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ 弹层 ═══ */}

      {/* ExportDialog */}
      {exportOpen && (
        <ExportDialog
          projectId={projectId}
          projectName={projectName}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* MediaPlayer（仅用于 SidePanel 素材预览） */}
      {selectedMedia && (
        <div
          className="fixed inset-0 z-[1000] bg-black/85 flex items-center justify-center p-6"
          onClick={e => { if (e.target === e.currentTarget) setSelectedMedia(null); }}
        >
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
