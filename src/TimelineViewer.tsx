// TimelineViewer.tsx — 轻量时间线查看器
// 读 OpenChatCut project.json → 渲染时间线 + 素材库 + KB 搜索
// 零 Remotion / Chrome headless / ffmpeg 依赖

import { useState, useEffect, useRef, useCallback } from "react";
import RenderProgress from "./RenderProgress";
import MediaPlayer from "./components/MediaPlayer";

interface Clip {
  id: string; name: string; kind: string;
  track: string; startFrame: number; durationInFrames: number;
  src: string;
}

interface Transition {
  id: string; fromItemId: string; toItemId: string;
  type: string; durationInFrames: number;
}

interface Asset {
  id: string; name: string; kind: string; src: string; durationInFrames?: number;
}

interface TimelineData {
  fps: number; items: Clip[]; transitions: Transition[];
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

// 颜色：不同轨道分配不同色系
const TRACK_COLORS: Record<string, string> = {
  V1: "#3b82f6", V2: "#22c55e", V3: "#f59e0b",
  A1: "#8b5cf6", A2: "#ec4899",
};

function colorForTrack(track: string): string {
  return TRACK_COLORS[track] ?? "#6b7280";
}

function frameToTime(f: number, fps: number): string {
  const s = Math.floor(f / fps);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  character: { label: "角色", color: "#8b5cf6" },
  scene: { label: "场景", color: "#22c55e" },
  style: { label: "风格", color: "#f59e0b" },
  audio: { label: "音频", color: "#ec4899" },
};

export default function TimelineViewer({ projectId }: { projectId: string }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [selectedMedia, setSelectedMedia] = useState<{ src: string; kind: "video" | "audio"; name: string } | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  // KB 搜索状态
  const [kbQuery, setKbQuery] = useState("");
  const [kbResults, setKbResults] = useState<KbResult[]>([]);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const [kbSelected, setKbSelected] = useState<KbResult | null>(null);
  const [kbDetail, setKbDetail] = useState<Record<string, any> | null>(null);
  const kbRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    fetch(`/api/project/${encodeURIComponent(projectId)}`)
      .then(r => r.json())
      .then(d => { setData(d.timeline); setAssets(d.assets ?? []); })
      .catch(e => setError("加载失败: " + e.message));
  }, [projectId]);

  // KB 搜索（防抖 350ms）
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 1) { setKbResults([]); setKbOpen(false); return; }
    setKbLoading(true);
    try {
      const r = await fetch("/api/kb/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const d = await r.json();
      setKbResults(d.results ?? []);
      setKbOpen(true);
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

  // 点击素材 → 加载详情
  const onSelectResult = async (r: KbResult) => {
    setKbSelected(r);
    setKbOpen(false);
    // 尝试读取 JSON 素材卡内容
    try {
      const resp = await fetch(`/api/kb/asset?path=${encodeURIComponent(r.abs_path)}`);
      const detail = await resp.json();
      setKbDetail(detail);
    } catch {
      setKbDetail(null);
    }
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (kbRef.current && !kbRef.current.contains(e.target as Node)) setKbOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (error) return <div className="error" style={{ color: "#f87171", padding: 24 }}>{error}</div>;
  if (!data) return <div className="loading" style={{ color: "#888", padding: 24 }}>加载中…</div>;

  const { fps, items, transitions } = data;
  const totalFrames = items.length > 0
    ? Math.max(...items.map(i => i.startFrame + i.durationInFrames))
    : 240;

  const tracks = new Map<string, Clip[]>();
  for (const item of items) {
    const list = tracks.get(item.track) ?? [];
    list.push(item);
    tracks.set(item.track, list);
  }

  const pxPerFrame = 3;
  const headerWidth = 80;

  return (
    <div style={{ fontFamily: "system-ui", background: "#111", color: "#eee", minHeight: "100vh" }}>
      {/* 顶栏 */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #333", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => window.history.back()} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 20 }}>←</button>
        <span style={{ fontSize: 18, fontWeight: 600 }}>萌宠包子记</span>
        <span style={{ color: "#666", fontSize: 13, marginLeft: 8 }}>
          {fps}fps · {items.length} 片段 · {transitions.length} 转场 · {frameToTime(totalFrames, fps)}
        </span>

        {/* 渲染按钮 */}
        <button
          onClick={() => setIsRendering(true)}
          disabled={isRendering}
          style={{
            background: isRendering ? "#333" : "#3b82f6",
            border: "none", color: isRendering ? "#666" : "#fff",
            borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 600,
            cursor: isRendering ? "default" : "pointer",
            marginLeft: 8, display: "flex", alignItems: "center", gap: 6,
          }}
        >
          {isRendering ? "⏳ 渲染中" : "🎬 渲染"}
        </button>

        {/* KB 搜索栏 */}
        <div ref={kbRef} style={{ marginLeft: "auto", position: "relative" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{ position: "absolute", left: 10, fontSize: 14, zIndex: 1 }}>🔍</span>
            <input
              type="text"
              value={kbQuery}
              onChange={e => onKbInput(e.target.value)}
              onFocus={() => { if (kbResults.length > 0) setKbOpen(true); }}
              placeholder="搜索知识库素材…"
              style={{
                padding: "7px 12px 7px 32px", borderRadius: 8, border: "1px solid #444",
                background: "#1a1a1a", color: "#eee", fontSize: 13, width: 240,
                outline: "none", transition: "border-color 0.2s",
              }}
              onKeyDown={e => { if (e.key === "Escape") setKbOpen(false); }}
            />
            {kbLoading && (
              <span style={{ position: "absolute", right: 10, color: "#888", fontSize: 12 }}>⏳</span>
            )}
          </div>

          {/* 下拉结果 */}
          {kbOpen && kbResults.length > 0 && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "#1e1e1e", border: "1px solid #444", borderRadius: 8,
              marginTop: 4, maxHeight: 320, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
            }}>
              {kbResults.map((r, i) => {
                const typeInfo = TYPE_LABELS[r.type] ?? { label: r.type, color: "#6b7280" };
                return (
                  <div key={i}
                    onClick={() => onSelectResult(r)}
                    style={{
                      padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #2a2a2a",
                      display: "flex", alignItems: "center", gap: 8,
                      background: kbSelected?.abs_path === r.abs_path ? "#2a2a2a" : "transparent",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#2a2a2a")}
                    onMouseLeave={e => { if (kbSelected?.abs_path !== r.abs_path) e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 4,
                      background: typeInfo.color + "30", color: typeInfo.color,
                      fontWeight: 600, flexShrink: 0,
                    }}>
                      {typeInfo.label}
                    </span>
                    <span style={{ fontSize: 13, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {r.filename}
                    </span>
                    <span style={{ fontSize: 10, color: "#666" }}>
                      {(r.score * 100).toFixed(0)}%
                    </span>
                    {r.description && (
                      <span style={{ fontSize: 10, color: "#555", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>
                        {r.description}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {kbOpen && kbResults.length === 0 && kbQuery.trim().length > 0 && !kbLoading && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
              background: "#1e1e1e", border: "1px solid #444", borderRadius: 8,
              marginTop: 4, padding: "12px 16px", fontSize: 12, color: "#666",
            }}>
              未找到匹配的素材
            </div>
          )}
        </div>
      </div>

      {/* 渲染进度 */}
      <RenderProgress
        projectId={projectId}
        active={isRendering}
        onComplete={() => setIsRendering(false)}
        onCancel={() => setIsRendering(false)}
      />

      <div style={{ display: "flex", height: "calc(100vh - 49px)" }}>
        {/* 左侧：素材库 + KB 选中详情 */}
        <div style={{ width: 240, borderRight: "1px solid #333", padding: 8, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          {/* 项目素材 */}
          <div>
            <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>📦 项目素材 ({assets.length})</div>
            {assets.map(a => (
              <div key={a.id} onClick={() => setSelectedMedia({ src: a.src, kind: a.kind as "video" | "audio", name: a.name })} style={{
                background: "#1a1a1a", borderRadius: 6, padding: 6, marginBottom: 6,
                border: "1px solid #333", cursor: "pointer",
              }}>
                <video src={a.src} style={{ width: "100%", borderRadius: 4, background: "#000" }}
                  onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={e => { (e.target as HTMLVideoElement).pause(); (e.target as HTMLVideoElement).currentTime = 0; }}
                />
                <div style={{ fontSize: 11, marginTop: 4, wordBreak: "break-all" }}>{a.name}</div>
              </div>
            ))}
          </div>

          {/* KB 选中详情卡 */}
          {kbSelected && (
            <div style={{ borderTop: "1px solid #333", paddingTop: 8 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                🧠 知识库
                <button onClick={() => { setKbSelected(null); setKbDetail(null); }}
                  style={{ marginLeft: "auto", background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14 }}>
                  ✕
                </button>
              </div>
              <div style={{
                background: "#1a1a1a", borderRadius: 6, padding: 10, border: "1px solid #333", fontSize: 12,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{kbSelected.filename}</div>
                <span style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 4,
                  background: (TYPE_LABELS[kbSelected.type]?.color ?? "#666") + "30",
                  color: TYPE_LABELS[kbSelected.type]?.color ?? "#888",
                  fontWeight: 600,
                }}>
                  {TYPE_LABELS[kbSelected.type]?.label ?? kbSelected.type}
                </span>
                <span style={{ fontSize: 10, color: "#666", marginLeft: 8 }}>
                  匹配度 {(kbSelected.score * 100).toFixed(0)}%
                </span>

                {kbDetail ? (
                  <pre style={{
                    marginTop: 8, fontSize: 10, color: "#aaa",
                    background: "#111", borderRadius: 4, padding: 8,
                    maxHeight: 300, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
                    fontFamily: "monospace", lineHeight: 1.5,
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

        {/* 右侧：时间线 */}
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          {/* 时间尺 */}
          <div style={{ display: "flex", marginLeft: headerWidth, marginBottom: 4, position: "relative" }}>
            {Array.from({ length: Math.ceil(totalFrames / fps) + 1 }, (_, i) => (
              <div key={i} style={{
                position: "absolute", left: i * fps * pxPerFrame,
                fontSize: 10, color: "#666", transform: "translateX(-50%)",
              }}>
                {i}s
              </div>
            ))}
          </div>

          {/* 轨道 */}
          {[...tracks.entries()].map(([trackId, clips]) => (
            <div key={trackId} style={{ display: "flex", marginBottom: 4, alignItems: "center" }}>
              <div style={{
                width: headerWidth - 8, fontSize: 11, color: colorForTrack(trackId),
                fontWeight: 600, textAlign: "right", paddingRight: 8, flexShrink: 0,
              }}>
                {trackId.toUpperCase()}
              </div>

              <div style={{
                flex: 1, height: 48, background: "#1a1a1a", borderRadius: 4,
                position: "relative", border: "1px solid #2a2a2a",
                minWidth: totalFrames * pxPerFrame,
              }}>
                {clips.map(clip => (
                  <div key={clip.id} title={`${clip.name}\nframe ${clip.startFrame}-${clip.startFrame + clip.durationInFrames}`}
                    onClick={() => setSelectedMedia({ src: clip.src, kind: clip.kind as "video" | "audio", name: clip.name })}
                    style={{
                      position: "absolute",
                      left: clip.startFrame * pxPerFrame,
                      width: clip.durationInFrames * pxPerFrame,
                      height: "100%",
                      background: colorForTrack(trackId) + "40",
                      borderLeft: `3px solid ${colorForTrack(trackId)}`,
                      borderRadius: 4,
                      display: "flex", alignItems: "center",
                      paddingLeft: 6, fontSize: 11,
                      cursor: "pointer",
                      overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                      boxSizing: "border-box",
                    }}
                  >
                    {clip.name}
                  </div>
                ))}

                {transitions.map(tx => {
                  const from = items.find(i => i.id === tx.fromItemId);
                  if (!from) return null;
                  const txFrame = from.startFrame + from.durationInFrames;
                  return (
                    <div key={tx.id} title={`${tx.type} · ${tx.durationInFrames}f`}
                      style={{
                        position: "absolute",
                        left: (txFrame - tx.durationInFrames / 2) * pxPerFrame,
                        width: tx.durationInFrames * pxPerFrame,
                        height: "100%",
                        background: "#f59e0b20",
                        borderLeft: "2px dashed #f59e0b",
                        borderRight: "2px dashed #f59e0b",
                        zIndex: 2,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, color: "#f59e0b",
                      }}
                    >
                      {tx.type}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          <div style={{ position: "relative", marginLeft: headerWidth, marginTop: 8 }}>
            <input type="range" min={0} max={totalFrames} value={playhead}
              onChange={e => setPlayhead(Number(e.target.value))}
              style={{ width: "100%", cursor: "pointer", accentColor: "#3b82f6" }}
            />
            <div style={{ fontSize: 11, color: "#888", textAlign: "center", marginTop: 2 }}>
              {frameToTime(playhead, fps)} / {frameToTime(totalFrames, fps)}
            </div>
          </div>
        </div>
      </div>

      {/* MediaPlayer 弹层 */}
      {selectedMedia && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.85)", display: "flex",
          alignItems: "center", justifyContent: "center",
          padding: 24,
        }} onClick={e => { if (e.target === e.currentTarget) setSelectedMedia(null); }}>
          <MediaPlayer
            src={selectedMedia.src}
            kind={selectedMedia.kind}
            title={selectedMedia.name}
            onClose={() => setSelectedMedia(null)}
            autoPlay
          />
        </div>
      )}
    </div>
  );
}
