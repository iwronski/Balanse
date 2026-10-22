// Pure helpers for the home summary. No React / alias imports so node --test can run them.

export type SumMeal = { timestamp: string; consumed?: boolean; ingredients: { grams: number; carbsPer100g: number }[] };
export type SumHealth = { timestamp: string; type: string; value: number; insulinKind?: string };

const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const keyOfIso = (iso: string) => keyOf(new Date(iso));
export const dateOfKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
/** Calendar shift (DST safe: uses local date arithmetic). */
export const shiftKey = (k: string, n: number) => { const d = dateOfKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
/** Whole calendar days from a to b (b >= a gives positive). */
export const daysBetween = (a: string, b: string) => Math.round((dateOfKey(b).getTime() - dateOfKey(a).getTime()) / 86_400_000);

const eaten = (m: SumMeal) => m.consumed !== false;
const isRapid = (h: SumHealth) => h.type === 'insulin' && h.insulinKind === 'hurtig';
const carbs = (m: SumMeal) => m.ingredients.reduce((s, i) => s + (i.grams * i.carbsPer100g) / 100, 0);

/** Earliest day key with consumed meal or rapid insulin, never after today. */
export function earliestKey(meals: SumMeal[], health: SumHealth[], today: string): string {
  let min = today;
  for (const m of meals) if (eaten(m)) { const k = keyOfIso(m.timestamp); if (k < min) min = k; }
  for (const h of health) if (isRapid(h)) { const k = keyOfIso(h.timestamp); if (k < min) min = k; }
  return min;
}

export type DaySummary = { key: string; carbs: number; meals: number; rapid: number; rapidCount: number };

export function summarizeDay(meals: SumMeal[], health: SumHealth[], key: string): DaySummary {
  const s: DaySummary = { key, carbs: 0, meals: 0, rapid: 0, rapidCount: 0 };
  for (const m of meals) if (eaten(m) && keyOfIso(m.timestamp) === key) { s.carbs += carbs(m); s.meals++; }
  for (const h of health) if (isRapid(h) && keyOfIso(h.timestamp) === key) { s.rapid += h.value; s.rapidCount++; }
  return s;
}

export type PeriodAverage = { days: number; carbs: number; rapid: number; carbDays: number; rapidDays: number; firstKey: string | null; lastKey: string | null };

/**
 * Average per day over the whole period. Denominator = union of days with a consumed meal OR rapid insulin
 * (today included only if it has data). A metric missing on an included day counts as 0.
 */
export function periodAverage(meals: SumMeal[], health: SumHealth[], today: string): PeriodAverage {
  const c = new Map<string, number>(); const r = new Map<string, number>();
  for (const m of meals) if (eaten(m)) { const k = keyOfIso(m.timestamp); if (k <= today) c.set(k, (c.get(k) ?? 0) + carbs(m)); }
  for (const h of health) if (isRapid(h)) { const k = keyOfIso(h.timestamp); if (k <= today) r.set(k, (r.get(k) ?? 0) + h.value); }
  const keys = [...new Set([...c.keys(), ...r.keys()])].sort();
  const n = keys.length;
  const sum = (mp: Map<string, number>) => [...mp.values()].reduce((a, b) => a + b, 0);
  return {
    days: n,
    carbs: n ? sum(c) / n : 0,
    rapid: n ? sum(r) / n : 0,
    carbDays: c.size, rapidDays: r.size,
    firstKey: keys[0] ?? null, lastKey: keys[n - 1] ?? null,
  };
}

/** Clamp a selected day between earliest and today. */
export const clampKey = (k: string, earliest: string, today: string) => (k > today ? today : k < earliest ? earliest : k);

export type TimelineItem<M, H> = { kind: 'meal'; t: number; meal: M } | { kind: 'insulin'; t: number; h: H };
/** Today's consumed meals + all insulin types, newest first. */
export function todayTimeline<M extends SumMeal, H extends SumHealth>(meals: M[], health: H[], key: string): TimelineItem<M, H>[] {
  const out: TimelineItem<M, H>[] = [];
  for (const m of meals) if (eaten(m) && keyOfIso(m.timestamp) === key) out.push({ kind: 'meal', t: new Date(m.timestamp).getTime(), meal: m });
  for (const h of health) if (h.type === 'insulin' && keyOfIso(h.timestamp) === key) out.push({ kind: 'insulin', t: new Date(h.timestamp).getTime(), h });
  return out.sort((a, b) => b.t - a.t);
}
