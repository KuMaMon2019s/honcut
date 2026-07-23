// LibraryPanel.tsx — 素材库面板：特效 / 转场 / 模板
// 数据源: GET /api/library (effects · transitions · zoom · sounds)
//        GET /api/templates (categories → templates by category)
// 应用特效: PATCH /api/projects/{id}/clips/{clip_id}/props → props.effects[]

import { useState, useEffect, useCallback, useRef } from "react";
import { api, type Template } from "../api/client";
import { type ClipData } from "./ClipBlock";

interface LibraryData {
  effects?: string[];
  transitions?: string[];
  zoom?: string[];
  sounds?: string[];
}

interface LibraryPanelProps {
  projectId: string;
  selectedClip: ClipData | null;
  onClipUpdated: () => void; // 应用特效后通知父组件刷新片段数据
}

const EFFECT_ICONS: Record<string, string> = {
  Blur: "🌫️", Sharpen: "🔪", Vignette: "🕶️",
  "Chromatic Aberration": "🌈", Glow: "✨", Noise: "📺",
};

const TRANSITION_ICONS: Record<string, string> = {
  Dissolve: "💧", Wipe: "🧹", Fade: "🌗", Slide: "↔️", "Zoom Blur": "🔍",
};

const CATEGORY_LABELS: Record<string, string> = {
  backgrounds: "背景", infographics: "信息图", intros: "片头",
  "lower-thirds": "字幕条", outros: "片尾", overlays: "叠加层",
  "social-media": "社交媒体", "text-animations": "文字动画",
  "title-cards": "标题卡", transitions: "转场",
};

function SectionTitle({ icon, label, hint }: { icon: string; label: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "2px 0 6px" }}>
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#bbb", letterSpacing: "0.04em" }}>{label}</span>
      {hint && <span style={{ fontSize: 10, color: "#555", marginLeft: "auto" }}>{hint}</span>}
    </div>
  );
}

