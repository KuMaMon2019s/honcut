// ContextMenu.tsx — 时间线片段右键菜单
// 在右键位置弹出的暗色菜单：分割 / 复制片段 / 添加转场（子菜单）/ 删除片段

import { useEffect, useRef, useState } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  clipId: string;
  clipName: string;
  canSplit: boolean;          // 播放头是否在片段范围内
  canAddTransition: boolean;  // 同轨道是否有下一个片段
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddTransition: (type: string) => void;
  onClose: () => void;
}

const TRANSITION_TYPES = ["Dissolve", "Wipe", "Fade", "Slide", "Zoom Blur"];

const MENU_WIDTH = 208;
const MENU_HEIGHT = 190;
const SUBMENU_WIDTH = 132;

export default function ContextMenu({
  x, y, clipId, clipName, canSplit, canAddTransition,
  onSplit, onDuplicate, onDelete, onAddTransition, onClose,
}: ContextMenuProps) {
  const [submenuOpen, setSubmenuOpen] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击菜单外区域关闭
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  // 限制在视口内
  const menuX = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const menuY = Math.max(4, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));
  const submenuOnLeft = menuX + MENU_WIDTH + SUBMENU_WIDTH + 8 > window.innerWidth;

  const itemStyle = (opts: { disabled?: boolean; danger?: boolean; hovered?: boolean }): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    fontSize: 12,
    color: opts.disabled ? "#5c5c5c" : opts.danger ? "#ef4444" : "#e0e0e0",
    background: opts.hovered && !opts.disabled ? "#2a2a2a" : "transparent",
    cursor: opts.disabled ? "default" : "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  });

  const shortcutStyle: React.CSSProperties = {
    marginLeft: "auto",
    paddingLeft: 18,
    fontSize: 10,
    color: "#777",
  };

  return (
    <div
      ref={menuRef}
      data-clip-id={clipId}
      onContextMenu={e => e.preventDefault()}
      style={{
        position: "fixed",
        left: menuX,
        top: menuY,
        width: MENU_WIDTH,
        background: "#1e1e1e",
        border: "1px solid #333",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
        padding: "4px 0",
        zIndex: 3000,
      }}
    >
      {/* 片段名（头部） */}
      <div style={{
        padding: "4px 10px 6px",
        fontSize: 10,
        color: "#888",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {clipName}
      </div>

      {/* ✂️ 分割 */}
      <div
        style={itemStyle({ disabled: !canSplit, hovered: hoveredItem === "split" })}
        onMouseEnter={() => setHoveredItem("split")}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={() => { if (!canSplit) return; onClose(); onSplit(); }}
      >
        <span>✂️</span>
        <span>分割（在播放头处）</span>
        <span style={shortcutStyle}>C</span>
      </div>

      {/* 📋 复制片段 */}
      <div
        style={itemStyle({ hovered: hoveredItem === "duplicate" })}
        onMouseEnter={() => setHoveredItem("duplicate")}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={() => { onClose(); onDuplicate(); }}
      >
        <span>📋</span>
        <span>复制片段</span>
        <span style={shortcutStyle}>Ctrl+D</span>
      </div>

      <div style={{ height: 1, background: "#333", margin: "4px 0" }} />

      {/* 🔗 添加转场（hover 展开子菜单） */}
      <div
        style={{
          position: "relative",
          ...itemStyle({ disabled: !canAddTransition, hovered: hoveredItem === "transition" || submenuOpen }),
        }}
        onMouseEnter={() => { setHoveredItem("transition"); if (canAddTransition) setSubmenuOpen(true); }}
        onMouseLeave={() => { setHoveredItem(null); setSubmenuOpen(false); }}
      >
        <span>🔗</span>
        <span>添加转场</span>
        <span style={shortcutStyle}>▸</span>

        {submenuOpen && canAddTransition && (
          <div style={{
            position: "absolute",
            top: -5,
            left: submenuOnLeft ? undefined : "100%",
            right: submenuOnLeft ? "100%" : undefined,
            width: SUBMENU_WIDTH,
            background: "#1e1e1e",
            border: "1px solid #333",
            borderRadius: 6,
            boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
            padding: "4px 0",
          }}>
            {TRANSITION_TYPES.map(t => (
              <div
                key={t}
                style={itemStyle({ hovered: hoveredItem === `tr:${t}` })}
                onMouseEnter={() => setHoveredItem(`tr:${t}`)}
                onClick={() => { onClose(); onAddTransition(t); }}
              >
                {t}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: 1, background: "#333", margin: "4px 0" }} />

      {/* 🗑️ 删除片段 */}
      <div
        style={itemStyle({ danger: true, hovered: hoveredItem === "delete" })}
        onMouseEnter={() => setHoveredItem("delete")}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={() => { onClose(); onDelete(); }}
      >
        <span>🗑️</span>
        <span>删除片段</span>
        <span style={shortcutStyle}>Del</span>
      </div>
    </div>
  );
}
