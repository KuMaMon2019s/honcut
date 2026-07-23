// TransitionMarker.tsx — 转场标记组件
// 渲染在两个片段交界处，菱形（旋转45°），琥珀色，显示转场类型图标

import { useState } from "react";
import type { Transition } from "../api/client";
import { TRANSITION_ICONS } from "./LibraryPanel";

interface TransitionMarkerProps {
  transition: Transition;
  x: number; // 交界处中心 X 坐标（像素）
  selected: boolean;
  onSelect: (t: Transition) => void;
}

export default function TransitionMarker({ transition, x, selected, onSelect }: TransitionMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const icon = TRANSITION_ICONS[transition.type] ?? "🔀";
  const size = 14;
  const half = size / 2;

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onSelect(transition); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${transition.type} · ${transition.duration_frames}f`}
      style={{
        position: "absolute",
        left: x - half,
        top: "50%",
        transform: "translateY(-50%) rotate(45deg)",
        width: size,
        height: size,
        zIndex: 10,
        cursor: "pointer",
        background: selected ? "#fbbf24" : "#f59e0b",
        border: selected ? "1.5px solid #fff" : "1px solid rgba(255,255,255,0.3)",
        borderRadius: 2,
        boxShadow: selected
          ? "0 0 8px 2px rgba(245,158,11,0.6)"
          : hovered
            ? "0 0 6px 1px rgba(245,158,11,0.4)"
            : "0 1px 3px rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "box-shadow 0.15s, background 0.15s",
      }}
    >
      {/* 图标需要反向旋转回来 */}
      <span style={{
        transform: "rotate(-45deg)",
        fontSize: 8,
        lineHeight: 1,
        userSelect: "none",
        pointerEvents: "none",
      }}>
        {icon}
      </span>
    </div>
  );
}
