// ClipBlock.tsx — 时间线片段块
// 显示在轨道内的单个片段，支持选中/悬停/tooltip
// Props: clip, pxPerFrame, color, selected, onSelect

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

export default function ClipBlock({ clip, pxPerFrame, color, selected, onSelect, fps }: ClipBlockProps) {
  const width = clip.durationInFrames * pxPerFrame;
  const left = clip.startFrame * pxPerFrame;
  const icon = KIND_ICONS[clip.kind] ?? "📦";
  const showLabel = width > 40;

  return (
    <div
      title={`${clip.name}\n${frameToTime(clip.startFrame, fps)} → ${frameToTime(clip.startFrame + clip.durationInFrames, fps)}\n${clip.durationInFrames}f · ${clip.kind}`}
      onClick={(e) => { e.stopPropagation(); onSelect(clip); }}
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
        cursor: "pointer",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        boxSizing: "border-box",
        transition: "background 0.15s, border-color 0.15s",
        zIndex: selected ? 5 : 1,
        boxShadow: selected ? `0 0 8px ${color}40` : "none",
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
  );
}
