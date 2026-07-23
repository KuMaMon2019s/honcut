// MediaPlayer.tsx — 可复用媒体播放器 (video/audio)
// 支持: play/pause · seek · volume · fullscreen · 键盘快捷键 · 无障碍
//
// 集成方式: <MediaPlayer src={url} kind="video" title="片段名" onClose={fn} />

import { useRef, useState, useEffect, useCallback } from "react";

interface MediaPlayerProps {
  src: string;
  kind: "video" | "audio";
  title?: string;
  poster?: string;
  onClose?: () => void;
  autoPlay?: boolean;
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── 样式常量 ──
const BG = "#111";
const SURFACE = "#1a1a1a";
const BORDER = "#333";
const ACCENT = "#3b82f6";
const TEXT = "#eee";
const MUTED = "#888";

const btnBase: React.CSSProperties = {
  background: "none",
  border: "none",
  color: TEXT,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 4,
  transition: "background 0.15s",
};

export default function MediaPlayer({ src, kind, title, poster, onClose, autoPlay }: MediaPlayerProps) {
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buffered, setBuffered] = useState(0);

  // ── 媒体事件绑定 ──
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onDurationChange = () => setDuration(el.duration || 0);
    const onVolumeChange = () => { setVolumeState(el.volume); setMuted(el.muted); };
    const onProgress = () => {
      if (el.buffered.length > 0) setBuffered(el.buffered.end(el.buffered.length - 1));
    };
    const onEnded = () => setPlaying(false);

    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("volumechange", onVolumeChange);
    el.addEventListener("progress", onProgress);
    el.addEventListener("ended", onEnded);

    if (autoPlay) el.play().catch(() => {});

