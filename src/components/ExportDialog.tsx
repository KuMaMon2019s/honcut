// ExportDialog.tsx — 渲染导出对话框
// 提交渲染任务 → 轮询状态 → 下载产物
// Tailwind v4 石墨主题

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={e => { if (e.target === e.currentTarget && phase !== "rendering") onClose(); }}
    >
      <div className="relative w-[420px] max-w-[90vw] bg-panel border border-border rounded-xl shadow-2xl">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
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
            <div className="text-center py-4">
              <p className="text-text-dim text-[13px] mb-5">
                将当前时间线渲染为 MP4 视频文件
              </p>
              <button
                onClick={handleStart}
                className="w-full py-2.5 rounded-md text-sm font-semibold bg-accent text-on-accent hover:bg-accent-deep transition-colors"
              >
                开始渲染
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
                  ⬇ 下载 MP4
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
