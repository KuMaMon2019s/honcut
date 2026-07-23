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
import ContextMenu from "./components/ContextMenu";
import { type ClipData } from "./components/ClipBlock";
import { useProject, useClips, useTransitions, useTimelines } from "./api/hooks";
import { api, type Clip as ApiClip, type Transition as ApiTransition } from "./api/client";
import { useUndo } from "./hooks/useUndo";
import { useHotkeys } from "./hooks/useHotkeys";

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

// 拖拽 undo 条目：记录片段移动前后的位置
interface TimingUndoEntry {
  type: "timing";
  clipId: string;
  before: { start_frame: number; track: string };
  after: { start_frame: number; track: string };
}

// ── 组件 ──

export default function TimelineViewer({ projectId, onBack }: { projectId: string; onBack?: () => void }) {
  // ── 数据层：hooks ──
  const { data: project, loading: projectLoading, error: projectError } = useProject(projectId);
  const { data: rawClips, loading: clipsLoading, reload: reloadClips } = useClips(projectId);
  const { data: rawTransitions, loading: transitionsLoading, reload: reloadTransitions } = useTransitions(projectId);
  const { data: timelines } = useTimelines(projectId);

  // ── UI 状态 ──
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playDirection, setPlayDirection] = useState<1 | -1>(1);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<{ src: string; kind: "video" | "audio"; name: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);
  const [toast, setToast] = useState<string | null>(null);

  // ── 右键菜单状态 ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; clip: ClipData } | null>(null);

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
    setSelectedTransitionId(null);
  }, []);

  const handleSelectTransition = useCallback((t: ApiTransition) => {
    setSelectedTransitionId(prev => prev === t.id ? null : t.id);
    setSelectedClipId(null);
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

  // ── Toast 提示 ──
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1500);
  }, []);

  // 拖拽操作的 undo 栈（useUndo 只做快照式 UI undo，这里记录 before/after 以便写回 API）
  const timingUndoStack = useRef<TimingUndoEntry[]>([]);

  const handleUndo = useCallback(() => {
    // 优先撤销最近一次拖拽：把 before 位置写回 API
    const entry = timingUndoStack.current.pop();
    if (entry) {
      api.updateClip(projectId, entry.clipId, { start_frame: entry.before.start_frame, track: entry.before.track })
        .then(() => { showToast("↩ 已撤销拖拽"); reloadClips(); })
        .catch(e => showToast("❌ 撤销失败: " + (e as Error).message));
      return;
    }
    undoState.undo();
    // undo 后需要把快照写回 API（逐 clip 更新 timing）
    // 简化实现：undo 后 reload，让 UI 反映 API 状态
    // 完整实现需要 diff 快照并逐条 PATCH — 当前阶段先做 UI 级 undo
  }, [projectId, reloadClips, showToast, undoState]);

  const handleRedo = useCallback(() => {
    undoState.redo();
  }, [undoState]);

  // ── C 分割：在播放头位置分割选中 clip ──
  const handleSplit = useCallback(async () => {
    if (!selectedClipId) {
      showToast("⚠️ 请先选中一个片段再按 C 分割");
      return;
    }
    const clip = clips.find(c => c.id === selectedClipId);
    if (!clip) return;
    // 播放头必须在片段范围内
    if (playhead <= clip.start_frame || playhead >= clip.start_frame + clip.duration_frames) {
      showToast("⚠️ 播放头不在选中片段范围内");
      return;
    }
    try {
      const result = await api.splitClip(projectId, selectedClipId, { at_frame: playhead });
      if (result.success) {
        showToast(`✂️ 已分割 → ${result.split_id.slice(0, 8)}…`);
        reloadClips();
      }
    } catch (e) {
      showToast("❌ 分割失败: " + (e as Error).message);
    }
  }, [selectedClipId, clips, playhead, projectId, reloadClips, showToast]);

  // ── Delete 删除选中片段 ──
  const handleDelete = useCallback(async () => {
    if (!selectedClipId) return;
    try {
      await api.deleteClip(projectId, selectedClipId);
      showToast("🗑️ 已删除片段");
      setSelectedClipId(null);
      reloadClips();
    } catch (e) {
      showToast("❌ 删除失败: " + (e as Error).message);
    }
  }, [selectedClipId, projectId, reloadClips, showToast]);

  // ── Ctrl+D 复制选中片段（追加到轨道末尾）──
  const handleDuplicate = useCallback(async () => {
    if (!selectedClipId) {
      showToast("⚠️ 请先选中一个片段再复制");
      return;
    }
    try {
      await api.duplicateClip(projectId, selectedClipId);
      showToast("📋 已复制片段");
      reloadClips();
    } catch (e) {
      showToast("❌ 复制失败: " + (e as Error).message);
    }
  }, [selectedClipId, projectId, reloadClips, showToast]);

  // ── 右键菜单 ──
  const handleContextMenu = useCallback((e: React.MouseEvent, clip: ClipData) => {
    e.preventDefault();
    setSelectedClipId(clip.id);
    setContextMenu({ x: e.clientX, y: e.clientY, clip });
  }, []);

  // 添加转场：找同轨道、起始帧 ≥ 当前片段结束帧的最近片段
  const handleAddTransition = useCallback(async (type: string) => {
    if (!contextMenu) return;
    const clip = contextMenu.clip;
    const sameTrack = clipDataItems
      .filter(c => c.track === clip.track && c.id !== clip.id)
      .sort((a, b) => a.startFrame - b.startFrame);
    const nextClip = sameTrack.find(c => c.startFrame >= clip.startFrame + clip.durationInFrames);
    if (!nextClip) {
      showToast("⚠️ 同轨道没有后续片段，无法添加转场");
      return;
    }
    try {
      await api.createTransition(projectId, {
        from_item_id: clip.id,
        to_item_id: nextClip.id,
        type: type.toLowerCase(),
        duration_frames: 24,
      });
      showToast(`🔗 已添加 ${type} 转场`);
      reloadTransitions();
    } catch (e) {
      showToast("❌ 添加转场失败: " + (e as Error).message);
    }
  }, [contextMenu, clipDataItems, projectId, reloadTransitions, showToast]);

  // ── 全局快捷键（useHotkeys 统一管理）──
  useHotkeys({
    onPlayPause: () => {
      if (playhead >= totalFrames - 1) {
        setPlayhead(0);
        setPlayDirection(1);
        setPlaying(true);
      } else {
        setPlaying(p => !p);
      }
    },
    onPause: () => {
      setPlaying(false);
      showToast("⏸ K — 暂停");
    },
    onStepBack: () => {
      // J: 反向穿梭（按一次反向播放，再按加速）
      if (playing && playDirection === -1) {
        showToast("⏪ JJ — 加速后退");
        // 加速：直接跳 fps 帧
        setPlaying(false);
        setPlayhead(h => Math.max(0, h - fps));
      } else {
        setPlayDirection(-1);
        setPlaying(true);
        showToast("◀ J — 反向播放");
      }
    },
    onStepForward: () => {
      // L: 正向穿梭（按一次正向播放，再按加速）
      if (playing && playDirection === 1) {
        showToast("⏩ LL — 加速前进");
        setPlaying(false);
        setPlayhead(h => Math.min(totalFrames - 1, h + fps));
      } else {
        setPlayDirection(1);
        setPlaying(true);
        showToast("▶ L — 正向播放");
      }
    },
    onSplit: handleSplit,
    onDelete: handleDelete,
    onDuplicate: handleDuplicate,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onFrameBack: () => {
      setPlaying(false);
      setPlayhead(h => Math.max(0, h - 1));
    },
    onFrameForward: () => {
      setPlaying(false);
      setPlayhead(h => Math.min(totalFrames - 1, h + 1));
    },
  });

  // ── 片段拖拽：跨轨目标检测 ──
  const [dragInfo, setDragInfo] = useState<{ clipId: string; targetTrack: string } | null>(null);
  const dragTargetTrackRef = useRef<string | null>(null);

  // 拖拽中鼠标移动 → 计算目标轨道（仅同类型轨道：video→video, audio→audio）
  const handleClipDragMove = useCallback((clip: ClipData, _clientX: number, clientY: number) => {
    const sameTypeTracks = sortedTrackIds.filter(t => t[0] === clip.track[0]);
    let target: string | null = null;
    // 鼠标落在某个同类型轨道的 lane 范围内 → 该轨道
    for (const tid of sameTypeTracks) {
      const el = document.querySelector(`[data-track-id="${tid}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY >= r.top && clientY <= r.bottom) { target = tid; break; }
    }
    // 超出所有 lane 范围 → 按垂直方向取相邻同类型轨道
    if (!target) {
      const origEl = document.querySelector(`[data-track-id="${clip.track}"]`);
      const origRect = origEl?.getBoundingClientRect();
      if (origRect) {
        const dir = clientY < origRect.top ? -1 : clientY > origRect.bottom ? 1 : 0;
        const idx = sameTypeTracks.indexOf(clip.track);
        if (dir !== 0 && idx >= 0 && sameTypeTracks[idx + dir]) {
          target = sameTypeTracks[idx + dir];
        }
      }
    }
    const finalTarget = target ?? clip.track;
    dragTargetTrackRef.current = finalTarget;
    setDragInfo(prev => (prev && prev.clipId === clip.id && prev.targetTrack === finalTarget)
      ? prev
      : { clipId: clip.id, targetTrack: finalTarget });
  }, [sortedTrackIds]);

  // 拖拽片段落点 → 碰撞检测 + 更新 startFrame/track + undo 记录
  const handleClipDragEnd = useCallback(async (clipId: string, newStartFrame: number) => {
    const targetTrack = dragTargetTrackRef.current;
    dragTargetTrackRef.current = null;
    setDragInfo(null);

    const clip = clipDataItems.find(c => c.id === clipId);
    if (!clip) return;
    const newTrack = targetTrack ?? clip.track;
    if (newStartFrame === clip.startFrame && newTrack === clip.track) return; // 无实际移动

    // 碰撞检测：与目标轨道上的其他片段重叠 → 还原（不调 API）
    const newEnd = newStartFrame + clip.durationInFrames;
    const overlap = clipDataItems.find(c =>
      c.id !== clipId && c.track === newTrack &&
      newStartFrame < c.startFrame + c.durationInFrames && newEnd > c.startFrame,
    );
    if (overlap) {
      showToast(`Cannot drop here - overlaps with ${overlap.name}`);
      return;
    }

    try {
      if (newTrack !== clip.track) {
        await api.updateClip(projectId, clipId, { start_frame: newStartFrame, track: newTrack });
      } else {
        await api.updateClipTiming(projectId, clipId, { start_frame: newStartFrame });
      }
      timingUndoStack.current.push({
        type: "timing",
        clipId,
        before: { start_frame: clip.startFrame, track: clip.track },
        after: { start_frame: newStartFrame, track: newTrack },
      });
      reloadClips();
    } catch (e) {
      console.error("拖拽更新失败:", e);
    }
  }, [clipDataItems, projectId, reloadClips, showToast]);

  // 拖拽转场到轨道 → 创建转场
  const handleTransitionDrop = useCallback(async (transitionType: string, fromClipId: string, toClipId: string) => {
    try {
      await api.createTransition(projectId, {
        from_item_id: fromClipId,
        to_item_id: toClipId,
        type: transitionType,
        duration_frames: 24,
      });
      showToast(`🔗 已添加 ${transitionType} 转场`);
      reloadTransitions();
    } catch (e) {
      showToast("❌ 添加转场失败: " + (e as Error).message);
    }
  }, [projectId, reloadTransitions, showToast]);

  // 跨轨拖拽高亮：目标轨道（排除片段原轨道）
  const draggedClip = dragInfo ? clipDataItems.find(c => c.id === dragInfo.clipId) : undefined;
  const dropTargetTrack = dragInfo && draggedClip && dragInfo.targetTrack !== draggedClip.track
    ? dragInfo.targetTrack
    : null;

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
          playing={playing}
          playDirection={playDirection}
          onSelectClip={(c) => setSelectedClipId(c?.id ?? null)}
          onPlayheadChange={setPlayhead}
          onPlayingChange={setPlaying}
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
      <div
        className="h-[220px] shrink-0 border-t border-border flex flex-col overflow-hidden"
        onClick={() => setContextMenu(null)}
      >
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
              transitions={transitions}
              pxPerFrame={pxPerFrame}
              totalFrames={totalFrames}
              color={colorForTrack(trackId)}
              selectedClipId={selectedClipId}
              selectedTransitionId={selectedTransitionId}
              onSelectClip={handleSelectClip}
              onSelectTransition={handleSelectTransition}
              onClipDragEnd={handleClipDragEnd}
              onClipDragMove={handleClipDragMove}
              onTransitionDrop={handleTransitionDrop}
              onContextMenu={handleContextMenu}
              dropTarget={dropTargetTrack === trackId}
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

      {/* 片段右键菜单 */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          clipId={contextMenu.clip.id}
          clipName={contextMenu.clip.name}
          canSplit={playhead > contextMenu.clip.startFrame && playhead < contextMenu.clip.startFrame + contextMenu.clip.durationInFrames}
          canAddTransition={clipDataItems.some(c => c.track === contextMenu.clip.track && c.id !== contextMenu.clip.id && c.startFrame >= contextMenu.clip.startFrame + contextMenu.clip.durationInFrames)}
          onSplit={handleSplit}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onAddTransition={handleAddTransition}
          onClose={() => setContextMenu(null)}
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

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] bg-black/85 text-white text-sm px-4 py-2 rounded-lg shadow-lg pointer-events-none animate-pulse">
          {toast}
        </div>
      )}

      {/* 快捷键提示条 */}
      <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-[1500] flex items-center gap-3 bg-black/60 text-white/50 text-[10px] px-3 py-1 rounded-full pointer-events-none">
        <span>Space 播放/暂停</span>
        <span>J 后退</span>
        <span>K 暂停</span>
        <span>L 前进</span>
        <span>C 分割</span>
        <span>⌘D 复制</span>
        <span>⌘Z 撤销</span>
        <span>Del 删除</span>
      </div>
    </div>
  );
}
