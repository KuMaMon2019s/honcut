// ThumbnailStrip.tsx — 视频缩略图胶片条
// 从视频 src 中均匀截取帧，渲染为等宽缩略图铺满 clip 宽度

import { useEffect, useState } from "react";

// 全局缓存：src → dataURL[]
const thumbCache = new Map<string, string[]>();

interface ThumbnailStripProps {
  src: string;
  durationInFrames: number;
  fps: number;
  width: number; // 像素宽度
}

const THUMB_INTERVAL = 80; // 每个缩略图约 80px 宽
const THUMB_W = 64;        // 截取帧宽度
const THUMB_H = 36;        // 截取帧高度 (16:9)

export default function ThumbnailStrip({ src, durationInFrames, fps, width }: ThumbnailStripProps) {
  const [thumbs, setThumbs] = useState<string[] | null>(() => thumbCache.get(src) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (thumbCache.has(src)) {
      setThumbs(thumbCache.get(src)!);
      return;
    }

    let cancelled = false;
    const count = Math.max(1, Math.ceil(width / THUMB_INTERVAL));
    const durationSec = durationInFrames / fps;

    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "auto";
    video.src = src;

    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d");

    const results: string[] = [];
    let idx = 0;

    const captureNext = () => {
      if (cancelled || !ctx) return;
      if (idx >= count) {
        thumbCache.set(src, results);
        setThumbs([...results]);
        video.src = "";
        return;
      }
      const t = count === 1 ? 0 : (idx / (count - 1)) * Math.max(0, durationSec - 0.1);
      video.currentTime = Math.min(t, durationSec);
    };

    video.addEventListener("loadeddata", () => {
      if (!cancelled) captureNext();
    });

    video.addEventListener("seeked", () => {
      if (cancelled || !ctx) return;
      try {
        ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
        results.push(canvas.toDataURL("image/jpeg", 0.6));
      } catch {
        results.push("");
      }
      idx++;
      captureNext();
    });

    video.addEventListener("error", () => {
      if (!cancelled) setFailed(true);
    });

    // 超时保护：10秒后放弃
    const timer = setTimeout(() => {
      if (!cancelled && results.length < count) {
        cancelled = true;
        if (results.length > 0) {
          thumbCache.set(src, results);
          setThumbs([...results]);
        } else {
          setFailed(true);
        }
        video.src = "";
      }
    }, 10000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      video.src = "";
    };
  }, [src, durationInFrames, fps, width]);

  if (failed || (!thumbs && !src)) {
    return null; // fallback: ClipBlock 自身背景色
  }

  if (!thumbs || thumbs.length === 0) {
    return (
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: 0.15,
      }}>
        <span style={{ fontSize: 10, color: "#888" }}>…</span>
      </div>
    );
  }

  const thumbWidth = width / thumbs.length;

  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      overflow: "hidden",
      borderRadius: "inherit",
    }}>
      {thumbs.map((dataUrl, i) => (
        dataUrl ? (
          <img
            key={i}
            src={dataUrl}
            alt=""
            draggable={false}
            style={{
              width: thumbWidth,
              height: "100%",
              objectFit: "cover",
              flexShrink: 0,
              pointerEvents: "none",
            }}
          />
        ) : (
          <div key={i} style={{ width: thumbWidth, flexShrink: 0, background: "#222" }} />
        )
      ))}
    </div>
  );
}
