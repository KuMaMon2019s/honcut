// InspectorPanel.tsx — 片段属性检查器
// 显示/编辑选中片段的属性：名称、轨道、时间、props
// Props: clip, fps, projectId, onUpdate, onDelete, onSplit, onDuplicate

import { useState, useEffect } from "react";
import { type ClipData } from "./ClipBlock";

interface InspectorPanelProps {
  clip: ClipData | null;
  fps: number;
  projectId: string;
  onUpdateClip: (clip: ClipData) => void;
  onDeleteClip: (clipId: string) => void;
  onSplitClip: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
}

function frameToTimecode(f: number, fps: number): string {
  const totalSec = Math.floor(f / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const fr = f % fps;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${fr.toString().padStart(2, "0")}`;
}

// 可折叠区块
function Section({ title, icon, children, defaultOpen = true }: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #222" }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: "8px 12px", cursor: "pointer", display: "flex",
          alignItems: "center", gap: 6, fontSize: 11, fontWeight: 600,
          color: "#999", userSelect: "none",
        }}
      >
        <span style={{ fontSize: 12 }}>{icon}</span>
        {title}
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#555", transition: "transform 0.15s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
      </div>
      {open && <div style={{ padding: "4px 12px 10px" }}>{children}</div>}
    </div>
  );
}

// 数字输入行
function NumberRow({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number; unit?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
      <span style={{ fontSize: 11, color: "#888", width: 56, flexShrink: 0 }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min} max={max} step={step ?? 1}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          flex: 1, background: "#1a1a1a", border: "1px solid #333",
          borderRadius: 4, padding: "4px 8px", color: "#eee",
          fontSize: 11, fontFamily: "monospace", outline: "none",
          width: 60,
        }}
      />
      {unit && <span style={{ fontSize: 10, color: "#555", flexShrink: 0 }}>{unit}</span>}
    </div>
  );
}

// 文本输入行
function TextRow({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
      <span style={{ fontSize: 11, color: "#888", width: 56, flexShrink: 0 }}>{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          flex: 1, background: "#1a1a1a", border: "1px solid #333",
          borderRadius: 4, padding: "4px 8px", color: "#eee",
          fontSize: 11, outline: "none",
        }}
      />
    </div>
  );
}

const KIND_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  video: { icon: "🎬", label: "视频", color: "#3b82f6" },
  audio: { icon: "🎵", label: "音频", color: "#8b5cf6" },
  image: { icon: "🖼️", label: "图片", color: "#22c55e" },
  text: { icon: "📝", label: "文字", color: "#f59e0b" },
};

export default function InspectorPanel({
  clip, fps, projectId, onUpdateClip, onDeleteClip, onSplitClip, onDuplicateClip,
}: InspectorPanelProps) {
  // 本地编辑状态（防止每次按键都发 API）
  const [name, setName] = useState("");
  const [startFrame, setStartFrame] = useState(0);
  const [durationFrames, setDurationFrames] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // 当选中片段变化时同步本地状态
  useEffect(() => {
    if (clip) {
      setName(clip.name);
      setStartFrame(clip.startFrame);
      setDurationFrames(clip.durationInFrames);
      setSaveMsg("");
    }
  }, [clip?.id]);

  if (!clip) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{
          padding: "8px 12px", borderBottom: "1px solid #2a2a2a",
          fontSize: 12, fontWeight: 600, color: "#aaa",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          🔍 检查器
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#444", fontSize: 13 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            选择片段查看属性
          </div>
        </div>
      </div>
    );
  }

  const kindInfo = KIND_LABELS[clip.kind] ?? { icon: "📦", label: clip.kind, color: "#6b7280" };
  const props = clip.props ?? {};

  // 保存 timing 修改
  const saveTiming = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clip.id)}/timing`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_frame: startFrame, duration_frames: durationFrames }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const updated = await resp.json();
      onUpdateClip({
        ...clip,
        startFrame: updated.start_frame ?? startFrame,
        durationInFrames: updated.duration_frames ?? durationFrames,
      });
      setSaveMsg("✓ 已保存");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e: any) {
      setSaveMsg("✗ " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // 保存 props 修改
  const saveProps = async (key: string, value: any) => {
    setSaving(true);
    setSaveMsg("");
    try {
      const newProps = { ...props, [key]: value };
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/clips/${encodeURIComponent(clip.id)}/props`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProps),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      onUpdateClip({ ...clip, props: newProps });
      setSaveMsg("✓ 已保存");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (e: any) {
      setSaveMsg("✗ " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const btnStyle = (color: string): React.CSSProperties => ({
    background: color + "20", border: `1px solid ${color}50`, color,
    borderRadius: 4, padding: "5px 10px", fontSize: 11, cursor: "pointer",
    fontWeight: 600, flex: 1, textAlign: "center" as const,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 标题 */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid #2a2a2a",
        fontSize: 12, fontWeight: 600, color: "#aaa",
        display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
      }}>
        🔍 检查器
        {saveMsg && (
          <span style={{ marginLeft: "auto", fontSize: 10, color: saveMsg.startsWith("✓") ? "#4ade80" : "#f87171" }}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* 可滚动内容 */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* 基本信息 */}
        <Section title="基本信息" icon="📋">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 4,
              background: kindInfo.color + "25", color: kindInfo.color, fontWeight: 600,
            }}>
              {kindInfo.icon} {kindInfo.label}
            </span>
            <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>
              {clip.id.slice(0, 8)}
            </span>
          </div>
          <TextRow label="名称" value={name} onChange={setName} />
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
            <span style={{ fontSize: 11, color: "#888", width: 56, flexShrink: 0 }}>轨道</span>
            <span style={{
              fontSize: 11, color: "#ccc", background: "#1a1a1a",
              border: "1px solid #333", borderRadius: 4, padding: "4px 8px", flex: 1,
            }}>
              {clip.track}
            </span>
          </div>
          {clip.src && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#888", width: 56, flexShrink: 0 }}>源</span>
              <span style={{
                fontSize: 10, color: "#666", fontFamily: "monospace",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
              }} title={clip.src}>
                {clip.src.split("/").pop() || clip.src}
              </span>
            </div>
          )}
        </Section>

        {/* 时间 */}
        <Section title="时间" icon="⏱️">
          <NumberRow label="起始帧" value={startFrame} onChange={setStartFrame} min={0} unit="f" />
          <NumberRow label="时长" value={durationFrames} onChange={setDurationFrames} min={1} unit="f" />
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6, gap: 8 }}>
            <span style={{ fontSize: 11, color: "#888", width: 56, flexShrink: 0 }}>结束帧</span>
            <span style={{ fontSize: 11, color: "#666", fontFamily: "monospace" }}>
              {startFrame + durationFrames}f
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
            <span style={{ fontSize: 11, color: "#888", width: 56, flexShrink: 0 }}>时间码</span>
            <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>
              {frameToTimecode(startFrame, fps)} → {frameToTimecode(startFrame + durationFrames, fps)}
            </span>
          </div>
          <button
            onClick={saveTiming}
            disabled={saving || (startFrame === clip.startFrame && durationFrames === clip.durationInFrames)}
            style={{
              width: "100%", padding: "5px 0", fontSize: 11, fontWeight: 600,
              background: (startFrame === clip.startFrame && durationFrames === clip.durationInFrames) ? "#222" : "#3b82f6",
              color: (startFrame === clip.startFrame && durationFrames === clip.durationInFrames) ? "#555" : "#fff",
              border: "none", borderRadius: 4,
              cursor: (startFrame === clip.startFrame && durationFrames === clip.durationInFrames) ? "default" : "pointer",
            }}
          >
            应用时间修改
          </button>
        </Section>

        {/* 属性 (props) */}
        <Section title={`属性 (${Object.keys(props).length})`} icon="⚙️" defaultOpen={Object.keys(props).length > 0}>
          {Object.keys(props).length === 0 && (
            <div style={{ fontSize: 11, color: "#555", padding: "4px 0" }}>无自定义属性</div>
          )}
          {Object.entries(props).map(([key, val]) => (
            <div key={key} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 2 }}>{key}</div>
              {typeof val === "number" ? (
                <input
                  type="number"
                  defaultValue={val}
                  step={0.1}
                  onBlur={e => { if (Number(e.target.value) !== val) saveProps(key, Number(e.target.value)); }}
                  style={{
                    width: "100%", background: "#1a1a1a", border: "1px solid #333",
                    borderRadius: 4, padding: "4px 8px", color: "#eee",
                    fontSize: 11, fontFamily: "monospace", outline: "none", boxSizing: "border-box",
                  }}
                />
              ) : typeof val === "boolean" ? (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#ccc", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={e => saveProps(key, e.target.checked)}
                    style={{ accentColor: "#3b82f6" }}
                  />
                  {val ? "是" : "否"}
                </label>
              ) : (
                <input
                  type="text"
                  defaultValue={String(val)}
                  onBlur={e => { if (e.target.value !== String(val)) saveProps(key, e.target.value); }}
                  style={{
                    width: "100%", background: "#1a1a1a", border: "1px solid #333",
                    borderRadius: 4, padding: "4px 8px", color: "#eee",
                    fontSize: 11, outline: "none", boxSizing: "border-box",
                  }}
                />
              )}
            </div>
          ))}
        </Section>

        {/* 操作 */}
        <Section title="操作" icon="🛠️">
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <button onClick={() => onSplitClip(clip.id)} style={btnStyle("#f59e0b")}>
              ✂️ 分割
            </button>
            <button onClick={() => onDuplicateClip(clip.id)} style={btnStyle("#22c55e")}>
              📋 复制
            </button>
          </div>
          <button
            onClick={() => { if (confirm(`确定删除片段「${clip.name}」？`)) onDeleteClip(clip.id); }}
            style={{
              width: "100%", padding: "5px 0", fontSize: 11, fontWeight: 600,
              background: "#ef444420", border: "1px solid #ef444450", color: "#ef4444",
              borderRadius: 4, cursor: "pointer",
            }}
          >
            🗑️ 删除片段
          </button>
        </Section>
      </div>
    </div>
  );
}
