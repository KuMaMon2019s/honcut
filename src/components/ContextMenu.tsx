// ContextMenu.tsx — 时间线片段右键菜单（增强版 P3）
// 原有操作：分割 / 复制 / 添加转场 / 删除
// P3：「更多操作」→ 12 个分类 → 全量 38 个 MCP 工具（三级菜单）
// 菜单展示用本地 TOOL_META（同步即时渲染），点击执行时才从后端拉 schema

import { useEffect, useMemo, useRef, useState } from "react";
import { TOOL_CATEGORIES, TOOL_META, type ToolMeta } from "../mcp/tools";

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
  /** 打开 MCP 工具参数对话框（P3 全量工具） */
  onOpenTool: (toolName: string) => void;
  onClose: () => void;
}

const TRANSITION_TYPES = ["Dissolve", "Wipe", "Fade", "Slide", "Zoom Blur"];

const MENU_WIDTH = 216;
const MENU_HEIGHT = 240;
const CAT_MENU_WIDTH = 164;
const TOOL_MENU_WIDTH = 186;

export default function ContextMenu({
  x, y, clipId, clipName, canSplit, canAddTransition,
  onSplit, onDuplicate, onDelete, onAddTransition, onOpenTool, onClose,
}: ContextMenuProps) {
  const [submenuOpen, setSubmenuOpen] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 本地静态分组：category → tools（同步，菜单即时渲染）
  const toolsByCategory = useMemo(() => {
    const map = new Map<string, Array<{ name: string; meta: ToolMeta }>>();
    for (const [name, meta] of Object.entries(TOOL_META)) {
      const list = map.get(meta.category) ?? [];
      list.push({ name, meta });
      map.set(meta.category, list);
    }
    return map;
  }, []);

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

  // ── 视口边界计算 ──
  const menuX = Math.max(4, Math.min(x, window.innerWidth - MENU_WIDTH - 8));
  const menuY = Math.max(4, Math.min(y, window.innerHeight - MENU_HEIGHT - 8));
  const submenuOnLeft = menuX + MENU_WIDTH + CAT_MENU_WIDTH + 8 > window.innerWidth;
  // 三级菜单（工具列表）基于二级菜单的绝对位置判断
  const catMenuAbsX = submenuOnLeft ? menuX - CAT_MENU_WIDTH : menuX + MENU_WIDTH;
  const toolMenuOnLeft = catMenuAbsX + CAT_MENU_WIDTH + TOOL_MENU_WIDTH + 8 > window.innerWidth;
  // 二级分类菜单最大高度（12 个分类可能超出视口）
  const catMenuMaxH = Math.max(120, window.innerHeight - menuY - 16);

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

  const panelStyle: React.CSSProperties = {
    background: "#1e1e1e",
    border: "1px solid #333",
    borderRadius: 6,
    boxShadow: "0 8px 24px rgba(0,0,0,0.55)",
    padding: "4px 0",
  };

  // ── 三级菜单：分类下的工具列表 ──
  const renderToolMenu = (categoryId: string) => {
    const tools = toolsByCategory.get(categoryId) ?? [];
    return (
      <div style={{
        ...panelStyle,
        position: "absolute",
        top: -5,
        left: toolMenuOnLeft ? undefined : "100%",
        right: toolMenuOnLeft ? "100%" : undefined,
        width: TOOL_MENU_WIDTH,
        maxHeight: catMenuMaxH,
        overflowY: "auto",
        zIndex: 2,
      }}>
        {tools.map(t => (
          <div
            key={t.name}
            style={itemStyle({
              danger: t.meta.dangerous,
              hovered: hoveredItem === `tool:${t.name}`,
            })}
            onMouseEnter={() => setHoveredItem(`tool:${t.name}`)}
            onClick={() => { onClose(); onOpenTool(t.name); }}
            title={t.name}
          >
            <span>{t.meta.icon}</span>
            <span>{t.meta.label}</span>
            <span style={shortcutStyle}>{t.name}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── 二级菜单：分类列表 / 转场类型 ──
  const renderSubmenu = (content: React.ReactNode, extraStyle?: React.CSSProperties) => (
    <div style={{
      ...panelStyle,
      position: "absolute",
      top: -5,
      left: submenuOnLeft ? undefined : "100%",
      right: submenuOnLeft ? "100%" : undefined,
      width: CAT_MENU_WIDTH,
      zIndex: 1,
      ...extraStyle,
    }}>
      {content}
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
        ...panelStyle,
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
        onMouseEnter={() => { setHoveredItem("split"); setSubmenuOpen(null); setCategoryOpen(null); }}
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
        onMouseEnter={() => { setHoveredItem("duplicate"); setSubmenuOpen(null); setCategoryOpen(null); }}
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
          setCategoryOpen(null);
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
          )),
        )}
      </div>

      {/* 🔧 更多操作（hover 展开分类 → 全量 MCP 工具） */}
      <div
        style={{
          position: "relative",
          ...itemStyle({
            hovered: hoveredItem === "more" || submenuOpen === "more",
          }),
        }}
        onMouseEnter={() => { setHoveredItem("more"); setSubmenuOpen("more"); }}
        onMouseLeave={() => { setHoveredItem(null); setSubmenuOpen(null); setCategoryOpen(null); }}
      >
        <span>🔧</span>
        <span>更多操作</span>
        <span style={{ ...shortcutStyle, fontSize: 9 }}>38 工具 ▸</span>

        {submenuOpen === "more" && renderSubmenu(
          <>
            {TOOL_CATEGORIES.map(cat => {
              const tools = toolsByCategory.get(cat.id) ?? [];
              if (tools.length === 0) return null;
              return (
                <div
                  key={cat.id}
                  style={{
                    position: "relative",
                    ...itemStyle({
                      hovered: hoveredItem === `cat:${cat.id}` || categoryOpen === cat.id,
                    }),
                  }}
                  onMouseEnter={() => { setHoveredItem(`cat:${cat.id}`); setCategoryOpen(cat.id); }}
                  onMouseLeave={() => setHoveredItem(null)}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                  <span style={shortcutStyle}>{tools.length} ▸</span>

                  {categoryOpen === cat.id && renderToolMenu(cat.id)}
                </div>
              );
            })}
          </>,
          { maxHeight: catMenuMaxH, overflowY: "auto" },
        )}
      </div>

      <div style={{ height: 1, background: "#333", margin: "4px 0" }} />

      {/* 🗑️ 删除片段 */}
      <div
        style={itemStyle({ danger: true, hovered: hoveredItem === "delete" })}
        onMouseEnter={() => { setHoveredItem("delete"); setSubmenuOpen(null); setCategoryOpen(null); }}
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
