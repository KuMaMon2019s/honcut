// Ruler.tsx — 时间线标尺
// 显示时间刻度 + 播放头位置 + 点击/拖拽定位 + 标记显示 + 吸附
// Props: totalFrames, fps, pxPerFrame, playhead, onSeek, headerWidth, markers, snapEnabled, snapPoints

import type { Marker } from "../api/client";
import { snapToFrame } from "../utils/snapping";

interface RulerProps {
  totalFrames: number;
  fps: number;
  pxPerFrame: number;
  playhead: number;
  onSeek: (frame: number) => void;
  headerWidth: number;
  markers?: Marker[];
  onMarkerClick?: (marker: Marker) => void;
  onMarkerContextMenu?: (e: React.MouseEvent, marker: Marker) => void;
  snapEnabled?: boolean;
  snapPoints?: number[];
}

function frameToTimecode(f: number, fps: number): string {
  const totalSec = Math.floor(f / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const fr = f % fps;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${fr.toString().padStart(2, "0")}`;
}

// 根据缩放级别决定刻度间隔（帧数）
function tickInterval(fps: number, pxPerFrame: number): number {
  const minPxBetweenTicks = 60;
  const framesPerMinPx = minPxBetweenTicks / pxPerFrame;
  // 候选间隔：1s, 2s, 5s, 10s, 30s, 60s
  const candidates = [fps, fps * 2, fps * 5, fps * 10, fps * 30, fps * 60];
  for (const c of candidates) {
    if (c >= framesPerMinPx) return c;
  }
  return fps * 60;
}

export default function Ruler({ totalFrames, fps, pxPerFrame, playhead, onSeek, headerWidth, markers = [], onMarkerClick, onMarkerContextMenu, snapEnabled, snapPoints }: RulerProps) {
  const totalWidth = totalFrames * pxPerFrame;
  const interval = tickInterval(fps, pxPerFrame);
  const ticks: number[] = [];
  for (let f = 0; f <= totalFrames; f += interval) {
    ticks.push(f);
  }

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let frame = Math.max(0, Math.min(totalFrames, Math.round(x / pxPerFrame)));
    if (snapEnabled && snapPoints && snapPoints.length > 0) {
      const threshold = 8 / pxPerFrame;
      const result = snapToFrame(frame, snapPoints, threshold);
      frame = result.frame;
    }
    onSeek(frame);
  };

  return (
    <div style={{ display: "flex", position: "relative", userSelect: "none" }}>
      {/* 左侧空白（对齐轨道头） */}
      <div style={{ width: headerWidth, flexShrink: 0 }} />

      {/* 标尺区域 */}
      <div
        onClick={handleClick}
        style={{
          position: "relative",
          height: 28,
          width: totalWidth,
          background: "#1a1a1a",
          borderRadius: "4px 4px 0 0",
          cursor: "crosshair",
          overflow: "hidden",
          borderBottom: "1px solid #333",
        }}
      >
        {/* 刻度线 + 标签 */}
        {ticks.map(f => (
          <div key={f} style={{ position: "absolute", left: f * pxPerFrame, top: 0, bottom: 0 }}>
            <div style={{ width: 1, height: "100%", background: "#444" }} />
            <span style={{
              position: "absolute", top: 2, left: 4,
              fontSize: 9, color: "#777", whiteSpace: "nowrap",
              fontFamily: "monospace",
            }}>
              {frameToTimecode(f, fps)}
            </span>
          </div>
        ))}

        {/* 小刻度（半间隔） */}
        {ticks.slice(0, -1).map((f, i) => {
          const mid = f + interval / 2;
          if (mid > totalFrames) return null;
          return (
            <div key={`sub-${i}`} style={{
              position: "absolute", left: mid * pxPerFrame, bottom: 0,
              width: 1, height: 8, background: "#333",
            }} />
          );
        })}

        {/* 播放头指示器 */}
        <div style={{
          position: "absolute",
          left: playhead * pxPerFrame,
          top: 0, bottom: 0,
          width: 0,
          borderLeft: "2px solid #ef4444",
          zIndex: 10,
          pointerEvents: "none",
        }}>
          {/* 播放头三角 */}
          <div style={{
            position: "absolute", top: 0, left: -5,
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "6px solid #ef4444",
          }} />
        </div>

        {/* 标记 */}
        {markers.map(m => (
          <div
            key={m.id}
            title={m.label ? `${m.label} (${m.frame}f)` : `${m.frame}f`}
            onClick={(e) => { e.stopPropagation(); onMarkerClick?.(m); }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onMarkerContextMenu?.(e, m); }}
            style={{
              position: "absolute",
              left: m.frame * pxPerFrame - 4,
              bottom: 0,
              width: 0, height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderBottom: `8px solid ${m.color}`,
              cursor: "pointer",
              zIndex: 15,
            }}
          />
        ))}
      </div>
    </div>
  );
}
