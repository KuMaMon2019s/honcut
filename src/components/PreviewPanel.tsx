// PreviewPanel.tsx — Canvas 预览引擎
// R7: 用 <canvas> + requestAnimationFrame + ctx.drawImage(video) 替代纯 <video>
// 隐藏 video 元素负责解码，canvas 负责渲染，避免黑屏/闪烁问题
// 快捷键: playing/playDirection 状态由父组件控制（useHotkeys 统一管理）

import { useRef, useState, useEffect, useCallback } from "react";
import { type Clip } from "../api/client";

interface PreviewPanelProps {
  clips: Clip[];
  playhead: number;
  fps: number;
  totalFrames: number;
  selectedClip: Clip | null;
  playing: boolean;
  playDirection: 1 | -1;
  onSelectClip: (c: Clip | null) => void;
  onPlayheadChange: (frame: number) => void;
  onPlayingChange: (playing: boolean) => void;
}

function frameToTime(frames: number, fps: number): string {
  const totalSec = Math.floor(frames / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clipAtPlayhead(clips: Clip[], playhead: number): Clip | null {
  const hits = clips.filter(
    c => c.start_frame <= playhead && playhead < c.start_frame + c.duration_frames,
  );
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.track.localeCompare(b.track));
  return hits[hits.length - 1];
}

const btnCls = "w-7 h-7 rounded flex items-center justify-center text-text-muted hover:text-text hover:bg-hover text-sm";

export default function PreviewPanel({
  clips, playhead, fps, totalFrames, selectedClip,
  playing, playDirection,
  onSelectClip, onPlayheadChange, onPlayingChange,
}: PreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoError, setVideoError] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const rafRef = useRef<number>(0);
  const drawRafRef = useRef<number>(0);
  const lastSeekRef = useRef<number>(0);

  const activeClip = clipAtPlayhead(clips, playhead);
  const isVideo = activeClip?.kind === "video";
  const isAudio = activeClip?.kind === "audio";

  // 切换 clip 时重置状态
  useEffect(() => {
    setVideoError(false);
    setVideoReady(false);
  }, [activeClip?.id]);

  // Canvas 渲染循环：持续把 video 帧绘制到 canvas
  useEffect(() => {
    if (!isVideo || videoError) {
      if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current);
      return;
    }

    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.readyState >= 2) {
        const ctx = c.getContext("2d");
        if (ctx) {
          // 匹配 canvas 尺寸到 video 原始尺寸（首次或尺寸变化时）
          if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
            c.width = v.videoWidth || 640;
            c.height = v.videoHeight || 360;
          }
          ctx.drawImage(v, 0, 0, c.width, c.height);
        }
      }
      drawRafRef.current = requestAnimationFrame(draw);
    };
    drawRafRef.current = requestAnimationFrame(draw);
    return () => { if (drawRafRef.current) cancelAnimationFrame(drawRafRef.current); };
  }, [isVideo, videoError, activeClip?.id]);

  // 帧精确 seek
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip || !isVideo || videoError) return;
    const targetSec = (playhead - activeClip.start_frame + activeClip.src_in_frame) / fps;
    const now = performance.now();
    if (Math.abs(v.currentTime - targetSec) > 0.1 && now - lastSeekRef.current > 100) {
      lastSeekRef.current = now;
      v.currentTime = targetSec;
    }
  }, [playhead, activeClip?.id, isVideo, fps, videoError]);

  // 播放/暂停 video 元素
  useEffect(() => {
    const v = videoRef.current;
    if (!v || videoError) return;
    if (playing && isVideo) v.play().catch(() => {});
    else v.pause();
  }, [playing, isVideo, activeClip?.id, videoError]);

  // rAF 播放循环（正向/反向穿梭）
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    let last = performance.now();
    const frameDuration = 1000 / fps;

    const tick = (now: number) => {
      if (now - last >= frameDuration) {
        last = now;
        const nextFrame = playhead + playDirection;
        if (nextFrame < 0 || nextFrame >= totalFrames) {
          onPlayingChange(false);
          onPlayheadChange(Math.max(0, Math.min(totalFrames - 1, nextFrame)));
          return;
        }
        onPlayheadChange(nextFrame);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, playhead, fps, totalFrames, playDirection, onPlayheadChange, onPlayingChange]);

  const togglePlay = useCallback(() => {
    if (playhead >= totalFrames - 1) {
      onPlayheadChange(0);
      onPlayingChange(true);
    } else {
      onPlayingChange(!playing);
    }
  }, [playhead, totalFrames, playing, onPlayheadChange, onPlayingChange]);

  const stepFrame = useCallback((delta: number) => {
    onPlayingChange(false);
    onPlayheadChange(Math.max(0, Math.min(totalFrames - 1, playhead + delta)));
  }, [playhead, totalFrames, onPlayheadChange, onPlayingChange]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-bg">
      {/* 预览区域 */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
        {/* 无素材 */}
        {!activeClip && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-2xl opacity-30">🎬</span>
            <span className="text-text-dim/50 text-sm">
              无素材 @ {frameToTime(playhead, fps)}
            </span>
          </div>
        )}

        {/* 视频预览：隐藏 video + 可见 canvas */}
        {activeClip && isVideo && activeClip.src && !videoError && (
          <>
            <video
              ref={videoRef}
              src={activeClip.src}
              className="hidden"
              muted={false}
              onError={() => setVideoError(true)}
              onCanPlay={() => setVideoReady(true)}
              preload="auto"
              crossOrigin="anonymous"
            />
            <canvas
              ref={canvasRef}
              onClick={() => onSelectClip(activeClip)}
              className="max-h-full w-full object-contain cursor-pointer"
              style={{ imageRendering: "auto" }}
            />
            {!videoReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <span className="text-text-dim text-sm animate-pulse">加载视频…</span>
              </div>
            )}
          </>
        )}

        {/* 视频加载失败回退 */}
        {activeClip && isVideo && videoError && (
          <div className="flex flex-col items-center gap-3 p-6">
            <span className="text-3xl">⚠️</span>
            <span className="text-text-dim text-sm text-center">视频加载失败</span>
            <span className="text-text-dim/60 text-xs text-center max-w-[200px] truncate">
              {activeClip.src || activeClip.name}
            </span>
            <button
              onClick={() => { setVideoError(false); setVideoReady(false); }}
              className="text-xs text-accent hover:underline"
            >
              重试
            </button>
          </div>
        )}

        {/* 音频预览 */}
        {activeClip && isAudio && (
          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl">🎵</span>
            <span className="text-text-dim text-sm">{activeClip.name}</span>
            {activeClip.src && (
              <audio controls src={activeClip.src} className="mt-2 w-64" />
            )}
          </div>
        )}

        {/* 其他类型 */}
        {activeClip && !isVideo && !isAudio && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-3xl">📦</span>
            <span className="text-text-dim text-xs">{activeClip.name}</span>
          </div>
        )}

        {/* Clip 信息叠加层 */}
        {activeClip && showInfo && (
          <div className="absolute top-2 left-2 bg-black/70 rounded px-2 py-1 text-[10px] text-white/80 space-y-0.5 pointer-events-none">
            <div className="font-medium text-white/90">{activeClip.name}</div>
            <div>{activeClip.track} · {activeClip.kind}</div>
            <div>
              {activeClip.start_frame}f → {activeClip.start_frame + activeClip.duration_frames}f
              ({activeClip.duration_frames}f)
            </div>
          </div>
        )}

        {/* 播放状态指示 */}
        {playing && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 rounded px-2 py-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[10px] text-white/70">
              {playDirection === 1 ? "PLAY ▶" : "◀ REV"}
            </span>
          </div>
        )}
      </div>

      {/* 底部控制条 */}
      <div className="h-10 shrink-0 bg-panel border-t border-border flex items-center gap-2 px-3">
        <button className={btnCls} onClick={() => stepFrame(-1)} title="后退1帧 (←)">⏮</button>
        <button
          className={`${btnCls} ${playing ? "text-accent" : ""}`}
          onClick={togglePlay}
          title={playing ? "暂停 (Space)" : "播放 (Space)"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button className={btnCls} onClick={() => stepFrame(1)} title="前进1帧 (→)">⏭</button>

        {playing && (
          <span className="text-[10px] text-accent font-mono ml-1">
            {playDirection === 1 ? "L" : "J"}
          </span>
        )}

        <button
          className={`${btnCls} ml-2 ${showInfo ? "text-accent" : ""}`}
          onClick={() => setShowInfo(v => !v)}
          title="切换信息叠加层"
        >
          ℹ
        </button>

        <span className="text-[11px] text-text-dim tabular-nums ml-auto">
          {playhead}f / {totalFrames}f
        </span>
        <span className="text-[11px] text-text-dim tabular-nums">
          {frameToTime(playhead, fps)} / {frameToTime(totalFrames, fps)}
        </span>
      </div>
    </div>
  );
}
