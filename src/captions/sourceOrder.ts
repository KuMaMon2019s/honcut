// sourceOrder.ts — 多车道字幕源排序
// 移植自 OpenChatCut src/captions/sourceOrder.ts（原样保留）

import type { CaptionSourceEntry } from './types';

const finiteOrder = (entry: CaptionSourceEntry): number | undefined => {
  const value = entry.trackOrder;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
};

export function orderedCaptionSourceEntries(entries: readonly CaptionSourceEntry[]): CaptionSourceEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, order: finiteOrder(entry) ?? index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ entry }) => entry);
}

export function normalizeCaptionSourceEntries(entries: readonly CaptionSourceEntry[]): CaptionSourceEntry[] {
  return orderedCaptionSourceEntries(entries).map((entry, trackOrder) => ({ ...entry, trackOrder }));
}

export function moveCaptionSourceEntry(
  entries: readonly CaptionSourceEntry[],
  sourceId: string,
  trackOrder: number,
): CaptionSourceEntry[] {
  const next = normalizeCaptionSourceEntries(entries);
  const from = next.findIndex((entry) => entry.id === sourceId);
  if (from < 0) return next;
  const [entry] = next.splice(from, 1);
  const to = Math.max(0, Math.min(next.length, Math.floor(trackOrder)));
  next.splice(to, 0, entry);
  return next.map((candidate, order) => ({ ...candidate, trackOrder: order }));
}
