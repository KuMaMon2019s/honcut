// resolve.ts — 字幕词流解析（适配 honcut REST API）
// 移植自 OpenChatCut src/captions/resolve.ts
// 适配: 用 honcut Clip(props JSON) 替代 TimelineItem，去掉 transcript/edit 依赖
// honcut 无转写编辑(删词/压静音)，词流直接按 clip.start_frame 投影到时间线

import type { Clip } from '../api/client';
import type { CaptionsData, CaptionSourceEntry, CaptionWordOverride, TranscriptWord } from './types';
import { orderedCaptionSourceEntries } from './sourceOrder';

// ── 从 honcut Clip.props 提取转写词 ─────────────────────────────────────

export function clipTranscriptWords(clip: Clip): TranscriptWord[] {
  try {
    const props = JSON.parse(clip.props || '{}');
    return props.transcript?.words ?? [];
  } catch {
    return [];
  }
}

// 源 ms 词 → 时间线 ms（按 clip.start_frame 偏移）
function projectWords(words: TranscriptWord[], clip: Clip, fps: number): TranscriptWord[] {
  const offsetMs = (clip.start_frame / fps) * 1000;
  return words.map((w) => ({ ...w, start: w.start + offsetMs, end: w.end + offsetMs }));
}

// ── 多源合并 ────────────────────────────────────────────────────────────

function mergedSourceClips(captions: CaptionsData, clips: Clip[]): Clip[] | undefined {
  if (captions.sourceEntries?.length) {
    const seen = new Set<string>();
    const found: Clip[] = [];
    for (const e of orderedCaptionSourceEntries(captions.sourceEntries)) {
      if (e.visible === false || seen.has(e.itemId)) continue;
      const it = clips.find((x) => x.id === e.itemId);
      if (it && clipTranscriptWords(it).length) { seen.add(e.itemId); found.push(it); }
    }
    return found.length ? found : undefined;
  }
  if (captions.sourceMode === 'timeline') {
    const all = clips.filter((c) => clipTranscriptWords(c).length > 0);
    return all.length ? [...all].sort((a, b) => a.start_frame - b.start_frame || a.id.localeCompare(b.id)) : undefined;
  }
  if (captions.sources?.length) {
    const found = captions.sources
      .map((id) => clips.find((c) => c.id === id))
      .filter((c): c is Clip => !!c && clipTranscriptWords(c).length > 0);
    return found.length ? found : undefined;
  }
  return undefined;
}

function mergeWords(sourceClips: Clip[], fps: number): TranscriptWord[] {
  const all: TranscriptWord[] = [];
  for (const c of sourceClips) {
    all.push(...projectWords(clipTranscriptWords(c), c, fps));
  }
  return all.sort((a, b) => a.start - b.start);
}

// ── 单车道词流解析 ──────────────────────────────────────────────────────

export function resolveEntryWords(entry: CaptionSourceEntry, clips: Clip[], fps: number): TranscriptWord[] {
  const clip = clips.find((c) => c.id === entry.itemId);
  if (!clip) return [];
  const words = clipTranscriptWords(clip);
  if (!words.length) return [];
  return projectWords(words, clip, fps);
}

// ── 主解析 ──────────────────────────────────────────────────────────────

export function resolveCaptionWords(captions: CaptionsData, clips: Clip[], fps: number): TranscriptWord[] {
  const merged = mergedSourceClips(captions, clips);
  if (merged) return mergeWords(merged, fps);

  const item = captions.sourceItemId ? clips.find((c) => c.id === captions.sourceItemId) : undefined;
  if (item) {
    const words = clipTranscriptWords(item);
    if (words.length) return projectWords(words, item, fps);
  }

  const offMs = ((captions.offsetFrames ?? 0) / fps) * 1000;
  return (captions.words ?? []).map((w) => ({ ...w, start: w.start + offMs, end: w.end + offMs }));
}

export function resolveCaptionWordIndices(captions: CaptionsData, clips: Clip[], fps: number): number[] {
  const merged = mergedSourceClips(captions, clips);
  if (merged) {
    const count = merged.reduce((n, c) => n + clipTranscriptWords(c).length, 0);
    return Array.from({ length: count }, (_, i) => i);
  }

  const item = captions.sourceItemId ? clips.find((c) => c.id === captions.sourceItemId) : undefined;
  if (item) {
    const words = clipTranscriptWords(item);
    if (words.length) return words.map((_, i) => i);
  }

  return (captions.words ?? []).map((_, i) => i);
}

// ── 逐词覆盖 ────────────────────────────────────────────────────────────

export function applyWordOverrides(
  words: TranscriptWord[],
  indices: number[],
  overrides: Record<number, CaptionWordOverride> | undefined,
): { words: TranscriptWord[]; breakBefore: Set<number> } {
  if (!overrides || Object.keys(overrides).length === 0) return { words, breakBefore: new Set() };
  const out: TranscriptWord[] = [];
  const breakBefore = new Set<number>();
  for (let j = 0; j < words.length; j++) {
    const ov = overrides[indices[j]];
    if (ov?.hidden) continue;
    if (ov?.forceBreak && out.length > 0) breakBefore.add(out.length);
    out.push(ov?.text ? { ...words[j], text: ov.text } : words[j]);
  }
  return { words: out, breakBefore };
}
