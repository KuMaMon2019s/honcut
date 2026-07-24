// DropGhost.tsx — 拖拽落点预览
// 半透明矩形显示片段将要落到的位置，绿色=有效，红色=碰撞

interface DropGhostProps {
  frame: number;
  durationFrames: number;
  pxPerFrame: number;
  valid: boolean;
  color: string;
}

export default function DropGhost({ frame, durationFrames, pxPerFrame, valid, color }: DropGhostProps) {
  const left = frame * pxPerFrame;
  const width = Math.max(durationFrames * pxPerFrame, 4);

  return (
    <div style={{
      position: "absolute",
      left,
      width,
      top: 2,
      bottom: 2,
      background: valid ? `${color}18` : "rgba(239,68,68,0.12)",
      border: valid ? `2px dashed ${color}` : "2px dashed #ef4444",
      borderRadius: 4,
      pointerEvents: "none",
      zIndex: 8,
      opacity: 0.9,
    }}>
      {/* 碰撞时显示 ✕ 标记 */}
      {!valid && (
        <span style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: 14,
          color: "#ef4444",
          fontWeight: 700,
          pointerEvents: "none",
        }}>✕</span>
      )}
    </div>
  );
}
