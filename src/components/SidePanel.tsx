// SidePanel.tsx — 左侧面板：素材池 (MediaPool) + 素材库 (Library)
// 替换原 Agent 聊天面板，提供媒体管理和知识库浏览功能
import { useState, useEffect, useRef, useCallback } from "react";
import UploadPanel from "../UploadPanel";
import { api } from "../api/client";

// ── Types ──────────────────────────────────────────────────────────────
export interface Asset {
  id: string;
  name: string;
  kind: string;
  src: string;
  durationInFrames?: number;
}

interface KbResult {
  score: number;
  filename: string;
  type: string;
  path: string;
  abs_path: string;
  description?: string;
  tags?: string[];
}

interface SidePanelProps {
  projectId: string;
  onPreview: (media: { src: string; kind: "video" | "audio"; name: string }) => void;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  character: { label: "角色", color: "#8b5cf6" },
  scene: { label: "场景", color: "#22c55e" },
  style: { label: "风格", color: "#f59e0b" },
  audio: { label: "音频", color: "#ec4899" },
};

const KIND_ICONS: Record<string, string> = {
  video: "🎬",
  audio: "🎵",
  image: "🖼️",
};

type TabId = "pool" | "library";

// ── Component ──────────────────────────────────────────────────────────
export default function SidePanel({ projectId, onPreview }: SidePanelProps) {
  const [tab, setTab] = useState<TabId>("pool");

  // ── MediaPool state ──
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Library (KB) state ──
  const [kbQuery, setKbQuery] = useState("");
  const [kbResults, setKbResults] = useState<KbResult[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSelected, setKbSelected] = useState<KbResult | null>(null);
  const [kbDetail, setKbDetail] = useState<Record<string, any> | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Fetch assets ──
  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const r = await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setAssets(Array.isArray(data) ? data : []);
    } catch {
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchAssets(); }, [fetchAssets]);

  // ── KB search ──
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) { setKbResults([]); return; }
    setKbLoading(true);
    try {
      const r = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "kb_search", arguments: { query: q } },
        }),
      });
      const d = await r.json();
      const text = d?.result?.content?.[0]?.text;
      const parsed = text ? JSON.parse(text) : {};
      setKbResults(parsed.results ?? []);
    } catch {
      setKbResults([]);
    } finally {
      setKbLoading(false);
    }
  }, []);

  const onKbInput = useCallback((val: string) => {
    setKbQuery(val);
    setKbSelected(null);
    setKbDetail(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 350);
  }, [doSearch]);

  const onSelectKbResult = async (r: KbResult) => {
    setKbSelected(r);
    try {
      const d = await api.mcpCall("kb_read", { path: r.abs_path });
      const result = d.result as { content?: { text?: string }[] } | undefined;
      const text = result?.content?.[0]?.text;
      if (text) {
        try {
          setKbDetail(JSON.parse(text));
        } catch {
          setKbDetail({ content: text });
        }
      } else {
        setKbDetail(null);
      }
    } catch {
      setKbDetail(null);
    }
  };

  // ── Asset actions ──
  const deleteAsset = async (id: string) => {
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets/${id}`, { method: "DELETE" });
      setAssets(prev => prev.filter(a => a.id !== id));
    } catch { /* ignore */ }
  };

  const startRename = (a: Asset) => {
    setRenamingId(a.id);
    setRenameValue(a.name);
  };

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) { setRenamingId(null); return; }
    try {
      await fetch(`/api/projects/${encodeURIComponent(projectId)}/assets/${renamingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setAssets(prev => prev.map(a => a.id === renamingId ? { ...a, name: renameValue.trim() } : a));
    } catch { /* ignore */ }
    setRenamingId(null);
  };

  // ── Styles ──
  const tabBtn = (id: TabId, label: string, icon: string) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 600,
        border: "none", cursor: "pointer", transition: "all 0.15s",
        background: tab === id ? "#2a2a2a" : "transparent",
        color: tab === id ? "#eee" : "#888",
        borderBottom: tab === id ? "2px solid #3b82f6" : "2px solid transparent",
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div style={{
      width: 260, borderRight: "1px solid #333", display: "flex",
      flexDirection: "column", flexShrink: 0, background: "#161616",
    }}>
      {/* ═══ Tab 栏 ═══ */}
      <div style={{ display: "flex", borderBottom: "1px solid #333", flexShrink: 0 }}>
        {tabBtn("pool", "素材池", "📦")}
        {tabBtn("library", "素材库", "🧠")}
      </div>

      {/* ═══ 素材池 Tab ═══ */}
      {tab === "pool" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* 上传区 */}
          <UploadPanel projectId={projectId} onUploaded={fetchAssets} />

          {/* 素材列表 */}
          <div style={{ fontSize: 11, color: "#666", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>素材 ({assets.length})</span>
            {assets.length > 0 && (
              <button onClick={fetchAssets} style={{
                background: "none", border: "none", color: "#3b82f6",
                cursor: "pointer", fontSize: 11, padding: 0,
              }}>
                ↻ 刷新
              </button>
            )}
          </div>

          {assetsLoading && (
            <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 16 }}>加载中…</div>
          )}

          {!assetsLoading && assets.length === 0 && (
            <div style={{
              textAlign: "center", color: "#555", fontSize: 12, padding: 24,
              border: "1px dashed #333", borderRadius: 8,
            }}>
              暂无素材
              <div style={{ fontSize: 10, marginTop: 4 }}>拖拽文件到上方区域上传</div>
            </div>
          )}

          {assets.map(a => (
            <div key={a.id} style={{
              background: "#1e1e1e", borderRadius: 6, padding: 8,
              border: "1px solid #333", cursor: "pointer",
              transition: "border-color 0.15s",
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "#555")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
            >
              {/* 预览缩略图 */}
              {a.kind === "video" ? (
                <video
                  src={a.src}
                  style={{ width: "100%", borderRadius: 4, background: "#000", marginBottom: 6 }}
                  muted
                  onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                />
              ) : a.kind === "image" ? (
                <img src={a.src} style={{ width: "100%", borderRadius: 4, background: "#000", marginBottom: 6 }} />
              ) : (
                <div style={{
                  height: 32, background: "#111", borderRadius: 4, marginBottom: 6,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                }}>
                  🎵
                </div>
              )}

              {/* 名称 + 操作 */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {renamingId === a.id ? (
                  <input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenamingId(null); }}
                    autoFocus
                    style={{
                      flex: 1, background: "#111", border: "1px solid #3b82f6",
                      borderRadius: 3, color: "#eee", fontSize: 11, padding: "2px 4px",
                      outline: "none",
                    }}
                  />
                ) : (
                  <span
                    onClick={() => onPreview({ src: a.src, kind: a.kind as "video" | "audio", name: a.name })}
                    style={{
                      flex: 1, fontSize: 11, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}
                    title={a.name}
                  >
                    {KIND_ICONS[a.kind] ?? "📄"} {a.name}
                  </span>
                )}
                <button onClick={() => startRename(a)} title="重命名" style={{
                  background: "none", border: "none", color: "#666",
                  cursor: "pointer", fontSize: 11, padding: "0 2px", flexShrink: 0,
                }}>✏️</button>
                <button onClick={() => deleteAsset(a.id)} title="删除" style={{
                  background: "none", border: "none", color: "#666",
                  cursor: "pointer", fontSize: 11, padding: "0 2px", flexShrink: 0,
                }}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ 素材库 Tab ═══ */}
      {tab === "library" && (
        <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {/* 搜索框 */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 10, fontSize: 13, zIndex: 1 }}>🔍</span>
            <input
              type="text"
              value={kbQuery}
              onChange={e => onKbInput(e.target.value)}
              placeholder="搜索知识库素材…"
              style={{
                width: "100%", padding: "7px 12px 7px 30px", borderRadius: 6,
                border: "1px solid #444", background: "#1a1a1a", color: "#eee",
                fontSize: 12, outline: "none", boxSizing: "border-box",
              }}
              onKeyDown={e => { if (e.key === "Escape") { setKbQuery(""); setKbResults([]); setKbSelected(null); } }}
            />
            {kbLoading && (
              <span style={{ position: "absolute", right: 10, color: "#888", fontSize: 11 }}>⏳</span>
            )}
          </div>

          {/* 搜索结果 */}
          {kbResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {kbResults.map((r, i) => {
                const typeInfo = TYPE_LABELS[r.type] ?? { label: r.type, color: "#6b7280" };
                const isSelected = kbSelected?.abs_path === r.abs_path;
                return (
                  <div key={i}
                    onClick={() => onSelectKbResult(r)}
                    style={{
                      padding: "8px 10px", cursor: "pointer", borderRadius: 6,
                      display: "flex", alignItems: "center", gap: 8,
                      background: isSelected ? "#2a2a2a" : "#1e1e1e",
                      border: isSelected ? "1px solid #3b82f6" : "1px solid #333",
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{
                      fontSize: 9, padding: "1px 5px", borderRadius: 3,
                      background: typeInfo.color + "30", color: typeInfo.color,
                      fontWeight: 600, flexShrink: 0,
                    }}>
                      {typeInfo.label}
                    </span>
                    <span style={{
                      fontSize: 12, flex: 1, whiteSpace: "nowrap",
                      overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {r.filename}
                    </span>
                    <span style={{ fontSize: 10, color: "#666", flexShrink: 0 }}>
                      {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {kbQuery.trim().length > 0 && !kbLoading && kbResults.length === 0 && (
            <div style={{ textAlign: "center", color: "#555", fontSize: 12, padding: 16 }}>
              未找到匹配的素材
            </div>
          )}

          {kbQuery.trim().length === 0 && (
            <div style={{
              textAlign: "center", color: "#555", fontSize: 12, padding: 24,
              border: "1px dashed #333", borderRadius: 8,
            }}>
              🧠 知识库
              <div style={{ fontSize: 10, marginTop: 4 }}>输入关键词搜索角色、场景、风格素材</div>
            </div>
          )}

          {/* KB 选中详情 */}
          {kbSelected && (
            <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                素材详情
                <button onClick={() => { setKbSelected(null); setKbDetail(null); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 13 }}>
                  ✕
                </button>
              </div>
              <div style={{ background: "#1e1e1e", borderRadius: 6, padding: 10, border: "1px solid #333", fontSize: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{kbSelected.filename}</div>
                <span style={{
                  fontSize: 9, padding: "1px 5px", borderRadius: 3,
                  background: (TYPE_LABELS[kbSelected.type]?.color ?? "#666") + "30",
                  color: TYPE_LABELS[kbSelected.type]?.color ?? "#888",
                  fontWeight: 600,
                }}>
                  {TYPE_LABELS[kbSelected.type]?.label ?? kbSelected.type}
                </span>
                <span style={{ fontSize: 10, color: "#666", marginLeft: 8 }}>
                  匹配度 {(kbSelected.score * 100).toFixed(0)}%
                </span>
                {kbSelected.tags && kbSelected.tags.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {kbSelected.tags.map((t, i) => (
                      <span key={i} style={{
                        fontSize: 9, padding: "1px 6px", borderRadius: 3,
                        background: "#333", color: "#aaa",
                      }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {kbDetail ? (
                  <pre style={{
                    marginTop: 8, fontSize: 10, color: "#aaa",
                    background: "#111", borderRadius: 4, padding: 8,
                    maxHeight: 260, overflowY: "auto", whiteSpace: "pre-wrap",
                    wordBreak: "break-all", fontFamily: "monospace", lineHeight: 1.5,
                  }}>
                    {JSON.stringify(kbDetail, null, 2)}
                  </pre>
                ) : kbDetail === null ? (
                  <div style={{ marginTop: 6, fontSize: 10, color: "#555" }}>加载中…</div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 10, color: "#666" }}>
                    {kbSelected.description || "无描述"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
