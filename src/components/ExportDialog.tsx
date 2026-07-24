// ExportDialog.tsx — 渲染导出对话框（完整参数版）
// 编码 / 分辨率 / 帧率 / 质量 / 预设
// Tailwind v4 石墨主题

import { useState, useCallback } from "react";
import { useRender, useRenderStatus } from "../api/hooks";
import type { RenderSettings } from "../api/client";

interface ExportDialogProps {
  projectId: string;
  projectName?: string;
  onClose: () => void;
}

type Phase = "idle" | "rendering" | "done" | "error";

const CODECS = [
  { value: "h264", label: "H.264 (兼容性最佳)" },
  { value: "h265", label: "H.265 / HEVC (体积小)" },
  { value: "vp9",  label: "VP9 (WebM)" },
  { value: "av1",  label: "AV1 (最新压缩)" },
] as const;

const RESOLUTIONS = [
  { value: "source", label: "原始分辨率", w: 0, h: 0 },
  { value: "2160p",  label: "4K — 3840×2160", w: 3840, h: 2160 },
  { value: "1080p",  label: "1080p — 1920×1080", w: 1920, h: 1080 },
  { value: "720p",   label: "720p — 1280×720", w: 1280, h: 720 },
  { value: "480p",   label: "480p — 854×480", w: 854, h: 480 },
] as const;

const FPS_OPTIONS = [24, 25, 30, 60] as const;

const PRESETS = [
  "ultrafast", "superfast", "veryfast", "faster", "fast",
  "medium", "slow", "slower", "veryslow",
] as const;

// CRF 标签
function crfLabel(v: number): string {
  if (v <= 17) return "视觉无损";
  if (v <= 23) return "高质量";
  if (v <= 28) return "中等";
  return "低质量";
}

