// InspectorPanel.tsx — 右侧属性面板
// 无选中 → 项目概览；有选中 → Clip 属性编辑（snake_case 字段，Tailwind 样式）

import { useState, useEffect, useRef, useCallback } from "react";
import { api, type Clip, type Transition } from "../api/client";
import { TRANSITION_ICONS } from "./LibraryPanel";

interface InspectorPanelProps {
  projectId: string;
  clip: Clip | null;
  fps: number;
  totalFrames: number;
  clipCount: number;
  transitionCount: number;
  projectName: string;
  onClipUpdated?: () => void;
  onDeselect?: () => void;
  width?: number;
  onResize?: (width: number) => void;
  // ── 转场属性 ──
  transition?: Transition | null;
  fromClipName?: string;
  toClipName?: string;
  onUpdateTransition?: (transitionId: string, body: { type?: string; duration_frames?: number }) => void;
  onDeleteTransition?: (transitionId: string) => void;
  onDeselectTransition?: () => void;
}

function frameToTime(f: number, fps: number): string {
  const s = Math.floor(f / fps);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const KIND_BADGE: Record<string, string> = {
  video: "bg-clip-video/30 text-clip-video",
  audio: "bg-clip-audio/30 text-clip-audio",
};

const TRACK_DOT: Record<string, string> = {
  V1: "bg-track-video", V2: "bg-track-video", V3: "bg-track-video", V4: "bg-track-video",
  A1: "bg-track-audio-a1", A2: "bg-track-audio-a2", A3: "bg-track-audio-a2",
};

const inputCls = "bg-inset border border-border rounded px-2 py-1 text-xs text-text focus:border-accent outline-none";

export default function InspectorPanel({
  projectId, clip, fps, totalFrames, clipCount, transitionCount, projectName,
  onClipUpdated, onDeselect, width = 280, onResize,
  transition, fromClipName, toClipName,
  onUpdateTransition, onDeleteTransition, onDeselectTransition,
}: InspectorPanelProps) {
  const [name, setName] = useState("");
  const [startFrame, setStartFrame] = useState(0);
  const [durationFrames, setDurationFrames] = useState(0);
  const [srcInFrame, setSrcInFrame] = useState(0);
  const [propsText, setPropsText] = useState("");
  const [propsError, setPropsError] = useState(false);
  const [error, setError] = useState("");
  const [trType, setTrType] = useState("");
  const [trDuration, setTrDuration] = useState(0);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onResize) return;
    e.preventDefault();
    setResizing(true);
    resizeRef.current = { startX: e.clientX, startW: width };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      const st = resizeRef.current;
      if (!st) return;
      const dx = st.startX - ev.clientX; // 向左拖 = 变宽
      const newW = Math.max(200, Math.min(450, st.startW + dx));
      onResize(newW);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizing(false);
      resizeRef.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [onResize, width]);

  useEffect(() => {
    if (!transition) return;
    setTrType(transition.type);
    setTrDuration(transition.duration_frames);
  }, [transition?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clip) return;
    setName(clip.name);
    setStartFrame(clip.start_frame);
    setDurationFrames(clip.duration_frames);
    setSrcInFrame(clip.src_in_frame);
    setError("");
    setPropsError(false);
    try {
      const parsed = JSON.parse(clip.props || "{}");
      setPropsText(JSON.stringify(parsed, null, 2));
    } catch {
      setPropsText(clip.props || "{}");
    }
  }, [clip?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { JSON.parse(propsText); setPropsError(false); }
    catch { setPropsError(true); }
  }, [propsText]);

  const commitName = async () => {
    if (!clip || name === clip.name) return;
    try {
      await api.updateClip(projectId, clip.id, { name });
      setError("");
      onClipUpdated?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const commitTiming = async (field: "start_frame" | "duration_frames" | "src_in_frame", value: number) => {
    if (!clip) return;
    try {
      await api.updateClipTiming(projectId, clip.id, { [field]: value });
      setError("");
      onClipUpdated?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  const applyProps = async () => {
    if (!clip || propsError) return;
    try {
      const parsed = JSON.parse(propsText);
      await api.updateClipProps(projectId, clip.id, parsed);
      setError("");
      onClipUpdated?.();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  // ── 选中转场 → 转场属性（优先于 clip 视图）──
  if (transition) {
    const typeKey = Object.keys(TRANSITION_ICONS).find(k => k.toLowerCase() === trType.toLowerCase());
    return (
      <div style={{ width, position: "relative" }} className="shrink-0 border-l border-border bg-panel flex flex-col overflow-y-auto">
        {/* R7: 4px 拖拽条 */}
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
            cursor: "col-resize", zIndex: 20,
            background: resizing ? "#f59e0b" : "transparent",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!resizing) e.currentTarget.style.background = "#f59e0b60"; }}
          onMouseLeave={e => { if (!resizing) e.currentTarget.style.background = "transparent"; }}
        />
        {/* 标题栏 */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <span className="text-sm shrink-0">{(typeKey && TRANSITION_ICONS[typeKey]) || "🔀"}</span>
          <span className="text-sm font-semibold text-text truncate flex-1">转场</span>
          <button onClick={onDeselectTransition} className="text-text-dim hover:text-text text-sm shrink-0">✕</button>
        </div>

        {/* 类型下拉（立即生效） */}
        <div className="px-4 py-2 flex items-center justify-between gap-3">
          <label className="text-xs text-text-dim w-16 shrink-0">类型</label>
          <select
            className={`${inputCls} flex-1`}
            value={typeKey ?? ""}
            onChange={e => {
              setTrType(e.target.value);
              onUpdateTransition?.(transition.id, { type: e.target.value });
            }}
          >
            {Object.keys(TRANSITION_ICONS).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* 时长（帧，blur 提交） */}
        <div className="px-4 py-2 flex items-center justify-between gap-3">
          <label className="text-xs text-text-dim w-16 shrink-0">时长(帧)</label>
          <input
            type="number"
            min={1}
            className={`${inputCls} w-20`}
            value={trDuration}
            onChange={e => setTrDuration(Number(e.target.value))}
            onBlur={() => {
              if (trDuration >= 1 && trDuration !== transition.duration_frames) {
                onUpdateTransition?.(transition.id, { duration_frames: trDuration });
              }
            }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          />
        </div>

        {/* from → to 片段名（只读） */}
        <div className="px-4 py-2 border-t border-border text-xs space-y-1.5">
          <div className="flex justify-between gap-2">
            <span className="text-text-dim shrink-0">入片段</span>
            <span className="text-text font-medium truncate">{fromClipName ?? transition.from_item_id.slice(0, 8)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-text-dim shrink-0">出片段</span>
            <span className="text-text font-medium truncate">{toClipName ?? transition.to_item_id.slice(0, 8)}</span>
          </div>
        </div>

        {/* 删除 */}
        <div className="px-4 py-3 border-t border-border mt-auto">
          <button
            onClick={() => {
              if (window.confirm(`删除 ${transition.type} 转场？`)) {
                onDeleteTransition?.(transition.id);
              }
            }}
            className="w-full py-1.5 rounded text-xs font-medium border border-danger/40 text-danger hover:bg-danger/10"
          >
            🗑️ 删除转场
          </button>
        </div>
      </div>
    );
  }

  // ── 无选中 → 项目概览 ──
  if (!clip) {
    return (
      <div style={{ width, position: "relative" }} className="shrink-0 border-l border-border bg-panel flex flex-col overflow-y-auto">
        {/* R7: 4px 拖拽条 */}
        <div
          onMouseDown={handleResizeMouseDown}
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
            cursor: "col-resize", zIndex: 20,
            background: resizing ? "#f59e0b" : "transparent",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!resizing) e.currentTarget.style.background = "#f59e0b60"; }}
          onMouseLeave={e => { if (!resizing) e.currentTarget.style.background = "transparent"; }}
        />
        <div className="px-4 py-3 border-b border-border text-xs font-semibold text-text-dim uppercase tracking-wider">
          项目信息
        </div>
        <div className="px-4 py-2 flex justify-between text-xs">
          <span className="text-text-dim">项目名</span>
          <span className="text-text font-medium">{projectName}</span>
        </div>
        <div className="px-4 py-2 flex justify-between text-xs">
          <span className="text-text-dim">帧率</span>
          <span className="text-text font-medium tabular-nums">{fps} fps</span>
        </div>
        <div className="px-4 py-2 flex justify-between text-xs">
          <span className="text-text-dim">片段数</span>
          <span className="text-text font-medium tabular-nums">{clipCount}</span>
        </div>
        <div className="px-4 py-2 flex justify-between text-xs">
          <span className="text-text-dim">转场数</span>
          <span className="text-text font-medium tabular-nums">{transitionCount}</span>
        </div>
        <div className="px-4 py-2 flex justify-between text-xs">
          <span className="text-text-dim">总时长</span>
          <span className="text-text font-medium tabular-nums">{frameToTime(totalFrames, fps)}</span>
        </div>
      </div>
    );
  }

  // ── 有选中 → Clip 属性编辑 ──
  const badgeCls = KIND_BADGE[clip.kind] ?? "bg-panel-alt text-text-dim";
  const dotCls = TRACK_DOT[clip.track] ?? "bg-text-dim";

  return (
    <div style={{ width, position: "relative" }} className="shrink-0 border-l border-border bg-panel flex flex-col overflow-y-auto">
      {/* R7: 4px 拖拽条 */}
      <div
        onMouseDown={handleResizeMouseDown}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
          cursor: "col-resize", zIndex: 20,
          background: resizing ? "#f59e0b" : "transparent",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (!resizing) e.currentTarget.style.background = "#f59e0b60"; }}
        onMouseLeave={e => { if (!resizing) e.currentTarget.style.background = "transparent"; }}
      />
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <span className="text-sm font-semibold text-text truncate flex-1">{clip.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeCls}`}>{clip.kind}</span>
        <button onClick={onDeselect} className="text-text-dim hover:text-text text-sm shrink-0">✕</button>
      </div>

      {error && (
        <div className="bg-danger/10 text-danger text-xs px-3 py-2 rounded mx-4 mt-2">{error}</div>
      )}

      {/* 可编辑字段 */}
      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <label className="text-xs text-text-dim w-16 shrink-0">名称</label>
        <input
          className={`${inputCls} flex-1`}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <label className="text-xs text-text-dim w-16 shrink-0">起始帧</label>
        <input
          type="number"
          className={`${inputCls} w-20`}
          value={startFrame}
          onChange={e => setStartFrame(Number(e.target.value))}
          onBlur={() => commitTiming("start_frame", startFrame)}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <label className="text-xs text-text-dim w-16 shrink-0">时长(帧)</label>
        <input
          type="number"
          className={`${inputCls} w-20`}
          value={durationFrames}
          onChange={e => setDurationFrames(Number(e.target.value))}
          onBlur={() => commitTiming("duration_frames", durationFrames)}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      <div className="px-4 py-2 flex items-center justify-between gap-3">
        <label className="text-xs text-text-dim w-16 shrink-0">素材入点</label>
        <input
          type="number"
          className={`${inputCls} w-20`}
          value={srcInFrame}
          onChange={e => setSrcInFrame(Number(e.target.value))}
          onBlur={() => commitTiming("src_in_frame", srcInFrame)}
          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        />
      </div>

      {/* Props 区域 */}
      <div className="px-4 py-3 border-t border-border">
        <div className="text-xs text-text-dim mb-2">Props (JSON)</div>
        <textarea
          className="w-full h-28 bg-inset border border-border rounded p-2 font-mono text-[11px] text-text-muted resize-none focus:border-accent outline-none"
          value={propsText}
          onChange={e => setPropsText(e.target.value)}
          spellCheck={false}
        />
        {propsError && (
          <div className="text-[10px] text-danger mt-1">JSON 格式无效</div>
        )}
        <button
          onClick={applyProps}
          disabled={propsError}
          className="w-full mt-2 py-1.5 rounded text-xs font-medium bg-accent text-on-accent hover:bg-accent-deep disabled:opacity-40 disabled:cursor-not-allowed"
        >
          应用
        </button>
      </div>

      {/* 只读信息 */}
      <div className="px-4 py-2 border-t border-border text-xs space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-text-dim">轨道</span>
          <span className={`w-2 h-2 rounded-full inline-block ${dotCls}`} />
          <span className="text-text font-medium">{clip.track}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-dim">创建时间</span>
          <span className="text-text font-medium">
            {clip.created_at ? new Date(clip.created_at).toLocaleString("zh-CN") : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
