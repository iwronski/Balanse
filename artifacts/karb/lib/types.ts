export interface Ingredient {
  id: string;
  name: string;
  grams: number;
  carbsPer100g: number;
  assumption: string;
}

export interface Meal {
  id: string;
  title: string;
  timestamp: string;
  ingredients: Ingredient[];
  notes: string;
  corrections: string[];
  source: 'ai' | 'manual';
  /** Missing on older entries means eaten. False retains a reference without counting intake. */
  consumed?: boolean;
  uncertainty?: string;
  warnings: string[];
  detectedWeightGrams?: number;
  confirmedWeightGrams?: number;
  photoUri?: string;
  createdAt: string;
  updatedAt: string;
}

export type HealthType = 'glucose' | 'insulin' | 'exercise';
export const isConsumed = (meal: Pick<Meal, 'consumed'>) => meal.consumed !== false;

export interface HealthEvent {
  id: string;
  type: HealthType;
  timestamp: string;
  value: number;
  insulinKind?: 'hurtig' | 'langtid' | 'annet';
  intensity?: 'lett' | 'moderat' | 'hard';
  note: string;
}

export interface Settings {
  advanced: boolean;
  aiConsent: boolean;
  clinicianRatio: number | null;
  ratioNote: string;
  /** True once the one-time initial ratio seed has run. clinicianRatio is a legacy key: it holds the user's own estimate. */
  ratioSeeded?: boolean;
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const num = (s: string): number => {
  const n = parseFloat(s.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export const carbsOf = (i: { grams: number; carbsPer100g: number }) =>
  (i.grams * i.carbsPer100g) / 100;

export const mealCarbs = (m: { ingredients: { grams: number; carbsPer100g: number }[] }) =>
  m.ingredients.reduce((s, i) => s + carbsOf(i), 0);

/** Display legacy generic titles without rewriting stored registrations. */
export const mealTitle = (m: { title: string; ingredients: { name: string }[] }) =>
  m.title.trim() && m.title.trim().toLocaleLowerCase('nb-NO') !== 'mitt måltid'
    ? m.title.trim()
    : m.ingredients.find(i => i.name.trim())?.name.trim() || 'Måltid';

export const fmt = (n: number, d = 0) =>
  n.toLocaleString('nb-NO', { maximumFractionDigits: d, minimumFractionDigits: 0 });

const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const fmtDay = (iso: string) => {
  const d = new Date(iso);
  const today = dayKey(new Date().toISOString());
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (dayKey(iso) === today) return 'I dag';
  if (dayKey(iso) === dayKey(y.toISOString())) return 'I går';
  return `${DAYS[d.getDay()][0].toUpperCase()}${DAYS[d.getDay()].slice(1)} ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
};
export const fmtStamp = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${fmtTime(iso)}`;
};
export const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'God natt';
  if (h < 10) return 'God morgen';
  if (h < 17) return 'God dag';
  return 'God kveld';
};

export function errorMessage(e: unknown): string {
  const anyE = e as { data?: unknown; message?: string; status?: number } | null;
  const data = anyE?.data as { error?: unknown } | null | undefined;
  if (data && typeof data.error === 'string') return data.error;
  if (anyE?.message) {
    if (/network|fetch/i.test(anyE.message)) return 'Fikk ikke kontakt med serveren. Sjekk nettforbindelsen.';
    return anyE.message;
  }
  return 'Noe gikk galt. Prøv igjen.';
}
