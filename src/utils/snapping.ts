// snapping.ts — 吸附引擎
// 收集吸附点 + 帧吸附计算

import type { ClipData } from "../components/ClipBlock";
import type { Marker } from "../api/client";

/** 收集所有吸附目标帧 */
export function collectSnapPoints(
  clips: ClipData[],
  playhead: number,
  markers: Marker[],
): number[] {
  const points = new Set<number>();
  points.add(0);
  points.add(playhead);
  for (const clip of clips) {
    points.add(clip.startFrame);
    points.add(clip.startFrame + clip.durationInFrames);
  }
  for (const m of markers) {
    points.add(m.frame);
  }
  return [...points];
}

/** 将 frame 吸附到最近的 snapPoint（距离 < thresholdFrames 时吸附） */
export function snapToFrame(
  frame: number,
  snapPoints: number[],
  thresholdFrames: number,
): { frame: number; snapped: boolean; snapTarget: number | null } {
  let best: number | null = null;
  let bestDist = Infinity;
  for (const p of snapPoints) {
    const d = Math.abs(frame - p);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  if (best !== null && bestDist <= thresholdFrames) {
    return { frame: best, snapped: true, snapTarget: best };
  }
  return { frame, snapped: false, snapTarget: null };
}

/** 吸附 clip 的起始帧（同时检查 newStart 和 newEnd） */
export function snapClipStart(
  newStart: number,
  durationFrames: number,
  snapPoints: number[],
  thresholdFrames: number,
): { frame: number; snapped: boolean; snapTarget: number | null } {
  const startResult = snapToFrame(newStart, snapPoints, thresholdFrames);
  const newEnd = newStart + durationFrames;
  const endResult = snapToFrame(newEnd, snapPoints, thresholdFrames);

  // 优先选择距离更近的吸附
  if (startResult.snapped && endResult.snapped) {
    const startDist = Math.abs(newStart - startResult.frame);
    const endDist = Math.abs(newEnd - endResult.frame);
    if (startDist <= endDist) return startResult;
    // 吸附 end → 反推 start
    return { frame: endResult.frame - durationFrames, snapped: true, snapTarget: endResult.frame };
  }
  if (startResult.snapped) return startResult;
  if (endResult.snapped) {
    return { frame: endResult.frame - durationFrames, snapped: true, snapTarget: endResult.frame };
  }
  return { frame: newStart, snapped: false, snapTarget: null };
}