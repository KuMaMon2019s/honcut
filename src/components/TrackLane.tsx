// TrackLane.tsx — 轨道行组件
// 包含轨道头（名称/类型/静音/颜色条）+ 内容区（ClipBlock 列表 + TransitionMarker）

import { useState, useRef } from "react";
import ClipBlock, { type ClipData } from "./ClipBlock";
import DropGhost from "./DropGhost";
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
  onClipDragMove?: (clip: ClipData, clientX: number, clientY: number, projectedFrame: number) => void;
  onContextMenu?: (e: React.MouseEvent, clip: ClipData) => void;
  onTrimEnd?: (clipId: string, newSrcInFrame: number, newDurationFrames: number, newStartFrame: number) => void;
  onTransitionDrop?: (transitionType: string, fromClipId: string, toClipId: string) => void;
  onUpdateTransition?: (transitionId: string, body: { type?: string; duration_frames?: number }) => void;
  /** 跨轨拖拽时：当前片段落入本轨道 → 高亮 */
  dropTarget?: boolean;
  /** P2: 拖拽落点预览 */
  dropGhost?: { frame: number; durationFrames: number; valid: boolean } | null;
  fps: number;
  headerWidth: number;
  /** P6: 轨道管理 */
  muted?: boolean;
  onToggleMute?: () => void;
  onRenameTrack?: (name: string) => void;
  onDeleteTrack?: () => void;
  /** P6: 音频轨音量 */
  volume?: number;
  onVolumeChange?: (vol: number) => void;
  /** P6: 吸附 */
  snapEnabled?: boolean;
  snapPoints?: number[];
  onSnapLine?: (frame: number | null) => void;
}

const KIND_BADGES: Record<string, { icon: string; label: string }> = {
  video: { icon: "🎬", label: "视频" },
  audio: { icon: "🎵", label: "音频" },
};

export default function TrackLane({
  trackId, trackName, trackKind, clips, transitions = [], pxPerFrame, totalFrames,
  color, selectedClipId, selectedTransitionId, onSelectClip, onSelectTransition, onClipDragEnd, onClipDragMove, onTrimEnd, onContextMenu, onTransitionDrop, onUpdateTransition, dropTarget, dropGhost, fps, headerWidth,
  muted, onToggleMute, onRenameTrack, onDeleteTrack, volume = 100, onVolumeChange,
  snapEnabled, snapPoints, onSnapLine,
}: TrackLaneProps) {
  const badge = KIND_BADGES[trackKind ?? "video"] ?? KIND_BADGES.video;
  const laneWidth = totalFrames * pxPerFrame;
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(trackName ?? trackId.toUpperCase());
  const inputRef = useRef<HTMLInputElement>(null);

  const handleStartEdit = () => {
    setEditName(trackName ?? trackId.toUpperCase());
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleFinishEdit = () => {
    setEditing(false);
    const trimmed = editName.trim();
    if (trimmed && trimmed !== (trackName ?? trackId.toUpperCase())) {
      onRenameTrack?.(trimmed);
    }
  };

  // 计算转场标记位置：from_item 的结束帧处
  const clipById = new Map(clips.map(c => [c.id, c]));
  const trackTransitions = transitions.filter(t => {
    const from = clipById.get(t.from_item_id);
    return from != null;
  });

  return (
    <div style={{ display: "flex", marginBottom: 2 }}>
      {/* 轨道头 */}
      <div
        onContextMenu={e => {
          e.preventDefault();
          if (onDeleteTrack && clips.length === 0) onDeleteTrack();
        }}
        title={clips.length === 0 ? "右键删除轨道" : "轨道有片段，无法删除"}
        style={{
          width: headerWidth,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-end",
          paddingRight: 8,
          gap: 1,
          position: "relative",
        }}
      >
        {/* 颜色条 */}
        <div style={{
          position: "absolute",
          left: 0, top: 4, bottom: 4,
          width: 3,
          borderRadius: 2,
          background: color,
        }} />
        {/* 名称（双击编辑） */}
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleFinishEdit}
            onKeyDown={e => { if (e.key === "Enter") handleFinishEdit(); if (e.key === "Escape") setEditing(false); }}
            style={{
              width: 60, fontSize: 10, fontWeight: 700, color,
              background: "#222", border: `1px solid ${color}`,
              borderRadius: 2, padding: "0 3px", outline: "none",
              textAlign: "right",
            }}
          />
        ) : (
          <span
            onDoubleClick={handleStartEdit}
            style={{
              fontSize: 11,
              fontWeight: 700,
              color,
              letterSpacing: 0.5,
              cursor: "default",
            }}
          >
            {trackName ?? trackId.toUpperCase()}
          </span>
        )}
        {/* 类型 + 静音 */}
        <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, color: "#666" }}>
            {badge.icon} {badge.label}
          </span>
          {onToggleMute && (
            <button
              onClick={onToggleMute}
              title={muted ? "取消静音" : "静音"}
              style={{
                fontSize: 10, background: "transparent", border: "none",
                cursor: "pointer", padding: 0, lineHeight: 1,
                opacity: muted ? 1 : 0.4,
              }}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          )}
        </div>
        {/* 音频轨音量滑块 */}
        {(trackKind === "audio" || trackId.startsWith("A")) && onVolumeChange && (
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={e => onVolumeChange(Number(e.target.value))}
            title={`音量 ${volume}%`}
            style={{ width: 50, height: 3, cursor: "pointer", accentColor: color }}
          />
        )}
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

        {/* 空轨道占位 */}
        {clips.length === 0 && (
          <div style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            color: "#444",
            pointerEvents: "none",
          }}>
            拖入片段
          </div>
        )}

        {/* P2: 拖拽落点预览 */}
        {dropGhost && (
          <DropGhost
            frame={dropGhost.frame}
            durationFrames={dropGhost.durationFrames}
            pxPerFrame={pxPerFrame}
            valid={dropGhost.valid}
            color={color}
          />
        )}

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
            onTrimEnd={onTrimEnd}
            onContextMenu={onContextMenu}
            fps={fps}
            snapEnabled={snapEnabled}
            snapPoints={snapPoints}
            onSnapLine={onSnapLine}
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
              pxPerFrame={pxPerFrame}
              selected={t.id === selectedTransitionId}
              onSelect={onSelectTransition ?? (() => {})}
              onUpdate={onUpdateTransition}
            />
          );
        })}
      </div>
    </div>
  );
}
