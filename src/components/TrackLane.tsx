// TrackLane.tsx — 轨道行组件
// 包含轨道头（名称/类型）+ 内容区（ClipBlock 列表 + TransitionMarker）

import ClipBlock, { type ClipData } from "./ClipBlock";
import TransitionMarker from "./TransitionMarker";
import type { Transition } from "../api/client";

interface TrackLaneProps {
  trackId: string;
  trackName?: string;
  trackKind?: string;
  clips: ClipData[];
  transitions?: Transition[];
  pxPerFrame: number;
  totalFrames: number;
  color: string;
  selectedClipId: string | null;
  selectedTransitionId?: string | null;
  onSelectClip: (clip: ClipData) => void;
  onSelectTransition?: (t: Transition) => void;
  onClipDragEnd?: (clipId: string, newStartFrame: number) => void;
  onClipDragMove?: (clip: ClipData, clientX: number, clientY: number) => void;
  onContextMenu?: (e: React.MouseEvent, clip: ClipData) => void;
  onTransitionDrop?: (transitionType: string, fromClipId: string, toClipId: string) => void;
  /** 跨轨拖拽时：当前片段落入本轨道 → 高亮 */
  dropTarget?: boolean;
  fps: number;
  headerWidth: number;
}

const KIND_BADGES: Record<string, { icon: string; label: string }> = {
  video: { icon: "🎬", label: "视频" },
  audio: { icon: "🎵", label: "音频" },
};

export default function TrackLane({
  trackId, trackName, trackKind, clips, transitions = [], pxPerFrame, totalFrames,
  color, selectedClipId, selectedTransitionId, onSelectClip, onSelectTransition, onClipDragEnd, onClipDragMove, onContextMenu, onTransitionDrop, dropTarget, fps, headerWidth,
}: TrackLaneProps) {
  const badge = KIND_BADGES[trackKind ?? "video"] ?? KIND_BADGES.video;
  const laneWidth = totalFrames * pxPerFrame;

  // 计算转场标记位置：from_item 的结束帧处
  const clipById = new Map(clips.map(c => [c.id, c]));
  const trackTransitions = transitions.filter(t => {
    const from = clipById.get(t.from_item_id);
    return from != null;
  });

  return (
    <div style={{ display: "flex", marginBottom: 2 }}>
      {/* 轨道头 */}
      <div style={{
        width: headerWidth,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "flex-end",
        paddingRight: 8,
        gap: 2,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color,
          letterSpacing: 0.5,
        }}>
          {trackName ?? trackId.toUpperCase()}
        </span>
        <span style={{ fontSize: 9, color: "#666" }}>
          {badge.icon} {badge.label}
        </span>
      </div>

      {/* 轨道内容区 */}
      <div
        data-track-id={trackId}
        style={{
          position: "relative",
          height: 44,
          width: laneWidth,
          minWidth: laneWidth,
          background: dropTarget ? "#1d1d1d" : "#161616",
          borderRadius: 3,
          border: dropTarget ? `1px solid ${color}` : "1px solid #252525",
          transition: "border-color 0.1s, background 0.1s",
        }}
        onDragOver={e => {
          if (e.dataTransfer.types.includes("application/x-transition-type")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={e => {
          const tType = e.dataTransfer.getData("application/x-transition-type");
          if (!tType || !onTransitionDrop) return;
          e.preventDefault();
          // 计算 drop 位置对应的帧，找最近的片段交界处
          const rect = e.currentTarget.getBoundingClientRect();
          const dropX = e.clientX - rect.left;
          const dropFrame = dropX / pxPerFrame;
          // 找 from_item：结束帧最接近 dropFrame 且 ≤ dropFrame 的片段
          const sorted = [...clips].sort((a, b) => a.startFrame - b.startFrame);
          let bestFrom: ClipData | null = null;
          let bestTo: ClipData | null = null;
          let bestDist = Infinity;
          for (let i = 0; i < sorted.length - 1; i++) {
            const endFrame = sorted[i].startFrame + sorted[i].durationInFrames;
            const dist = Math.abs(endFrame - dropFrame);
            if (dist < bestDist) {
              bestDist = dist;
              bestFrom = sorted[i];
              bestTo = sorted[i + 1];
            }
          }
          if (bestFrom && bestTo) {
            onTransitionDrop(tType, bestFrom.id, bestTo.id);
          }
        }}
      >
        {/* 网格线（每秒一条淡线） */}
        {Array.from({ length: Math.ceil(totalFrames / fps) + 1 }, (_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: i * fps * pxPerFrame,
            top: 0, bottom: 0,
            width: 1,
            background: "#222",
            pointerEvents: "none",
          }} />
        ))}

        {/* 片段 */}
        {clips.map(clip => (
          <ClipBlock
            key={clip.id}
            clip={clip}
            pxPerFrame={pxPerFrame}
            color={color}
            selected={clip.id === selectedClipId}
            onSelect={onSelectClip}
            onDragEnd={onClipDragEnd}
            onDragMove={onClipDragMove}
            onContextMenu={onContextMenu}
            fps={fps}
          />
        ))}

        {/* 转场标记 */}
        {trackTransitions.map(t => {
          const from = clipById.get(t.from_item_id)!;
          const x = (from.startFrame + from.durationInFrames) * pxPerFrame;
          return (
            <TransitionMarker
              key={t.id}
              transition={t}
              x={x}
              selected={t.id === selectedTransitionId}
              onSelect={onSelectTransition ?? (() => {})}
            />
          );
        })}
      </div>
    </div>
  );
}
