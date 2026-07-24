// captionUtils.ts — 字幕工具函数

import type { CaptionCue } from "./types";

/** 帧 → MM:SS:FF 时间码 */
export function frameToTimecode(frame: number, fps: number): string {
  const totalSec = Math.floor(frame / fps);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const f = frame % fps;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

/** 返回在指定帧活跃的所有字幕（按 start_frame 排序） */
export function cuesAtFrame(cues: CaptionCue[], frame: number): CaptionCue[] {
  return cues
    .filter(c => c.start_frame <= frame && frame < c.start_frame + c.duration_frames)
    .sort((a, b) => a.start_frame - b.start_frame);
}

/** 检测两个字幕是否时间重叠 */
export function cuesOverlap(a: CaptionCue, b: CaptionCue): boolean {
  const aEnd = a.start_frame + a.duration_frames;
  const bEnd = b.start_frame + b.duration_frames;
  return a.start_frame < bEnd && b.start_frame < aEnd;
}