export default function LibraryPanel({ projectId, selectedClip, onClipUpdated }: LibraryPanelProps) {
  const [lib, setLib] = useState<LibraryData>({});
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [pendingTransition, setPendingTransition] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 加载 library 目录 + 模板分类
  useEffect(() => {
    fetch("/api/library").then(r => r.json()).then(setLib).catch(() => {});
    api.listTemplates().then(d => setCategories(d.categories ?? [])).catch(() => {});
  }, []);

  // 按分类加载模板
  useEffect(() => {
    if (!activeCategory) { setTemplates([]); return; }
    setTplLoading(true);
    api.listTemplates(activeCategory)
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
      .finally(() => setTplLoading(false));
  }, [activeCategory]);

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  // 切换特效到选中片段
  const toggleEffect = async (name: string) => {
    if (!selectedClip) { showToast("⚠️ 请先选中时间线上的片段"); return; }
    const current: string[] = Array.isArray(selectedClip.props?.effects) ? selectedClip.props.effects : [];
    const removing = current.includes(name);
    const next = removing ? current.filter(e => e !== name) : [...current, name];
    setApplying(name);
    try {
      await api.updateClipProps(projectId, selectedClip.id, { effects: next });
      onClipUpdated();
      showToast(removing ? `已移除「${name}」` : `✨ 已应用「${name}」`);
    } catch {
      showToast("❌ 应用失败");
    } finally {
      setApplying(null);
    }
  };

  const activeEffects: string[] =
    Array.isArray(selectedClip?.props?.effects) ? selectedClip.props.effects : [];

  // ── 芯片样式 ──
  const chipStyle = (active: boolean, busy: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "7px 8px", borderRadius: 6, fontSize: 11,
    border: active ? "1px solid #dc7036" : "1px solid #333",
    background: active ? "rgba(220,112,54,0.12)" : "#1e1e1e",
    color: active ? "#f0a06a" : "#ccc",
    cursor: busy ? "wait" : "pointer",
    opacity: busy ? 0.6 : 1,
    transition: "all 0.15s",
    userSelect: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
  });

  return (
    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 14, position: "relative", minHeight: "100%" }}>
      {/* ═══ 特效 ═══ */}
      <div>
        <SectionTitle icon="🎛️" label="特效" hint={selectedClip ? `→ ${selectedClip.name.slice(0, 10)}` : "点击应用到选中片段"} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {(lib.effects ?? []).map(name => {
            const active = activeEffects.includes(name);
            const busy = applying === name;
            return (
              <div
                key={name}
                onClick={() => toggleEffect(name)}
                onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = "#555"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "#333"; }}
                style={chipStyle(active, busy)}
                title={active ? "点击移除" : "点击应用"}
              >
                <span style={{ fontSize: 13, flexShrink: 0 }}>{EFFECT_ICONS[name] ?? "🎛️"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                {active && <span style={{ marginLeft: "auto", fontSize: 10, color: "#dc7036", flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
        </div>
        {!lib.effects && <div style={{ fontSize: 10, color: "#555", padding: "4px 0" }}>加载中…</div>}
      </div>

      {/* ═══ 转场 ═══ */}
      <div>
        <SectionTitle icon="🔀" label="转场" hint={pendingTransition ? `已选: ${pendingTransition}` : "选择转场类型"} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
          {(lib.transitions ?? []).map(name => {
            const active = pendingTransition === name;
            return (
              <div
                key={name}
                onClick={() => setPendingTransition(active ? null : name)}
                onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = "#555"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = "#333"; }}
                style={chipStyle(active, false)}
              >
                <span style={{ fontSize: 13, flexShrink: 0 }}>{TRANSITION_ICONS[name] ?? "🔀"}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                {active && <span style={{ marginLeft: "auto", fontSize: 10, color: "#dc7036", flexShrink: 0 }}>✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ 模板 ═══ */}
      <div>
        <SectionTitle icon="📐" label="模板" hint={`${categories.length} 个分类`} />
        {/* 分类 chips — 横向滚动 */}
        <div style={{
          display: "flex", gap: 5, overflowX: "auto", paddingBottom: 6,
          scrollbarWidth: "thin",
        }}>
          {categories.map(cat => {
            const active = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(active ? "" : cat)}
                style={{
                  flexShrink: 0, padding: "4px 10px", borderRadius: 12,
                  fontSize: 10, fontWeight: 600, cursor: "pointer",
                  border: active ? "1px solid #dc7036" : "1px solid #3a3a3a",
                  background: active ? "rgba(220,112,54,0.15)" : "#1a1a1a",
                  color: active ? "#f0a06a" : "#999",
                  transition: "all 0.15s",
                }}
              >
                {CATEGORY_LABELS[cat] ?? cat}
              </button>
            );
          })}
        </div>

        {/* 模板列表 */}
        {activeCategory && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {tplLoading && <div style={{ fontSize: 10, color: "#555", padding: "6px 0" }}>加载中…</div>}
            {!tplLoading && templates.length === 0 && (
              <div style={{ fontSize: 10, color: "#555", padding: "6px 0" }}>该分类暂无模板</div>
            )}
            {templates.map(t => (
              <div
                key={t.id}
                onClick={() => showToast(`📐 模板「${t.name}」— 即将支持一键应用`)}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#555")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#333")}
                style={{
                  background: "#1e1e1e", border: "1px solid #333", borderRadius: 6,
                  padding: "8px 10px", cursor: "pointer", transition: "border-color 0.15s",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: "#ddd", marginBottom: 2 }}>{t.name}</div>
                {t.description && (
                  <div style={{
                    fontSize: 10, color: "#777", lineHeight: 1.4,
                    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {t.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!activeCategory && (
          <div style={{
            fontSize: 10, color: "#555", padding: "10px 8px",
            border: "1px dashed #333", borderRadius: 6, textAlign: "center",
          }}>
            选择上方分类浏览模板
          </div>
        )}
      </div>

      {/* ═══ Toast ═══ */}
      {toast && (
        <div
          className="lib-toast"
          style={{
            position: "sticky", bottom: 8, left: 0, right: 0,
            margin: "0 auto", width: "fit-content", maxWidth: "90%",
            background: "#2a2a2a", border: "1px solid #444", borderRadius: 8,
            padding: "7px 14px", fontSize: 11, color: "#eee",
            boxShadow: "0 4px 16px rgba(0,0,0,0.5)", zIndex: 10,
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
