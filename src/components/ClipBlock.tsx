// ClipBlock.tsx — 时间线片段块
// 显示在轨道内的单个片段，支持选中/悬停/tooltip/拖拽移动/修剪手柄/视频缩略图/吸附

import { useRef, useCallback, useState } from "react";
import ThumbnailStrip from "./ThumbnailStrip";
import { snapClipStart } from "../utils/snapping";

export interface ClipData {
  id: string;
  name: string;
  kind: string;
  track: string;
  startFrame: number;
  durationInFrames: number;
  srcInFrame: number;
  src: string;
  props?: Record<string, any>;
}

interface ClipBlockProps {
  clip: ClipData;
  pxPerFrame: number;
  color: string;
  selected: boolean;
  onSelect: (clip: ClipData) => void;
  onDragEnd?: (clipId: string, newStartFrame: number) => void;
  onDragMove?: (clip: ClipData, clientX: number, clientY: number, projectedFrame: number) => void;
  onContextMenu?: (e: React.MouseEvent, clip: ClipData) => void;
  onTrimEnd?: (clipId: string, newSrcInFrame: number, newDurationFrames: number, newStartFrame: number) => void;
  fps: number;
  /** P6: 吸附 */
  snapEnabled?: boolean;
  snapPoints?: number[];
  onSnapLine?: (frame: number | null) => void;
}

