// RenderProgress.tsx — 渲染进度条组件
// 轮询后端 API，展示实时进度、已用时间、预估剩余、取消按钮

import { useState, useEffect, useRef, useCallback } from "react";
import { api, type RenderStatus as ApiRenderStatus } from "./api/client";

interface RenderDisplay {
  status: "preparing" | "rendering" | "complete" | "error" | "cancelled";
  progress: number;
  elapsed: string;
  eta: string;
  elapsedMs: number;
  currentFrame: number;
  totalFrames: number;
  fps: number;
  outputPath?: string;
  error?: string;
}

interface Props {
  projectId: string;
  active: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
  onStart?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "准备中…",
  rendering: "渲染中",
  complete: "完成",
  error: "出错",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  preparing: "#f59e0b",
  rendering: "#3b82f6",
  complete: "#22c55e",
  error: "#ef4444",
  cancelled: "#6b7280",
};

function mapApiStatus(s: ApiRenderStatus): RenderDisplay {
  const status = (s.status ?? "preparing") as RenderDisplay["status"];
  return {
    status,
    progress: s.progress ?? 0,
    elapsed: "0:00",
    eta: "--:--",
    elapsedMs: 0,
    currentFrame: 0,
    totalFrames: 0,
    fps: 24,
    outputPath: s.output_path || undefined,
    error: s.error || undefined,
  };
}

export default function RenderProgress({ projectId, active, onComplete, onCancel, onStart }: Props) {
  const [display, setDisplay] = useState<RenderDisplay | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [elapsedDisplay, setElapsedDisplay] = useState("0:00");
  const startTimeRef = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 发起渲染 — jobId 在 URL，project_id 在 JSON body
  const startRender = useCallback(async () => {
    onStart?.();
    const id = `render-${projectId}-${Date.now()}`;
    setJobId(id);
    try {
      const data = await api.startRender(id, projectId);
      setDisplay(mapApiStatus(data));
      setPolling(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDisplay({
        status: "error",
        progress: 0,
        elapsed: "0:00",
        eta: "--:--",
        elapsedMs: 0,
        currentFrame: 0,
        totalFrames: 0,
        fps: 24,
        error: msg,
      });
    }
  }, [projectId, onStart]);

  // 轮询进度 — 使用 jobId
  useEffect(() => {
    if (!polling || !jobId) return;

    const poll = async () => {
      try {
        const data = await api.getRenderStatus(jobId);
        const mapped = mapApiStatus(data);
        setDisplay(mapped);

        if (mapped.status === "complete" || mapped.status === "error" || mapped.status === "cancelled") {
          setPolling(false);
          if (mapped.status === "complete") onComplete?.();
        }
      } catch {
        // 网络错误，继续重试
      }
    };

    poll();
    const id = setInterval(poll, 1000);
    intervalRef.current = id;
    return () => clearInterval(id);
  }, [polling, jobId, onComplete]);

  // 已用时间实时更新
  useEffect(() => {
    if (!display || (display.status !== "rendering" && display.status !== "preparing")) {
      setElapsedDisplay(display?.elapsed ?? "0:00");
      return;
    }

    if (startTimeRef.current === 0 && display.elapsedMs > 0) {
      startTimeRef.current = Date.now() - display.elapsedMs;
    }

    const updateElapsed = () => {
      const start = startTimeRef.current || Date.now();
      const ms = Date.now() - start;
      const sec = Math.floor(ms / 1000);
      const min = Math.floor(sec / 60);
      const s = sec % 60;
      setElapsedDisplay(`${min}:${s.toString().padStart(2, "0")}`);
    };

    updateElapsed();
    const id = setInterval(updateElapsed, 1000);
    return () => clearInterval(id);
  }, [display?.status, display?.elapsedMs]);

  // 取消渲染 — 使用 jobId
  const cancelRender = async () => {
    if (!jobId) return;
    try {
      await api.cancelRender(jobId);
      onCancel?.();
    } catch {
      // 尽力而为
    }
  };

  // 初始化：如果 active 且未开始，自动开始
  useEffect(() => {
    if (active && !display && !polling) {
      startRender();
    }
  }, [active, display, polling, startRender]);

  if (!active && !display) return null;

  const currentStatus = display?.status ?? "preparing";
  const progress = display?.progress ?? 0;
  const color = STATUS_COLORS[currentStatus] ?? "#6b7280";
  const label = STATUS_LABELS[currentStatus] ?? currentStatus;

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #333",
        borderRadius: 10,
        padding: "16px 20px",
        marginBottom: 12,
        animation: "fadeIn 0.3s ease",
      }}
    >
      {/* 顶部：状态标签 + 百分比 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: color,
              animation: currentStatus === "rendering" ? "pulse 1.5s infinite" : "none",
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: "#eee" }}>{label}</span>
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {progress}%
        </span>
      </div>

      {/* 进度条 */}
      <div
        style={{
          width: "100%",
          height: 8,
          background: "#2a2a2a",
          borderRadius: 4,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: `linear-gradient(90deg, ${color}, ${color}cc)`,
            borderRadius: 4,
            transition: "width 0.5s ease",
          }}
        />
      </div>

      {/* 底部信息 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#888" }}>
          {currentStatus === "rendering" && (
            <>
              <span>帧 {display?.currentFrame ?? 0}/{display?.totalFrames ?? 0}</span>
              <span>{display?.fps ?? 24} fps</span>
            </>
          )}
          <span>⏱ {elapsedDisplay}</span>
          {currentStatus === "rendering" && <span>⏳ {display?.eta ?? "--:--"}</span>}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {/* 取消按钮 */}
          {(currentStatus === "rendering" || currentStatus === "preparing") && (
            <button
              onClick={cancelRender}
              style={{
                background: "none",
                border: "1px solid #555",
                color: "#ccc",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#ef4444";
                e.currentTarget.style.color = "#ef4444";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#555";
                e.currentTarget.style.color = "#ccc";
              }}
            >
              取消
            </button>
          )}

          {/* 完成 → 下载（使用 jobId） */}
          {currentStatus === "complete" && jobId && (
            <a
              href={api.getRenderDownloadUrl(jobId)}
              style={{
                background: "#22c55e",
                border: "none",
                color: "#000",
                borderRadius: 6,
                padding: "4px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              ⬇ 下载
            </a>
          )}

          {/* 重试按钮 */}
          {(currentStatus === "error" || currentStatus === "cancelled") && (
            <button
              onClick={startRender}
              style={{
                background: "#3b82f6",
                border: "none",
                color: "#fff",
                borderRadius: 6,
                padding: "4px 14px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              重试
            </button>
          )}

          {/* 关闭按钮（完成/错误/取消后） */}
          {(currentStatus === "complete" || currentStatus === "error" || currentStatus === "cancelled") && (
            <button
              onClick={() => { setDisplay(null); setPolling(false); setJobId(null); startTimeRef.current = 0; }}
              style={{
                background: "none",
                border: "1px solid #555",
                color: "#888",
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 错误信息 */}
      {currentStatus === "error" && display?.error && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#ef4444", background: "#1f1111", padding: "6px 10px", borderRadius: 6 }}>
          {display.error}
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
