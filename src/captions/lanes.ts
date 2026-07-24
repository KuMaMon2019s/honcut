// lanes.ts — 多车道字幕引擎
// 移植自 OpenChatCut src/captions/lanes.ts，适配 honcut Clip

import type { CaptionAnchor, CaptionLayoutPolicy, CaptionPage, CaptionsData, CaptionSourceEntry } from './types';
import { activePage, currentWordIndex, paginate } from './types';
import type { Clip } from '../api/client';
import { resolveEntryWords } from './resolve';
import { orderedCaptionSourceEntries } from './sourceOrder';

export interface LanePage {
  entry: CaptionSourceEntry;
  page: CaptionPage;
  curIdx: number;
}

export interface LaneGroup {
  anchor?: CaptionAnchor;
  offsetXRatio?: number;
  offsetYRatio?: number;
  lanes: LanePage[];
}

const policyOf = (c: CaptionsData): CaptionLayoutPolicy =>
  c.layoutPolicy ?? { mode: 'auto-stack' };

function placementOf(entry: CaptionSourceEntry, policy: CaptionLayoutPolicy): { anchor?: CaptionAnchor; offsetXRatio?: number; offsetYRatio?: number } {
  if (policy.mode === 'manual-slots' && entry.slotId) {
    const slot = (policy.slots ?? []).find((s: any) => s.id === entry.slotId);
    if (slot) return { anchor: slot.anchor, offsetXRatio: slot.offsetXRatio, offsetYRatio: slot.offsetYRatio };
  }
  if (entry.anchor) return { anchor: entry.anchor, offsetXRatio: entry.offsetXRatio, offsetYRatio: entry.offsetYRatio };
  return {};
}

export function buildLaneGroups(captions: CaptionsData, clips: Clip[], fps: number, ms: number, wordsPerPage: number | undefined): LaneGroup[] | null {
  const entries = captions.sourceEntries ? orderedCaptionSourceEntries(captions.sourceEntries) : undefined;
  if (!entries?.length) return null;
  const policy = policyOf(captions);

  const active: Array<{ entry: CaptionSourceEntry; lane: LanePage; order: number }> = [];
  entries.forEach((entry, order) => {
    if (entry.visible === false) return;
    const words = resolveEntryWords(entry, clips, fps);
    if (!words.length) return;
    const maxLines = captions.perSource?.[entry.id]?.maxLines;
    const per = maxLines ? Math.max(1, (wordsPerPage ?? 6) * maxLines) : wordsPerPage;
    const pages = paginate(words, captions.pacing, per);
    const page = activePage(pages, ms);
    if (!page) return;
    active.push({ entry, lane: { entry, page, curIdx: currentWordIndex(page, ms) }, order });
  });
  if (!active.length) return [];

  if (policy.mode === 'single-lane') {
    const cap = Math.max(1, policy.maxVisibleSources ?? 1);
    const picked = [...active]
      .sort((a, b) => (a.entry.priority ?? a.order) - (b.entry.priority ?? b.order))
      .slice(0, cap);
    return [{ lanes: picked.map((p) => p.lane) }];
  }

  const cap = policy.mode === 'auto-stack' ? policy.maxVisibleSources : undefined;
  const capped = cap != null ? active.slice(0, Math.max(1, cap)) : active;
  const groups = new Map<string, LaneGroup>();
  for (const { entry, lane } of capped) {
    const place = placementOf(entry, policy);
    const key = place.anchor ? `${place.anchor}|${place.offsetXRatio ?? 0}|${place.offsetYRatio ?? 0}` : '__block__';
    let g = groups.get(key);
    if (!g) { g = { ...place, lanes: [] }; groups.set(key, g); }
    g.lanes.push(lane);
  }
  return [...groups.values()];
}
