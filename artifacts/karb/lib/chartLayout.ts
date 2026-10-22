// Pure layout helpers for DayChart. No React imports so they can be tested with node --test.

export const LOW = 3.9;
export const HIGH = 10;
export const HOUR = 3_600_000;
/** Glucose readings further apart than this are not joined by a line. */
export const GLUCOSE_GAP_MS = 20 * 60_000;

export type GlucoseBand = 'low' | 'in' | 'high';
export const glucoseBand = (v: number): GlucoseBand => (v < LOW ? 'low' : v > HIGH ? 'high' : 'in');

/** Actual next local midnight (handles 23h / 25h DST days). */
export function dayEnd(start: number): number {
  const d = new Date(start);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Local hour ticks within [start, end], deduped (DST skipped hour collapses). */
export function hourTicks(start: number, end: number, step = 1): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [];
  const seen = new Set<number>();
  for (let h = 0; h <= 25; h++) {
    const d = new Date(start);
    d.setHours(h, 0, 0, 0);
    const t = d.getTime();
    if (t < start || t > end || seen.has(t)) continue;
    seen.add(t);
    const hr = t === end ? 24 : d.getHours();
    if (hr % step !== 0) continue;
    out.push({ t, label: String(hr).padStart(2, '0') });
  }
  return out;
}

/** Sparse days fit the screen; only genuinely dense days get a modest scroll (max 2.5x). */
export function requiredPlotWidth(lanes: number[][], _start: number, _end: number, _gap: number, minW: number): number {
  const n = Math.max(0, ...lanes.map((t) => t.length));
  if (n <= 24) return minW;
  return Math.min(minW * 2.5, Math.max(minW, n * 5));
}

export type Stacked<T> = { item: T; x: number; lane: number };

/** Assign nearby events to vertical lanes. x is ALWAYS the true time x; never shifted horizontally. */
export function stackLanes<T extends { t: number; id: string }>(items: T[], xOf: (t: number) => number, minDx: number): Stacked<T>[] {
  const s = [...items].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
  const lastX: number[] = [];
  return s.map((item) => {
    const x = xOf(item.t);
    let lane = lastX.findIndex((lx) => x - lx >= minDx);
    if (lane < 0) { lane = lastX.length; lastX.push(x); } else lastX[lane] = x;
    return { item, x, lane };
  });
}

export type GlucoseLabel<T> = { item: T; x: number; tier: number | null };

/** Label tiers above glucose points, centered at true x. Lows first (always get a tier); others hidden (tier null) on collision. */
export function glucoseLabelTiers<T extends { t: number; id: string; value: number }>(items: T[], xOf: (t: number) => number, minDx: number, maxTiers = 2): GlucoseLabel<T>[] {
  const rank = (p: T) => (glucoseBand(p.value) === 'low' ? 0 : glucoseBand(p.value) === 'high' ? 1 : 2);
  const order = [...items].sort((a, b) => rank(a) - rank(b) || a.t - b.t || a.id.localeCompare(b.id));
  const tiers: number[][] = [];
  const out = new Map<string, GlucoseLabel<T>>();
  for (const item of order) {
    const x = xOf(item.t); const low = rank(item) === 0;
    let tier: number | null = null;
    for (let k = 0; k < (low ? Infinity : maxTiers); k++) {
      if (!tiers[k]) tiers[k] = [];
      if (tiers[k].every((ox) => Math.abs(ox - x) >= minDx)) { tier = k; tiers[k].push(x); break; }
    }
    out.set(item.id, { item, x, tier });
  }
  return [...items].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id)).map((p) => out.get(p.id)!);
}

/** Split sorted glucose readings into runs where consecutive readings are within GLUCOSE_GAP_MS. */
export function glucoseRuns<T extends { t: number }>(sorted: T[], gapMs = GLUCOSE_GAP_MS): T[][] {
  const runs: T[][] = [];
  for (const p of sorted) {
    const last = runs[runs.length - 1];
    if (last && p.t - last[last.length - 1].t <= gapMs) last.push(p);
    else runs.push([p]);
  }
  return runs;
}

export const glucoseMax = (values: number[]) => Math.max(15, Math.ceil(Math.max(0, ...values) / 5) * 5);

/** Keep every label at its event's x; raise only labels whose actual text boxes collide. */
export function placeValueLabels(items: { id: string; x: number; y: number; text: string }[]) {
  const placed: { id: string; x: number; y: number; width: number }[] = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))) {
    const width = Math.max(12, item.text.length * 6.5 + 6);
    let y = item.y;
    while (placed.some(p => Math.abs(p.x - item.x) < (p.width + width) / 2 + 3 && Math.abs(p.y - y) < 14)) y -= 14;
    placed.push({ id: item.id, x: item.x, y, width });
  }
  return placed;
}

/** One zero baseline for meals. Simultaneous meals share a centered, side-by-side group. */
export function mealBars<T extends { t: number; id: string; value: number }>(
  items: T[], xOf: (t: number) => number, baseline: number, maxHeight: number, maxValue: number,
) {
  const groups = new Map<number, T[]>();
  for (const item of [...items].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))) {
    const group = groups.get(item.t) ?? [];
    group.push(item);
    groups.set(item.t, group);
  }
  const times = [...groups.keys()];
  return times.flatMap((t, i) => {
    const group = groups.get(t)!;
    const center = xOf(t);
    const gap = Math.min(i > 0 ? center - xOf(times[i - 1]) : Infinity,
      i + 1 < times.length ? xOf(times[i + 1]) - center : Infinity);
    const slot = Math.min(12, gap * 0.8 / group.length);
    return group.map((item, j) => {
      const x = center + (j - (group.length - 1) / 2) * slot;
      const height = Math.max(0, Math.min(maxHeight, item.value / maxValue * maxHeight));
      return { item, x, width: slot * 0.8, y: baseline - height, height };
    });
  });
}
