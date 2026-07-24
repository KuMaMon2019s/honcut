// src/components/MCPCommandPalette.tsx — Ctrl+K / ⌘K 命令面板
// 全量 38 个 MCP 工具的搜索 + 调用入口
// 键盘导航：↑↓ 选择，Enter 打开参数对话框，Esc 关闭

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  fetchTools, groupByCategory, searchTools, getCategoryInfo,
  type ToolInfo,
} from "../mcp/tools";
import ToolParamDialog from "./ToolParamDialog";

interface MCPCommandPaletteProps {
  projectId: string;
  clipId?: string | null;
  onClose: () => void;
  onResult?: (success: boolean, message: string) => void;
}

export default function MCPCommandPalette({
  projectId, clipId, onClose, onResult,
}: MCPCommandPaletteProps) {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [activeTool, setActiveTool] = useState<ToolInfo | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 加载工具列表（后端为 schema 唯一源）
  useEffect(() => {
    fetchTools()
      .then(t => { setTools(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // 聚焦搜索框
  useEffect(() => { inputRef.current?.focus(); }, []);

  // 过滤 + 分组
  const filtered = useMemo(() => searchTools(query, tools), [query, tools]);
  const groups = useMemo(() => groupByCategory(filtered), [filtered]);

  // 扁平化列表（键盘导航用）
  const flatList = useMemo(() => {
    const items: ToolInfo[] = [];
    for (const [, catTools] of groups) {
      items.push(...catTools);
    }
    return items;
  }, [groups]);

  // 工具名 → 扁平索引（渲染用）
  const flatIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    flatList.forEach((t, i) => map.set(t.name, i));
    return map;
  }, [flatList]);

  // 搜索时重置选中
  useEffect(() => { setSelectedIdx(0); }, [query]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, flatList.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const tool = flatList[selectedIdx];
      if (tool) setActiveTool(tool);
    }
  }, [flatList, selectedIdx, onClose]);

  // 滚动选中项到可见区域
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  // ── 参数对话框模式 ──
  if (activeTool) {
    return (
      <ToolParamDialog
        tool={activeTool}
        projectId={projectId}
        clipId={clipId}
        onClose={() => setActiveTool(null)}
        onResult={onResult}
      />
    );
  }

  // ── 样式 ──
  const overlayStyle: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 4000,
    background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "flex-start", justifyContent: "center",
    paddingTop: "12vh",
  };
  const panelStyle: React.CSSProperties = {
    background: "#1e1e1e", border: "1px solid #333", borderRadius: 10,
    width: 540, maxHeight: "65vh", display: "flex", flexDirection: "column",
    boxShadow: "0 16px 48px rgba(0,0,0,0.6)", overflow: "hidden",
  };

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        {/* 搜索框 */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #333" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, color: "#888" }}>⌘</span>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="搜索 MCP 工具…（38 个工具，12 个分类）"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 14, color: "#e0e0e0",
              }}
            />
            <span style={{
              fontSize: 10, color: "#555", border: "1px solid #444",
              borderRadius: 3, padding: "1px 5px",
            }}>
              ESC
            </span>
          </div>
        </div>

        {/* 工具列表 */}
        <div ref={listRef} style={{ flex: 1, overflow: "auto", padding: "6px 0" }}>
          {loading && (
            <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>
              加载工具列表…
            </div>
          )}
          {!loading && flatList.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "#666", fontSize: 12 }}>
              没有匹配的工具
            </div>
          )}
          {groups.map(([catId, catTools]) => {
            const cat = getCategoryInfo(catId);
            return (
              <div key={catId}>
                {/* 分类标题 */}
                <div style={{
                  padding: "6px 14px 3px", fontSize: 10, fontWeight: 600,
                  color: "#666", textTransform: "uppercase", letterSpacing: 1,
                }}>
                  {cat.icon} {cat.label}
                </div>
                {/* 工具项 */}
                {catTools.map(tool => {
                  const idx = flatIndexMap.get(tool.name) ?? 0;
                  const isSelected = idx === selectedIdx;
                  return (
                    <div
                      key={tool.name}
                      data-idx={idx}
                      onClick={() => setActiveTool(tool)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 14px", cursor: "pointer",
                        background: isSelected ? "#2a2a2a" : "transparent",
                      }}
                    >
                      <span style={{ fontSize: 14, width: 20, textAlign: "center", flexShrink: 0 }}>
                        {tool.meta.icon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#e0e0e0" }}>
                          {tool.meta.label}
                          <span style={{ fontSize: 10, color: "#666", marginLeft: 6 }}>
                            {tool.name}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 10, color: "#777",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {tool.description}
                        </div>
                      </div>
                      {tool.meta.dangerous && (
                        <span style={{
                          fontSize: 9, color: "#ef4444", border: "1px solid #ef4444",
                          borderRadius: 3, padding: "0 3px", flexShrink: 0,
                        }}>
                          危险
                        </span>
                      )}
                      {isSelected && (
                        <span style={{ fontSize: 9, color: "#555", flexShrink: 0 }}>↵</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* 底部提示 */}
        <div style={{
          padding: "6px 14px", borderTop: "1px solid #333",
          display: "flex", gap: 12, fontSize: 10, color: "#555",
        }}>
          <span>↑↓ 导航</span>
          <span>↵ 打开</span>
          <span>ESC 关闭</span>
          <span style={{ marginLeft: "auto" }}>
            {filtered.length} / {tools.length} 工具
          </span>
        </div>
      </div>
    </div>
  );
}
