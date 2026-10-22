import type { ParsedEntry } from '@workspace/api-client-react';
import { mealTitle, uid, type HealthEvent, type Meal } from './types.ts';

export type DraftKind = 'meal' | 'insulin' | 'glucose' | 'exercise';
export interface DraftIngredient {
  id: string; name: string; grams: string; carbsPer100g: string; assumption: string;
}
export interface EntryDraft {
  id: string; type: DraftKind; timestamp: string; title: string; note: string; value: string;
  source: 'ai' | 'manual';
  insulinKind: HealthEvent['insulinKind'] | '';
  intensity: HealthEvent['intensity'] | '';
  ingredients: DraftIngredient[];
}
const textNumber = (value?: number | null) => value == null ? '' : String(value).replace('.', ',');
export const blankIngredient = (): DraftIngredient => ({ id: uid(), name: '', grams: '', carbsPer100g: '', assumption: '' });
export function newDraft(type: DraftKind): EntryDraft {
  return { id: uid(), type, timestamp: new Date().toISOString(), title: '', note: '', value: '', source: 'manual',
    insulinKind: '', intensity: '', ingredients: type === 'meal' ? [blankIngredient()] : [] };
}
export function fromParsed(entry: ParsedEntry): EntryDraft {
  return { ...newDraft(entry.type), source: 'ai', timestamp: entry.timestamp, title: entry.title, note: entry.note,
    value: textNumber(entry.value), insulinKind: entry.insulinKind ?? '', intensity: entry.intensity ?? '',
    ingredients: (entry.ingredients ?? []).map(i => ({
      id: uid(), name: i.name, grams: textNumber(i.grams), carbsPer100g: textNumber(i.carbsPer100g), assumption: i.assumption,
    })) };
}
/** Reject empty, negative, partial and non-finite input rather than silently turning it into zero. */
export function draftNumber(value: string): number {
  const normalized = value.trim().replace(',', '.');
  return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}
export function draftError(draft: EntryDraft): string | null {
  if (!Number.isFinite(new Date(draft.timestamp).getTime())) return 'Velg et gyldig tidspunkt.';
  if (draft.type === 'meal') {
    if (!draft.ingredients.length) return 'Legg til minst én ingrediens.';
    for (const i of draft.ingredients) {
      if (!i.name.trim()) return 'Gi alle ingrediensene et navn.';
      const grams = draftNumber(i.grams), per100 = draftNumber(i.carbsPer100g);
      if (!Number.isFinite(grams) || grams <= 0 || grams > 5000) return 'Oppgi mengde fra over 0 til 5 000 g for hver ingrediens.';
      if (!Number.isFinite(per100) || per100 < 0 || per100 > 100) return 'Oppgi karbohydrat fra 0 til 100 g per 100 g.';
    }
    return null;
  }
  const n = draftNumber(draft.value);
  if (!Number.isFinite(n) || n <= 0) return 'Fyll inn en mengde større enn 0.';
  if (draft.type === 'glucose' && n > 40) return 'Glukose må være høyst 40 mmol/L.';
  if (n > 10000) return 'Verdien er for stor.';
  if (draft.type === 'insulin' && !draft.insulinKind) return 'Velg insulintype.';
  return null;
}
export function draftRecords(drafts: EntryDraft[], now: string): { meals: Meal[]; health: HealthEvent[] } {
  const meals: Meal[] = [], health: HealthEvent[] = [];
  for (const d of drafts) {
    const error = draftError(d);
    if (error) throw new Error(error);
    if (d.type === 'meal') {
      const ingredients = d.ingredients.map(i => ({ ...i, grams: draftNumber(i.grams), carbsPer100g: draftNumber(i.carbsPer100g) }));
      meals.push({ id: d.id, title: mealTitle({ title: d.title, ingredients }), timestamp: d.timestamp,
        ingredients, notes: d.note, corrections: [], source: d.source, consumed: true, warnings: [], createdAt: now, updatedAt: now });
    } else {
      health.push({ id: d.id, type: d.type, timestamp: d.timestamp, value: draftNumber(d.value), note: d.note,
        ...(d.type === 'insulin' && d.insulinKind ? { insulinKind: d.insulinKind } : {}),
        ...(d.type === 'exercise' && d.intensity ? { intensity: d.intensity } : {}) });
    }
  }
  return { meals, health };
}
