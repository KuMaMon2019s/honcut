// ContextMenu.tsx — 时间线片段右键菜单（增强版）
// 原有操作：分割 / 复制 / 添加转场 / 删除
// 新增：「更多操作」子菜单 → 打开 MCP 工具参数对话框（trim/move/timing/props）

import { useEffect, useRef, useState } from "react";

interface ContextMenuProps {
  x: number;
  y: number;
  clipId: string;
  clipName: string;
  canSplit: boolean;
  canAddTransition: boolean;
  onSplit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onAddTransition: (type: string) => void;
  /** 打开 MCP 工具参数对话框（新增） */
  onOpenTool: (toolName: string) => void;
  onClose: () => void;
}

const TRANSITION_TYPES = ["Dissolve", "Wipe", "Fade", "Slide", "Zoom Blur"];

// 「更多操作」子菜单项 → 对应 MCP 工具名
const MORE_ACTIONS: Array<{ icon: string; label: string; tool: string }> = [
  { icon: "✂️", label: "裁剪片段", tool: "trim_clip" },
  { icon: "🔀", label: "移动片段", tool: "move_item" },
  { icon: "⏱️", label: "调整时间", tool: "set_item_timing" },
  { icon: "🔧", label: "更新属性", tool: "update_item_props" },
];

const MENU_WIDTH = 216;
const MENU_HEIGHT = 240;
const SUBMENU_WIDTH = 148;

export default function ContextMenu({
  x, y, clipId, clipName, canSplit, canAddTransition,
  onSplit, onDuplicate, onDelete, onAddTransition, onOpenTool, onClose,
}: ContextMenuProps) {
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null);
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

  const itemStyle = (opts: {
    disabled?: boolean; danger?: boolean; hovered?: boolean;
  }): React.CSSProperties => ({
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

  // 子菜单渲染
  const renderSubmenu = (items: React.ReactNode) => (
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
      zIndex: 1,
    }}>
      {items}
    </div>
  );

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
        onMouseEnter={() => { setHoveredItem("split"); setSubmenuOpen(null); }}
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
        onMouseEnter={() => { setHoveredItem("duplicate"); setSubmenuOpen(null); }}
        onMouseLeave={() => setHoveredItem(null)}
        onClick={() => { onClose(); onDuplicate(); }}
      >
        <span>📋</span>
        <span>复制片段</span>
        <span style={shortcutStyle}>⌘D</span>
      </div>

      <div style={{ height: 1, background: "#333", margin: "4px 0" }} />

      {/* 🔗 添加转场（hover 展开子菜单） */}
      <div
        style={{
          position: "relative",
          ...itemStyle({
            disabled: !canAddTransition,
            hovered: hoveredItem === "transition" || submenuOpen === "transition",
          }),
        }}
        onMouseEnter={() => {
          setHoveredItem("transition");
          if (canAddTransition) setSubmenuOpen("transition");
        }}
        onMouseLeave={() => { setHoveredItem(null); setSubmenuOpen(null); }}
      >
        <span>🔗</span>
        <span>添加转场</span>
        <span style={shortcutStyle}>▸</span>

        {submenuOpen === "transition" && canAddTransition && renderSubmenu(
          TRANSITION_TYPES.map(t => (
            <div
              key={t}
              style={itemStyle({ hovered: hoveredItem === `tr:${t}` })}
              onMouseEnter={() => setHoveredItem(`tr:${t}`)}
              onClick={() => { onClose(); onAddTransition(t); }}
            >
              {t}
            </div>
          ))
        )}
      </div>

      {/* 🔧 更多操作（hover 展开子菜单 → MCP 工具） */}
      <div
        style={{
          position: "relative",
          ...itemStyle({
            hovered: hoveredItem === "more" || submenuOpen === "more",
          }),
        }}
        onMouseEnter={() => { setHoveredItem("more"); setSubmenuOpen("more"); }}
        onMouseLeave={() => { setHoveredItem(null); setSubmenuOpen(null); }}
      >
        <span>🔧</span>
        <span>更多操作</span>
        <span style={shortcutStyle}>▸</span>

        {submenuOpen === "more" && renderSubmenu(
          MORE_ACTIONS.map(a => (
            <div
              key={a.tool}
              style={itemStyle({ hovered: hoveredItem === `more:${a.tool}` })}
              onMouseEnter={() => setHoveredItem(`more:${a.tool}`)}
              onClick={() => { onClose(); onOpenTool(a.tool); }}
            >
              <span>{a.icon}</span>
              <span>{a.label}</span>
            </div>
          ))
        )}
      </div>

      <div style={{ height: 1, background: "#333", margin: "4px 0" }} />

      {/* 🗑️ 删除片段 */}
      <div
        style={itemStyle({ danger: true, hovered: hoveredItem === "delete" })}
        onMouseEnter={() => { setHoveredItem("delete"); setSubmenuOpen(null); }}
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