export default function ExportDialog({ projectId, projectName, onClose }: ExportDialogProps) {
  const { start, cancel, jobId, downloadUrl } = useRender(projectId);
  const { data: status, polling } = useRenderStatus(jobId ?? "", jobId !== null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // ── 导出参数状态 ──
  const [codec, setCodec] = useState("h264");
  const [resolution, setResolution] = useState("source");
  const [fps, setFps] = useState(30);
  const [crf, setCrf] = useState(23);
  const [preset, setPreset] = useState("medium");

  // 根据轮询状态同步 phase
  if (status && phase === "rendering") {
    if (status.status === "completed") setPhase("done");
    else if (status.status === "failed" || status.status === "cancelled") {
      setPhase("error");
      setErrorMsg(status.error || `渲染${status.status === "cancelled" ? "已取消" : "失败"}`);
    }
  }

  const handleStart = useCallback(async () => {
    setPhase("rendering");
    setErrorMsg("");
    try {
      const res = RESOLUTIONS.find(r => r.value === resolution);
      const settings: RenderSettings = {
        codec,
        fps,
        crf,
        preset,
        ...(res && res.w > 0 ? { width: res.w, height: res.h } : {}),
      };
      await start(settings);
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [start, codec, resolution, fps, crf, preset]);

  const handleCancel = useCallback(async () => {
    try {
      await cancel();
    } catch {
      // 取消失败不阻塞 UI
    }
    setPhase("error");
    setErrorMsg("渲染已取消");
  }, [cancel]);

  const progress = status?.progress ?? 0;

  // ── 共用样式 ──
  const labelCls = "block text-[11px] font-medium text-text-muted mb-1.5 uppercase tracking-wide";
  const selectCls = "w-full rounded-md border border-border bg-panel-alt px-3 py-2 text-[13px] text-text outline-none focus:border-accent transition-colors appearance-none cursor-pointer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget && phase !== "rendering") onClose(); }}
    >
      <div className="relative w-[460px] max-w-[90vw] max-h-[85vh] overflow-y-auto bg-panel border border-border rounded-xl shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-panel z-10">
          <span className="text-base font-semibold text-text-strong">
            🎬 导出视频{projectName ? ` — ${projectName}` : ""}
          </span>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-text text-sm px-2 py-1 rounded hover:bg-hover transition-colors"
            title="关闭"
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        <div className="px-6 py-5">
          {phase === "idle" && (
            <div className="space-y-4">
              {/* 编码格式 */}
              <div>
                <label className={labelCls}>编码格式</label>
                <select value={codec} onChange={e => setCodec(e.target.value)} className={selectCls}>
                  {CODECS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              {/* 分辨率 */}
              <div>
                <label className={labelCls}>分辨率</label>
                <select value={resolution} onChange={e => setResolution(e.target.value)} className={selectCls}>
                  {RESOLUTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* 帧率 */}
              <div>
                <label className={labelCls}>帧率 (FPS)</label>
                <div className="flex gap-2">
                  {FPS_OPTIONS.map(f => (
                    <button
                      key={f}
                      onClick={() => setFps(f)}
                      className={`flex-1 py-2 rounded-md text-[13px] font-medium border transition-colors ${
                        fps === f
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border text-text-muted hover:border-text-dim"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* 质量 CRF */}
              <div>
                <label className={labelCls}>
                  质量 (CRF {crf} — {crfLabel(crf)})
                </label>
                <input
                  type="range"
                  min={0}
                  max={51}
                  value={crf}
                  onChange={e => setCrf(Number(e.target.value))}
                  className="w-full h-1.5 rounded-full appearance-none bg-panel-alt accent-accent cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-text-dim mt-1">
                  <span>0 无损</span>
                  <span>23 默认</span>
                  <span>51 最小</span>
                </div>
              </div>

              {/* 编码速度预设 */}
              <div>
                <label className={labelCls}>编码速度</label>
                <select value={preset} onChange={e => setPreset(e.target.value)} className={selectCls}>
                  {PRESETS.map(p => (
                    <option key={p} value={p}>
                      {p}{p === "medium" ? " (默认)" : p === "ultrafast" ? " (最快)" : p === "veryslow" ? " (最慢/最小)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* 开始按钮 */}
              <button
                onClick={handleStart}
                className="w-full py-2.5 rounded-md text-sm font-semibold bg-accent text-on-accent hover:bg-accent-deep transition-colors mt-2"
              >
                🚀 开始渲染
              </button>
            </div>
          )}

          {phase === "rendering" && (
            <div className="py-2">
              <div className="flex justify-between mb-2">
                <span className="text-[13px] text-text-muted">
                  {status?.status === "pending" ? "排队中…" : "渲染中…"}
                </span>
                <span className="text-[13px] text-accent font-semibold tabular-nums">
                  {progress}%
                </span>
              </div>
              {/* 进度条 */}
              <div className="h-2 rounded-full bg-panel-alt overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(progress, 2)}%` }}
                />
              </div>
              {/* 当前参数摘要 */}
              <div className="mt-3 text-[11px] text-text-dim text-center">
                {codec.toUpperCase()} · {resolution === "source" ? "原始分辨率" : RESOLUTIONS.find(r => r.value === resolution)?.label} · {fps}fps · CRF {crf}
              </div>
              <div className="text-center mt-4">
                <button
                  onClick={handleCancel}
                  className="px-6 py-2 rounded-md text-sm text-text-muted border border-border hover:border-danger hover:text-danger transition-colors"
                >
                  取消渲染
                </button>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">✅</div>
              <p className="text-text text-sm mb-1">渲染完成！</p>
              {status?.output_path && (
                <p className="text-text-dim text-xs mb-4 break-all">{status.output_path}</p>
              )}
              <a href={downloadUrl ?? "#"} download className="inline-block w-full">
                <span className="block w-full py-2.5 rounded-md text-sm font-semibold bg-success text-bg text-center hover:opacity-90 transition-opacity">
                  ⬇ 下载视频
                </span>
              </a>
            </div>
          )}

          {phase === "error" && (
            <div className="text-center py-4">
              <div className="text-3xl mb-3">❌</div>
              <div className="bg-danger/10 text-danger text-xs rounded p-3 break-all mb-4">
                {errorMsg}
              </div>
              <button
                onClick={() => { setPhase("idle"); setErrorMsg(""); }}
                className="px-6 py-2 rounded-md text-sm text-text-muted border border-border hover:border-accent hover:text-accent transition-colors"
              >
                重试
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
