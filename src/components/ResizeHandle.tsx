// ResizeHandle.tsx — 可拖拽面板分隔条
// 垂直方向拖拽调整左右面板宽度，支持 min/max 约束

import { useRef, useCallback, useEffect, useState } from "react";

interface ResizeHandleProps {
  /** 当前宽度 (px) */
  size: number;
  /** 宽度变更回调 */
  onResize: (newSize: number) => void;
  /** 最小宽度 */
  min?: number;
  /** 最大宽度 */
  max?: number;
  /** 方向：left 面板右边缘拖 / right 面板左边缘拖 */
  side?: "left" | "right";
}

export default function ResizeHandle({
  size,
  onResize,
  min = 180,
  max = 500,
  side = "left",
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startSizeRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;
    startSizeRef.current = size;
    setDragging(true);
  }, [size]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startXRef.current;
      let newSize: number;
      if (side === "left") {
        newSize = startSizeRef.current + dx;
      } else {
        newSize = startSizeRef.current - dx;
      }
      newSize = Math.max(min, Math.min(max, newSize));
      onResize(newSize);
    };

    const handleMouseUp = () => {
      setDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    // 拖拽时禁止文本选择
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, min, max, onResize, side]);

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: 5,
        flexShrink: 0,
        cursor: "col-resize",
        background: dragging ? "var(--cc-accent, #e94560)" : "transparent",
        transition: dragging ? "none" : "background 0.2s",
        position: "relative",
        zIndex: 10,
      }}
      title="拖拽调整面板宽度"
    >
      {/* 扩大热区 */}
      <div style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: -3,
        right: -3,
      }} />
      {/* 中间指示线 */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: 2,
        height: 24,
        borderRadius: 1,
        background: dragging ? "#fff" : "rgba(255,255,255,0.15)",
        transition: "background 0.2s",
      }} />
    </div>
  );
}