    return () => {
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("volumechange", onVolumeChange);
      el.removeEventListener("progress", onProgress);
      el.removeEventListener("ended", onEnded);
    };
  }, [src, autoPlay]);

  // ── 全屏监听 ──
  useEffect(() => {
    const onFS = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFS);
    return () => document.removeEventListener("fullscreenchange", onFS);
  }, []);

  // ── 控制栏自动隐藏 (仅 video) ──
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (kind === "video" && playing) {
      hideTimer.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [kind, playing]);

  const showControlsNow = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (kind === "video") { setShowControls(true); scheduleHide(); }
    else setShowControls(true);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [kind, playing, scheduleHide]);

  // ── 控制方法 ──
  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    el.paused ? el.play() : el.pause();
  };

  const seek = (time: number) => {
    const el = mediaRef.current;
    if (!el || !isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(time, el.duration));
    setCurrentTime(el.currentTime);
  };

  const setVolume = (v: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.volume = v;
    el.muted = v === 0;
    setVolumeState(v);
    setMuted(v === 0);
  };

  const toggleMute = () => {
    const el = mediaRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted && el.volume === 0) { el.volume = 1; setVolumeState(1); }
  };

  const toggleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await el.requestFullscreen();
    }
  };

  // ── 键盘快捷键 ──
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    const el = mediaRef.current;
    if (!el) return;
    switch (e.key) {
      case " ": e.preventDefault(); togglePlay(); break;
      case "ArrowLeft": e.preventDefault(); seek(el.currentTime - 5); break;
      case "ArrowRight": e.preventDefault(); seek(el.currentTime + 5); break;
      case "ArrowUp": e.preventDefault(); setVolume(Math.min(1, el.volume + 0.1)); break;
      case "ArrowDown": e.preventDefault(); setVolume(Math.max(0, el.volume - 0.1)); break;
      case "m": case "M": toggleMute(); break;
      case "f": case "F": toggleFullscreen(); break;
      case "Escape": onClose?.(); break;
    }
  }, [onClose]);

  const isVideo = kind === "video";
  const bufferedRatio = duration > 0 ? buffered / duration : 0;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseMove={showControlsNow}
      onMouseLeave={() => kind === "video" && playing && setShowControls(false)}
      style={{
        position: "relative",
        background: BG,
        borderRadius: 8,
        overflow: "hidden",
        border: `1px solid ${BORDER}`,
        width: "100%",
        maxWidth: 900,
        margin: "0 auto",
        outline: "none",
        boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
      }}
      role="region"
      aria-label={title ? `播放器: ${title}` : "媒体播放器"}
    >
      {/* ── 顶栏 (标题 + 关闭) ── */}
      {(title || onClose) && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 12px", background: SURFACE, borderBottom: `1px solid ${BORDER}`,
        }}>
          <span style={{ fontSize: 13, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title ?? ""}
          </span>
          {onClose && (
            <button onClick={onClose} style={{ ...btnBase, width: 28, height: 28, fontSize: 16, color: MUTED }}
              aria-label="关闭播放器">
              ✕
            </button>
          )}
        </div>
      )}

      {/* ── 媒体区域 ── */}
      <div
        style={{ position: "relative", background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={togglePlay}
      >
        {isVideo ? (
          <video
            ref={mediaRef as React.RefObject<HTMLVideoElement>}
            src={src}
            poster={poster}
            preload="metadata"
            style={{ width: "100%", maxHeight: "60vh", display: "block" }}
            playsInline
          />
        ) : (
          <div style={{ width: "100%", padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            {/* 音频可视化条 */}
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
              {Array.from({ length: 32 }, (_, i) => {
                const h = playing ? 12 + Math.sin(Date.now() / 200 + i * 0.5) * 12 + Math.random() * 28 : 8 + (i % 5) * 2;
                return (
                  <div key={i} style={{
                    width: 6, height: playing ? h : 8 + (i % 5) * 2,
                    background: ACCENT, borderRadius: 2,
                    transition: "height 0.15s",
                    opacity: 0.6 + (i % 3) * 0.15,
                  }} />
                );
              })}
            </div>
            <span style={{ fontSize: 13, color: MUTED }}>🎵 {title ?? "音频播放"}</span>

            <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={src} preload="metadata" />
          </div>
        )}

        {/* ── 中央播放/暂停覆盖 (仅 video，暂停或刚加载时显示) ── */}
        {isVideo && !playing && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.3)", cursor: "pointer",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontSize: 24, color: BG, marginLeft: 4 }}>▶</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 控制栏 ── */}
      <div style={{
        background: SURFACE,
        padding: "4px 8px",
        opacity: showControls ? 1 : 0,
        transition: "opacity 0.3s",
        ...(isVideo && { position: "absolute", bottom: title ? undefined : 0, left: 0, right: 0 }),
      }}>
        {/* Seek 条 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: MUTED, minWidth: 36, textAlign: "center" }}>
            {fmtTime(currentTime)}
          </span>

          <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 3, position: "relative", cursor: "pointer" }}
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / rect.width;
              seek(ratio * duration);
            }}
            role="slider"
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
            tabIndex={0}
          >
            {/* 缓冲进度 */}
            <div style={{
              position: "absolute", left: 0, top: 0,
              width: `${bufferedRatio * 100}%`, height: "100%",
              background: "#444", borderRadius: 3,
            }} />
            {/* 播放进度 */}
            <div style={{
              position: "absolute", left: 0, top: 0,
              width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, height: "100%",
              background: ACCENT, borderRadius: 3,
            }} />
            {/* 拖拽手柄 */}
            <div style={{
              position: "absolute", left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              top: "50%", transform: "translate(-50%, -50%)",
              width: 12, height: 12, borderRadius: "50%", background: TEXT,
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }} />
          </div>

          <span style={{ fontSize: 11, color: MUTED, minWidth: 36, textAlign: "center" }}>
            {fmtTime(duration)}
          </span>
        </div>

        {/* 按钮行 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {/* 播放/暂停 */}
          <button onClick={togglePlay} style={{ ...btnBase, width: 32, height: 32, fontSize: 16 }}
            aria-label={playing ? "暂停" : "播放"}>
            {playing ? "⏸" : "▶"}
          </button>

          {/* 音量 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={toggleMute} style={{ ...btnBase, width: 28, height: 28, fontSize: 14 }}
              aria-label={muted || volume === 0 ? "取消静音" : "静音"}>
              {muted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
            </button>
            <input
              type="range"
              min={0} max={1} step={0.05} value={muted ? 0 : volume}
              onChange={e => setVolume(Number(e.target.value))}
              aria-label="音量"
              style={{
                width: 64, height: 4, accentColor: ACCENT,
                background: BORDER, borderRadius: 2, cursor: "pointer",
              }}
            />
          </div>

          {/* 弹性空间 */}
          <div style={{ flex: 1 }} />

          {/* 全屏 (仅 video) */}
          {isVideo && (
            <button onClick={toggleFullscreen} style={{ ...btnBase, width: 32, height: 32, fontSize: 16 }}
              aria-label={isFullscreen ? "退出全屏" : "全屏"}>
              {isFullscreen ? "⛶" : "⛶"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
