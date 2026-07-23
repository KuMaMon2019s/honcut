// TrackLane.tsx — 轨道行组件
// 包含轨道头（名称/类型/静音）+ 内容区（ClipBlock 列表）
// Props: trackId, clips, pxPerFrame, totalFrames, color, selectedClipId, onSelectClip, fps

import ClipBlock, { type ClipData } from "./ClipBlock";

interface TrackLaneProps {
  trackId: string;
  trackName?: string;
  trackKind?: string; // "video" | "audio"
  clips: ClipData[];
  pxPerFrame: number;
  totalFrames: number;
  color: string;
  selectedClipId: string | null;
  onSelectClip: (clip: ClipData) => void;
  fps: number;
  headerWidth: number;
}

const KIND_BADGES: Record<string, { icon: string; label: string }> = {
  video: { icon: "🎬", label: "视频" },
  audio: { icon: "🎵", label: "音频" },
};

export default function TrackLane({
  trackId, trackName, trackKind, clips, pxPerFrame, totalFrames,
  color, selectedClipId, onSelectClip, fps, headerWidth,
}: TrackLaneProps) {
  const badge = KIND_BADGES[trackKind ?? "video"] ?? KIND_BADGES.video;
  const laneWidth = totalFrames * pxPerFrame;

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
      <div style={{
        position: "relative",
        height: 44,
        width: laneWidth,
        minWidth: laneWidth,
        background: "#161616",
        borderRadius: 3,
        border: "1px solid #252525",
      }}>
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
            fps={fps}
          />
        ))}
      </div>
    </div>
  );
}
