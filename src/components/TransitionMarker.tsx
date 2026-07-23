// TransitionMarker.tsx — 转场标记组件
// 渲染在两个片段交界处，菱形（旋转45°），琥珀色，显示转场类型图标
// R6: 点击弹出内联编辑对话框（类型/时长/保存），两侧可拖拽手柄调整时长

import { useState, useRef, useCallback } from "react";
import type { Transition } from "../api/client";
import { TRANSITION_ICONS } from "./LibraryPanel";

interface TransitionMarkerProps {
  transition: Transition;
  x: number; // 交界处中心 X 坐标（像素）
  pxPerFrame: number;
  selected: boolean;
  onSelect: (t: Transition) => void;
  onUpdate?: (transitionId: string, body: { type?: string; duration_frames?: number }) => void;
}

export default function TransitionMarker({ transition, x, pxPerFrame, selected, onSelect, onUpdate }: TransitionMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editType, setEditType] = useState(transition.type);
  const [editDuration, setEditDuration] = useState(transition.duration_frames);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; origDuration: number } | null>(null);

  const iconKey = Object.keys(TRANSITION_ICONS).find(k => k.toLowerCase() === transition.type.toLowerCase());
  const icon = (iconKey && TRANSITION_ICONS[iconKey]) || "🔀";
  const size = 14;
  const half = size / 2;
  const handleWidth = transition.duration_frames * pxPerFrame;

  const openDialog = useCallback(() => {
    setEditType(transition.type);
    setEditDuration(transition.duration_frames);
    setShowDialog(true);
  }, [transition]);

  const handleSave = useCallback(() => {
    const body: { type?: string; duration_frames?: number } = {};
    if (editType !== transition.type) body.type = editType;
    if (editDuration !== transition.duration_frames && editDuration >= 1) body.duration_frames = editDuration;
    if (Object.keys(body).length > 0) {
      onUpdate?.(transition.id, body);
    }
    setShowDialog(false);
  }, [editType, editDuration, transition, onUpdate]);

  // 拖拽手柄：调整转场时长
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
    dragRef.current = { startX: e.clientX, origDuration: transition.duration_frames };

    const onMove = (ev: MouseEvent) => {
      const st = dragRef.current;
      if (!st) return;
      const dx = ev.clientX - st.startX;
      // 拖拽改变的是半宽（两侧对称），所以 delta frames * 2
      const deltaFrames = Math.round((dx / pxPerFrame) * 2);
      const newDuration = Math.max(2, st.origDuration + deltaFrames);
      setEditDuration(newDuration);
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      setDragging(false);
      const st = dragRef.current;
      dragRef.current = null;
      if (st) {
        const dx = 0; // final value already in editDuration via state
      }
      // commit final duration
      setEditDuration(d => {
        if (d !== transition.duration_frames && d >= 1) {
          onUpdate?.(transition.id, { duration_frames: d });
        }
        return d;
      });
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [transition, pxPerFrame, onUpdate]);

  const displayDuration = dragging ? editDuration : transition.duration_frames;
  const displayHalfWidth = (displayDuration * pxPerFrame) / 2;

  return (
    <>
      {/* 转场区域可视化（半透明色带，宽度 = duration_frames * pxPerFrame） */}
      <div
        style={{
          position: "absolute",
          left: x - displayHalfWidth,
          width: displayDuration * pxPerFrame,
          top: 2,
          bottom: 2,
          background: "rgba(245,158,11,0.12)",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* 左侧拖拽手柄 */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: "absolute",
          left: x - displayHalfWidth - 3,
          width: 6,
          top: 4,
          bottom: 4,
          cursor: "col-resize",
          zIndex: 12,
          borderRadius: 2,
          background: dragging || hovered ? "rgba(245,158,11,0.6)" : "rgba(245,158,11,0.25)",
          transition: "background 0.1s",
        }}
        title="拖拽调整转场时长"
      />

      {/* 右侧拖拽手柄 */}
      <div
        onMouseDown={handleDragStart}
        style={{
          position: "absolute",
          left: x + displayHalfWidth - 3,
          width: 6,
          top: 4,
          bottom: 4,
          cursor: "col-resize",
          zIndex: 12,
          borderRadius: 2,
          background: dragging || hovered ? "rgba(245,158,11,0.6)" : "rgba(245,158,11,0.25)",
          transition: "background 0.1s",
        }}
        title="拖拽调整转场时长"
      />

      {/* 菱形标记 */}
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(transition); openDialog(); }}
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

      {/* R6: 内联编辑对话框 */}
      {showDialog && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "absolute",
            left: x - 90,
            top: -110,
            width: 180,
            background: "#1e1e1e",
            border: "1px solid #444",
            borderRadius: 8,
            padding: "10px 12px",
            zIndex: 100,
            boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          }}
        >
          {/* 类型下拉 */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>类型</label>
            <select
              value={editType}
              onChange={e => setEditType(e.target.value)}
              style={{
                width: "100%",
                background: "#111",
                border: "1px solid #444",
                borderRadius: 4,
                color: "#eee",
                fontSize: 11,
                padding: "4px 6px",
                outline: "none",
              }}
            >
              {Object.keys(TRANSITION_ICONS).map(t => (
                <option key={t} value={t}>{TRANSITION_ICONS[t]} {t}</option>
              ))}
            </select>
          </div>

          {/* 时长输入 */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, color: "#888", display: "block", marginBottom: 3 }}>时长 (帧)</label>
            <input
              type="number"
              min={1}
              value={editDuration}
              onChange={e => setEditDuration(Number(e.target.value))}
              onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
              style={{
                width: "100%",
                background: "#111",
                border: "1px solid #444",
                borderRadius: 4,
                color: "#eee",
                fontSize: 11,
                padding: "4px 6px",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* 按钮行 */}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={handleSave}
              style={{
                flex: 1,
                padding: "5px 0",
                borderRadius: 4,
                border: "none",
                background: "#f59e0b",
                color: "#000",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              保存
            </button>
            <button
              onClick={() => setShowDialog(false)}
              style={{
                flex: 1,
                padding: "5px 0",
                borderRadius: 4,
                border: "1px solid #555",
                background: "transparent",
                color: "#aaa",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
