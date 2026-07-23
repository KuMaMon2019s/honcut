// ClipBlock.tsx — 时间线片段块
// 显示在轨道内的单个片段，支持选中/悬停/tooltip/拖拽移动

import { useRef, useCallback, useState } from "react";

export interface ClipData {
  id: string;
  name: string;
  kind: string;
  track: string;
  startFrame: number;
  durationInFrames: number;
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
  onDragMove?: (clip: ClipData, clientX: number, clientY: number) => void;
  onContextMenu?: (e: React.MouseEvent, clip: ClipData) => void;
  fps: number;
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

export default function ClipBlock({ clip, pxPerFrame, color, selected, onSelect, onDragEnd, onDragMove, onContextMenu, fps }: ClipBlockProps) {
  const width = clip.durationInFrames * pxPerFrame;
  const left = clip.startFrame * pxPerFrame;
  const icon = KIND_ICONS[clip.kind] ?? "📦";
  const showLabel = width > 40;

  // ── 拖拽 ──
  const dragState = useRef<{ startX: number; origFrame: number; dragging: boolean } | null>(null);
  // 实时拖拽反馈：水平偏移 + 鼠标位置（驱动 transform 跟随与时间 tooltip）
  const [drag, setDrag] = useState<{ offsetX: number; mouseX: number; mouseY: number } | null>(null);

  // 最新回调，避免 document 监听器捕获过期闭包
  const cbRef = useRef({ onDragEnd, onDragMove });
  cbRef.current = { onDragEnd, onDragMove };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 仅左键：右键交给 onContextMenu
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
        setDrag({ offsetX: dx, mouseX: ev.clientX, mouseY: ev.clientY });
        cbRef.current.onDragMove?.(clip, ev.clientX, ev.clientY);
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      const st = dragState.current;
      dragState.current = null;
      setDrag(null);
      document.body.style.cursor = "";
      if (!st || !st.dragging) return;
      const deltaFrames = Math.round((ev.clientX - st.startX) / pxPerFrame); // 整帧吸附
      const newFrame = Math.max(0, st.origFrame + deltaFrames);
      cbRef.current.onDragEnd?.(clip.id, newFrame);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [clip, onSelect, pxPerFrame]);

  // 拖拽中片段的新起始帧（tooltip 显示）
  const dragFrame = drag ? Math.max(0, clip.startFrame + Math.round(drag.offsetX / pxPerFrame)) : null;

  return (
    <>
    <div
      title={`${clip.name}\n${frameToTime(clip.startFrame, fps)} → ${frameToTime(clip.startFrame + clip.durationInFrames, fps)}\n${clip.durationInFrames}f · ${clip.kind}`}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, clip);
      }}
      style={{
        position: "absolute",
        left,
        width: Math.max(width, 4),
        top: 3,
        bottom: 3,
        background: selected ? color + "60" : color + "30",
        border: selected ? `2px solid ${color}` : `1px solid ${color}80`,
        borderLeft: `3px solid ${color}`,
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
        transition: "background 0.15s, border-color 0.15s",
        zIndex: drag ? 10 : selected ? 5 : 1,
        boxShadow: drag ? `0 4px 14px ${color}90` : selected ? `0 0 8px ${color}40` : "none",
        userSelect: "none",
      }}
    >
      {showLabel && (
        <span style={{ fontSize: 10, marginRight: 3, flexShrink: 0 }}>{icon}</span>
      )}
      {showLabel && (
        <span style={{
          fontSize: 11,
          color: selected ? "#fff" : "#ccc",
          overflow: "hidden",
          textOverflow: "ellipsis",
          fontWeight: selected ? 600 : 400,
        }}>
          {clip.name}
        </span>
      )}
    </div>

    {/* 拖拽实时时间 tooltip：{newFrame}f / {mm:ss} */}
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
    </>
  );
}
