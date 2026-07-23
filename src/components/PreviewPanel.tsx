// PreviewPanel.tsx — 预览面板
// 显示选中片段或播放头位置的媒体预览
// Props: clip, fps, playhead, projectId

import { useRef, useState, useEffect, useCallback } from "react";
import { type ClipData } from "./ClipBlock";

interface PreviewPanelProps {
  clip: ClipData | null;
  fps: number;
  playhead: number;
  projectId: string;
}

function frameToTimecode(f: number, fps: number): string {
  const totalSec = Math.floor(f / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const fr = f % fps;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${fr.toString().padStart(2, "0")}`;
}

export default function PreviewPanel({ clip, fps, playhead, projectId }: PreviewPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [error, setError] = useState("");

  // 当选中片段变化时重置
  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setError("");
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [clip?.id]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      v.play().catch(() => setError("播放失败"));
      setPlaying(true);
    }
  }, [playing]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
  };

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        const v = videoRef.current;
        if (v) { v.currentTime = Math.max(0, v.currentTime - 1 / fps); setCurrentTime(v.currentTime); }
      }
      if (e.code === "ArrowRight") {
        e.preventDefault();
        const v = videoRef.current;
        if (v) { v.currentTime = Math.min(duration, v.currentTime + 1 / fps); setCurrentTime(v.currentTime); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, fps, duration]);

  const isVideo = clip?.kind === "video" || clip?.kind === "image";
  const isAudio = clip?.kind === "audio";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 标题 */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid #2a2a2a",
        fontSize: 12, fontWeight: 600, color: "#aaa",
        display: "flex", alignItems: "center", gap: 6,
      }}>
        🖥️ 预览
        {clip && (
          <span style={{ fontSize: 10, color: "#666", fontWeight: 400, marginLeft: "auto", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {clip.name}
          </span>
        )}
      </div>

      {/* 预览区域 */}
      <div style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
        background: "#0a0a0a", position: "relative", minHeight: 160,
      }}>
        {!clip && (
          <div style={{ color: "#444", fontSize: 13, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>🎬</div>
            选择片段以预览
          </div>
        )}

        {clip && isVideo && clip.src && (
          <video
            ref={videoRef}
            src={clip.src}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
            onLoadedMetadata={e => {
              setDuration((e.target as HTMLVideoElement).duration);
              setError("");
            }}
            onEnded={() => setPlaying(false)}
            onError={() => setError("无法加载媒体")}
            onClick={togglePlay}
          />
        )}

        {clip && isAudio && clip.src && (
          <div style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎵</div>
            <audio
              ref={videoRef as any}
              src={clip.src}
              onTimeUpdate={e => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
              onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
              onEnded={() => setPlaying(false)}
              onError={() => setError("无法加载音频")}
            />
            <div style={{ fontSize: 11, color: "#888" }}>{clip.name}</div>
          </div>
        )}

        {clip && !clip.src && (
          <div style={{ color: "#555", fontSize: 12 }}>无媒体源</div>
        )}

        {error && (
          <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#f87171" }}>
            {error}
          </div>
        )}
      </div>

      {/* 播放控制条 */}
      {clip && clip.src && (
        <div style={{ padding: "8px 12px", borderTop: "1px solid #2a2a2a", flexShrink: 0 }}>
          {/* 进度条 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace", minWidth: 52 }}>
              {frameToTimecode(Math.round(currentTime * fps), fps)}
            </span>
            <input
              type="range" min={0} max={duration || 1} step={0.01}
              value={currentTime}
              onChange={handleSeek}
              style={{ flex: 1, cursor: "pointer", accentColor: "#3b82f6", height: 3 }}
            />
            <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace", minWidth: 52, textAlign: "right" }}>
              {frameToTimecode(Math.round(duration * fps), fps)}
            </span>
          </div>

          {/* 按钮行 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* 上一帧 */}
            <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.max(0, v.currentTime - 1 / fps); setCurrentTime(v.currentTime); } }}
              style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
              title="上一帧 (←)">
              ⏮
            </button>

            {/* 播放/暂停 */}
            <button onClick={togglePlay}
              style={{
                background: "#3b82f6", border: "none", color: "#fff",
                borderRadius: "50%", width: 32, height: 32,
                cursor: "pointer", fontSize: 14,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              title="播放/暂停 (Space)">
              {playing ? "⏸" : "▶"}
            </button>

            {/* 下一帧 */}
            <button onClick={() => { const v = videoRef.current; if (v) { v.currentTime = Math.min(duration, v.currentTime + 1 / fps); setCurrentTime(v.currentTime); } }}
              style={{ background: "none", border: "none", color: "#aaa", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
              title="下一帧 (→)">
              ⏭
            </button>

            {/* 音量 */}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12, color: "#888" }}>🔊</span>
              <input
                type="range" min={0} max={1} step={0.05}
                value={volume}
                onChange={handleVolume}
                style={{ width: 60, cursor: "pointer", accentColor: "#888", height: 3 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
