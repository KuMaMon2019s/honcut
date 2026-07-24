// CaptionsLayer.tsx — 预览画布上的字幕叠加层
// 绝对定位覆盖在 canvas 上方，根据 playhead 显示活跃字幕

import { useMemo } from "react";
import type { CaptionCue } from "./types";
import { parseCaptionStyle } from "./types";
import { cuesAtFrame } from "./captionUtils";

interface CaptionsLayerProps {
  cues: CaptionCue[];
  playhead: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const POSITION_STYLES: Record<string, React.CSSProperties> = {
  top: { top: "6%", transform: "translateX(-50%)" },
  center: { top: "50%", transform: "translate(-50%, -50%)" },
  bottom: { bottom: "8%", transform: "translateX(-50%)" },
};

export default function CaptionsLayer({
  cues, playhead, selectedId, onSelect,
}: CaptionsLayerProps) {
  const activeCues = useMemo(() => cuesAtFrame(cues, playhead), [cues, playhead]);

  if (activeCues.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {activeCues.map(cue => {
        const style = parseCaptionStyle(cue.style);
        const isSelected = cue.id === selectedId;
        const posStyle = POSITION_STYLES[style.position] || POSITION_STYLES.bottom;

        return (
          <div
            key={cue.id}
            className={`absolute left-1/2 pointer-events-auto cursor-pointer select-none max-w-[85%] ${
              isSelected ? "ring-2 ring-accent rounded" : ""
            }`}
            style={{
              ...posStyle,
              fontFamily: style.fontFamily,
              fontSize: `${style.fontSize / 19.2}cqw`,
              fontWeight: style.fontWeight,
              color: style.color,
              backgroundColor: style.backgroundColor,
              padding: `${style.padding}px`,
              lineHeight: style.lineHeight,
              opacity: style.opacity,
              textAlign: style.alignment,
              textShadow: style.outlineWidth > 0
                ? `0 0 ${style.outlineWidth}px ${style.outlineColor}, 0 0 ${style.outlineWidth * 2}px ${style.outlineColor}`
                : "none",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(isSelected ? null : cue.id);
            }}
          >
            {cue.text}
          </div>
        );
      })}
    </div>
  );
}
