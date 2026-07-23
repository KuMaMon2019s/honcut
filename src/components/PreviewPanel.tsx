// PreviewPanel.tsx — 增强预览引擎
// 功能：帧精确 seek、错误回退、clip 信息叠加层、播放状态指示
// R7: 修复 <video> 黑屏 + 增加预览可靠性

import { useRef, useState, useEffect, useCallback } from "react";
import { type Clip } from "../api/client";

interface PreviewPanelProps {
  clips: Clip[];
  playhead: number;
  fps: number;
  totalFrames: number;
  selectedClip: Clip | null;
  onSelectClip: (c: Clip | null) => void;
  onPlayheadChange: (frame: number) => void;
}

function frameToTime(frames: number, fps: number): string {
  const totalSec = Math.floor(frames / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// 找到 playhead 所在的 clip（多个命中时取 track 排序最后的）
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
  clips, playhead, fps, totalFrames, selectedClip, onSelectClip, onPlayheadChange,
}: PreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const rafRef = useRef<number>(0);
  const lastSeekRef = useRef<number>(0);

  const activeClip = clipAtPlayhead(clips, playhead);
  const isVideo = activeClip?.kind === "video";
  const isAudio = activeClip?.kind === "audio";

  // 切换 clip 时重置错误/就绪状态
  useEffect(() => {
    setVideoError(false);
    setVideoReady(false);
  }, [activeClip?.id]);

  // 帧精确 seek — 只在偏差 > 0.1s 时纠正，避免频繁 seek 导致卡顿
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip || !isVideo || videoError) return;
    const targetSec = (playhead - activeClip.start_frame + activeClip.src_in_frame) / fps;
    const now = performance.now();
    // 节流：100ms 内不重复 seek
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

  // rAF 播放循环
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
        const nextFrame = playhead + 1;
        if (nextFrame >= totalFrames) {
          setPlaying(false);
          onPlayheadChange(totalFrames - 1);
          return;
        }
        onPlayheadChange(nextFrame);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, playhead, fps, totalFrames, onPlayheadChange]);

  const togglePlay = useCallback(() => {
    if (playhead >= totalFrames - 1) {
      onPlayheadChange(0);
      setPlaying(true);
    } else {
      setPlaying(p => !p);
    }
  }, [playhead, totalFrames, onPlayheadChange]);

  const stepFrame = useCallback((delta: number) => {
    setPlaying(false);
    onPlayheadChange(Math.max(0, Math.min(totalFrames - 1, playhead + delta)));
  }, [playhead, totalFrames, onPlayheadChange]);

  // 键盘快捷键：空格播放/暂停，左右箭头逐帧
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // 不在 input/textarea 中触发
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        stepFrame(e.shiftKey ? -fps : -1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        stepFrame(e.shiftKey ? fps : 1);
      } else if (e.code === "KeyJ") {
        stepFrame(-fps); // J: 后退1秒
      } else if (e.code === "KeyL") {
        stepFrame(fps); // L: 前进1秒
      } else if (e.code === "KeyK") {
        setPlaying(false); // K: 暂停
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [togglePlay, stepFrame, fps]);

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

        {/* 视频预览 */}
        {activeClip && isVideo && activeClip.src && !videoError && (
          <>
            <video
              ref={videoRef}
              src={activeClip.src}
              className="max-h-full w-full object-contain"
              onClick={() => onSelectClip(activeClip)}
              muted={false}
              onError={() => setVideoError(true)}
              onCanPlay={() => setVideoReady(true)}
              preload="auto"
            />
            {/* 加载中指示 */}
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
            <span className="text-text-dim text-sm text-center">
              视频加载失败
            </span>
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
            <span className="text-[10px] text-white/70">PLAY</span>
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

        {/* 信息叠加层开关 */}
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
