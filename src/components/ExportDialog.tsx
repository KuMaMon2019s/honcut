// ExportDialog.tsx — 渲染导出对话框
// 提交渲染任务 → 轮询状态 → 下载产物
// 暗色主题：背景 #0f0f1a，面板 #1a1a2e，强调色 #e94560

import { useState, useCallback } from "react";
import { useRender, useRenderStatus } from "../api/hooks";

interface ExportDialogProps {
  projectId: string;
  projectName?: string;
  onClose: () => void;
}

type Phase = "idle" | "rendering" | "done" | "error";

export default function ExportDialog({ projectId, projectName, onClose }: ExportDialogProps) {
  const { start, cancel, jobId, downloadUrl } = useRender(projectId);
  const { data: status, polling } = useRenderStatus(jobId ?? "", jobId !== null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");

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
      await start();
    } catch (e) {
      setPhase("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [start]);

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

  return (
    <div style={overlayStyle} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={dialogStyle}>
        {/* 标题栏 */}
        <div style={headerStyle}>
          <span style={{ fontSize: 15, fontWeight: 600 }}>
            🎬 导出视频{projectName ? ` — ${projectName}` : ""}
          </span>
          <button onClick={onClose} style={closeBtnStyle} title="关闭">✕</button>
        </div>

        {/* 内容区 */}
        <div style={{ padding: "20px 24px" }}>
          {phase === "idle" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <p style={{ color: "#8b95a5", fontSize: 13, marginBottom: 20 }}>
                将当前时间线渲染为 MP4 视频文件
              </p>
              <button onClick={handleStart} style={primaryBtnStyle}>
                开始渲染
              </button>
            </div>
          )}

          {phase === "rendering" && (
            <div style={{ padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#cdd5df" }}>
                  {status?.status === "pending" ? "排队中…" : "渲染中…"}
                </span>
                <span style={{ fontSize: 13, color: "#e94560", fontWeight: 600 }}>
                  {progress}%
                </span>
              </div>
              {/* 进度条 */}
              <div style={progressTrackStyle}>
                <div style={{
                  ...progressFillStyle,
                  width: `${Math.max(progress, 2)}%`,
                }} />
              </div>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button onClick={handleCancel} style={cancelBtnStyle}>
                  取消渲染
                </button>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <p style={{ color: "#cdd5df", fontSize: 14, marginBottom: 4 }}>渲染完成！</p>
              {status?.output_path && (
                <p style={{ color: "#8b95a5", fontSize: 12, marginBottom: 16, wordBreak: "break-all" }}>
                  {status.output_path}
                </p>
              )}
              <a href={downloadUrl ?? "#"} download style={{ textDecoration: "none" }}>
                <button style={primaryBtnStyle}>⬇ 下载 MP4</button>
              </a>
            </div>
          )}

          {phase === "error" && (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>❌</div>
              <p style={{ color: "#e94560", fontSize: 14, marginBottom: 16 }}>{errorMsg}</p>
              <button onClick={() => { setPhase("idle"); setErrorMsg(""); }} style={cancelBtnStyle}>
                重试
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 样式 ──────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0, 0, 0, 0.7)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const dialogStyle: React.CSSProperties = {
  background: "#1a1a2e",
  borderRadius: 12,
  border: "1px solid #2a2a3e",
  width: 420,
  maxWidth: "90vw",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "16px 24px",
  borderBottom: "1px solid #2a2a3e",
  color: "#f2f5f8",
};

const closeBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#8b95a5",
  fontSize: 16,
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: 4,
};

const primaryBtnStyle: React.CSSProperties = {
  background: "#e94560",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 28px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  background: "transparent",
  color: "#8b95a5",
  border: "1px solid #3a3a4e",
  borderRadius: 8,
  padding: "8px 24px",
  fontSize: 13,
  cursor: "pointer",
};

const progressTrackStyle: React.CSSProperties = {
  height: 8,
  background: "#0f0f1a",
  borderRadius: 4,
  overflow: "hidden",
};

const progressFillStyle: React.CSSProperties = {
  height: "100%",
  background: "linear-gradient(90deg, #e94560, #ff6b81)",
  borderRadius: 4,
  transition: "width 0.5s ease",
};