function frameToTime(f: number, fps: number): string {
  const s = Math.floor(f / fps);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const KIND_ICONS: Record<string, string> = {
  video: "🎬",
  audio: "🎵",
  image: "🖼️",
  text: "📝",
};

type TrimSide = "left" | "right";

export default function ClipBlock({ clip, pxPerFrame, color, selected, onSelect, onDragEnd, onDragMove, onContextMenu, onTrimEnd, fps, snapEnabled, snapPoints, onSnapLine }: ClipBlockProps) {
  const width = clip.durationInFrames * pxPerFrame;
  const left = clip.startFrame * pxPerFrame;
  const icon = KIND_ICONS[clip.kind] ?? "📦";
  const showLabel = width > 40;
  const isVideo = clip.kind === "video" && !!clip.src;

  // ── 悬停状态 ──
  const [hovered, setHovered] = useState(false);

  // ── 拖拽移动 ──
  const dragState = useRef<{ startX: number; origFrame: number; dragging: boolean } | null>(null);
  const [drag, setDrag] = useState<{ offsetX: number; mouseX: number; mouseY: number } | null>(null);

  // ── 修剪拖拽 ──
  const trimState = useRef<{
    side: TrimSide;
    startX: number;
    origSrcIn: number;
    origDuration: number;
    origStart: number;
  } | null>(null);
  const [trim, setTrim] = useState<{
    side: TrimSide;
    srcIn: number;
    duration: number;
    start: number;
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const cbRef = useRef({ onDragEnd, onDragMove, onTrimEnd, onSnapLine });
  cbRef.current = { onDragEnd, onDragMove, onTrimEnd, onSnapLine };

  const snapRef = useRef({ snapEnabled, snapPoints });
  snapRef.current = { snapEnabled, snapPoints };

  // ── 修剪手柄 mousedown ──
  const handleTrimMouseDown = useCallback((e: React.MouseEvent, side: TrimSide) => {
    e.preventDefault();
    e.stopPropagation(); // 不触发整块拖拽
    onSelect(clip);

    trimState.current = {
      side,
      startX: e.clientX,
      origSrcIn: clip.srcInFrame,
      origDuration: clip.durationInFrames,
      origStart: clip.startFrame,
    };

    const handleMouseMove = (ev: MouseEvent) => {
      const st = trimState.current;
      if (!st) return;
      const deltaFrames = Math.round((ev.clientX - st.startX) / pxPerFrame);

      let newSrcIn = st.origSrcIn;
      let newDuration = st.origDuration;
      let newStart = st.origStart;

      if (st.side === "left") {
        // 左手柄：调整 srcInFrame + startFrame，duration 反向变化
        const maxTrim = st.origDuration - 1; // 至少保留 1 帧
        const clamped = Math.max(-st.origSrcIn, Math.min(deltaFrames, maxTrim));
        newSrcIn = st.origSrcIn + clamped;
        newStart = st.origStart + clamped;
        newDuration = st.origDuration - clamped;
      } else {
        // 右手柄：只调整 duration
        newDuration = Math.max(1, st.origDuration + deltaFrames);
      }

      setTrim({
        side: st.side,
        srcIn: newSrcIn,
        duration: newDuration,
        start: newStart,
        mouseX: ev.clientX,
        mouseY: ev.clientY,
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      const st = trimState.current;
      trimState.current = null;

      setTrim(prev => {
        if (prev && st) {
          const changed = prev.srcIn !== st.origSrcIn || prev.duration !== st.origDuration || prev.start !== st.origStart;
          if (changed) {
            cbRef.current.onTrimEnd?.(clip.id, prev.srcIn, prev.duration, prev.start);
          }
        }
        return null;
      });
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clip, onSelect, pxPerFrame]);

  // ── 整块拖拽移动 ──
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(clip);
    dragState.current = { startX: e.clientX, origFrame: clip.startFrame, dragging: false };

    const handleMouseMove = (ev: MouseEvent) => {
      const st = dragState.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      if (!st.dragging && Math.abs(dx) > 3) {
        st.dragging = true;
        document.body.style.cursor = "grabbing";
      }
      if (st.dragging) {
        const { snapEnabled: se, snapPoints: sp } = snapRef.current;
        let visualDx = dx;
        if (se && sp && sp.length > 0) {
          const rawFrame = st.origFrame + Math.round(dx / pxPerFrame);
          const threshold = 8 / pxPerFrame;
          const result = snapClipStart(Math.max(0, rawFrame), clip.durationInFrames, sp, threshold);
          if (result.snapped) {
            visualDx = (result.frame - st.origFrame) * pxPerFrame;
            cbRef.current.onSnapLine?.(result.snapTarget);
          } else {
            cbRef.current.onSnapLine?.(null);
          }
        }
        setDrag({ offsetX: visualDx, mouseX: ev.clientX, mouseY: ev.clientY });
        const projectedFrame = Math.max(0, st.origFrame + Math.round(visualDx / pxPerFrame));
        cbRef.current.onDragMove?.(clip, ev.clientX, ev.clientY, projectedFrame);
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      const st = dragState.current;
      dragState.current = null;
      setDrag(null);
      document.body.style.cursor = "";
      cbRef.current.onSnapLine?.(null);
      if (!st || !st.dragging) return;
      const { snapEnabled: se, snapPoints: sp } = snapRef.current;
      let newFrame = Math.max(0, st.origFrame + Math.round((ev.clientX - st.startX) / pxPerFrame));
      if (se && sp && sp.length > 0) {
        const threshold = 8 / pxPerFrame;
        const result = snapClipStart(newFrame, clip.durationInFrames, sp, threshold);
        newFrame = Math.max(0, result.frame);
      }
      cbRef.current.onDragEnd?.(clip.id, newFrame);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clip, onSelect, pxPerFrame]);

  const dragFrame = drag ? Math.max(0, clip.startFrame + Math.round(drag.offsetX / pxPerFrame)) : null;

  // 修剪中的显示值
  const trimSrcIn = trim ? trim.srcIn : clip.srcInFrame;
  const trimDuration = trim ? trim.duration : clip.durationInFrames;
  const trimStart = trim ? trim.start : clip.startFrame;
  const isTrimming = trim !== null;

  // 修剪时 clip 宽度/位置实时变化
  const displayWidth = isTrimming ? trimDuration * pxPerFrame : width;
  const displayLeft = isTrimming ? trimStart * pxPerFrame : left;

  const showHandles = selected || hovered;

  return (
    <>
    <div
      title={`${clip.name}\n${frameToTime(clip.startFrame, fps)} → ${frameToTime(clip.startFrame + clip.durationInFrames, fps)}\n${clip.durationInFrames}f · ${clip.kind}`}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, clip);
      }}
      style={{
        position: "absolute",
        left: displayLeft,
        width: Math.max(displayWidth, 4),
        top: 3,
        bottom: 3,
        background: selected ? color + "60" : color + "30",
        border: isTrimming
          ? `2px dashed ${color}`
          : selected ? `2px solid ${color}` : `1px solid ${color}80`,
        borderLeft: isTrimming ? `2px dashed ${color}` : `3px solid ${color}`,
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        paddingLeft: 6,
        paddingRight: 4,
        cursor: "grab",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        boxSizing: "border-box",
        transform: drag ? `translateX(${drag.offsetX}px)` : undefined,
        opacity: drag ? 0.7 : 1,
        transition: isTrimming ? "none" : "background 0.15s, border-color 0.15s",
        zIndex: drag ? 10 : selected ? 5 : 1,
        boxShadow: drag ? `0 4px 14px ${color}90` : selected ? `0 0 8px ${color}40` : "none",
        userSelect: "none",
      }}
    >
      {/* 视频缩略图胶片条 */}
      {isVideo && (
        <ThumbnailStrip
          src={clip.src}
          durationInFrames={clip.durationInFrames}
          fps={fps}
          width={Math.max(displayWidth, 4)}
        />
      )}

      {/* 音频波形占位（竖条纹模拟） */}
      {clip.kind === "audio" && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: `repeating-linear-gradient(90deg, ${color}50 0px, ${color}50 2px, transparent 2px, transparent 5px)`,
          opacity: 0.6,
          pointerEvents: "none",
          borderRadius: "inherit",
        }} />
      )}

      {/* 缩略图上的渐变遮罩，保证文字可读 */}
      {isVideo && (
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.05) 100%)",
          pointerEvents: "none",
          borderRadius: "inherit",
        }} />
      )}

      {/* 文字标签 */}
      {showLabel && (
        <span style={{ fontSize: 10, marginRight: 3, flexShrink: 0, position: "relative", zIndex: 2 }}>{icon}</span>
      )}
      {showLabel && (
        <span style={{
          fontSize: 11,
          color: selected ? "#fff" : "#ccc",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontWeight: selected ? 600 : 400,
          position: "relative",
          zIndex: 2,
        }}>
          {clip.name}
        </span>
      )}

      {/* ── 左手柄 ── */}
      {showHandles && (
        <div
          onMouseDown={(e) => handleTrimMouseDown(e, "left")}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 7,
            cursor: "col-resize",
            background: trim?.side === "left" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.12)",
            borderRadius: "4px 0 0 4px",
            zIndex: 20,
            transition: "background 0.1s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.35)"; }}
          onMouseLeave={(e) => { if (trim?.side !== "left") (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.12)"; }}
        >
          <div style={{ width: 2, height: 14, background: "rgba(255,255,255,0.6)", borderRadius: 1 }} />
        </div>
      )}

      {/* ── 右手柄 ── */}
      {showHandles && (
        <div
          onMouseDown={(e) => handleTrimMouseDown(e, "right")}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 7,
            cursor: "col-resize",
            background: trim?.side === "right" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.12)",
            borderRadius: "0 4px 4px 0",
            zIndex: 20,
            transition: "background 0.1s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.35)"; }}
          onMouseLeave={(e) => { if (trim?.side !== "right") (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.12)"; }}
        >
          <div style={{ width: 2, height: 14, background: "rgba(255,255,255,0.6)", borderRadius: 1 }} />
        </div>
      )}
    </div>

    {/* 拖拽移动 tooltip */}
    {drag && dragFrame !== null && (
      <div style={{
        position: "fixed",
        left: drag.mouseX + 10,
        top: drag.mouseY - 34,
        background: "rgba(0,0,0,0.85)",
        color: "#fff",
        fontSize: 11,
        fontFamily: "monospace",
        padding: "3px 8px",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 3000,
      }}>
        {dragFrame}f / {frameToTime(dragFrame, fps)}
      </div>
    )}

    {/* 修剪 tooltip */}
    {trim && (
      <div style={{
        position: "fixed",
        left: trim.mouseX + 10,
        top: trim.mouseY - 34,
        background: "rgba(0,0,0,0.9)",
        color: "#4ade80",
        fontSize: 11,
        fontFamily: "monospace",
        padding: "4px 10px",
        borderRadius: 4,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        zIndex: 3000,
        border: "1px solid #4ade8040",
      }}>
        IN: {trimSrcIn}f | DUR: {trimDuration}f | OUT: {trimSrcIn + trimDuration}f
      </div>
    )}
    </>
  );
}
