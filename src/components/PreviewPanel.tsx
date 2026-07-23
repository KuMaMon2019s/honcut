// PreviewPanel.tsx — 时间线上方的视频预览区
// 根据播放头位置找到对应 clip 并预览，支持 rAF 播放循环

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
  return `${Math.floor(frames / fps / 60)}:${String(Math.floor(frames / fps % 60)).padStart(2, "0")}`;
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
  const rafRef = useRef<number>(0);

  const activeClip = clipAtPlayhead(clips, playhead);
  const isVideo = activeClip?.kind === "video";
  const isAudio = activeClip?.kind === "audio";

  // 播放时 seek video 到正确位置
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !activeClip || !isVideo) return;
    const targetSec = (playhead - activeClip.start_frame + activeClip.src_in_frame) / fps;
    if (Math.abs(v.currentTime - targetSec) > 0.3) {
      v.currentTime = targetSec;
    }
  }, [playhead, activeClip?.id, isVideo, fps]);

  // 播放/暂停 video 元素
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing && isVideo) v.play().catch(() => {});
    else v.pause();
  }, [playing, isVideo, activeClip?.id]);

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
        onPlayheadChange(playhead + 1);
        if (playhead + 1 >= totalFrames) {
          setPlaying(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, playhead, fps, totalFrames, onPlayheadChange]);

  const togglePlay = useCallback(() => {
    if (playhead >= totalFrames) {
      onPlayheadChange(0);
      setPlaying(true);
    } else {
      setPlaying(p => !p);
    }
  }, [playhead, totalFrames, onPlayheadChange]);

  const stepFrame = useCallback((delta: number) => {
    setPlaying(false);
    onPlayheadChange(Math.max(0, Math.min(totalFrames, playhead + delta)));
  }, [playhead, totalFrames, onPlayheadChange]);

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-bg">
      {/* 预览区域 */}
      <div className="flex-1 flex items-center justify-center bg-black overflow-hidden relative">
        {!activeClip && (
          <span className="text-text-dim/50 text-sm">
            无素材 @ {frameToTime(playhead, fps)}
          </span>
        )}

        {activeClip && isVideo && activeClip.src && (
          <video
            ref={videoRef}
            src={activeClip.src}
            className="max-h-full w-full object-contain"
            onClick={() => onSelectClip(activeClip)}
            muted={false}
          />
        )}

        {activeClip && isAudio && (
          <div className="flex flex-col items-center gap-3">
            <span className="text-4xl">🎵</span>
            <span className="text-text-dim text-sm">{activeClip.name}</span>
          </div>
        )}

        {activeClip && !isVideo && !isAudio && (
          <div className="flex flex-col items-center gap-2">
            <span className="text-3xl">📦</span>
            <span className="text-text-dim text-xs">{activeClip.name}</span>
          </div>
        )}
      </div>

      {/* 底部控制条 */}
      <div className="h-10 shrink-0 bg-panel border-t border-border flex items-center gap-2 px-3">
        <button className={btnCls} onClick={() => stepFrame(-1)} title="后退1帧">⏮</button>
        <button
          className={`${btnCls} ${playing ? "text-accent" : ""}`}
          onClick={togglePlay}
          title={playing ? "暂停" : "播放"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button className={btnCls} onClick={() => stepFrame(1)} title="前进1帧">⏭</button>

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
