import { z } from 'zod';
import type { HealthEvent, Meal, Settings } from './types';

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const text = z.string().max(MAX_BACKUP_BYTES);
const id = z.string().min(1).max(500);
const number = z.number().finite().nonnegative();
const date = z.string().datetime({ offset: true });
const ingredient = z.object({
  id, name: text, grams: number, carbsPer100g: number, assumption: text,
}).strict();
const meal = z.object({
  id, title: text, timestamp: date, ingredients: z.array(ingredient).max(10000),
  notes: text, corrections: z.array(text), source: z.enum(['ai', 'manual']),
  consumed: z.boolean().optional(), uncertainty: text.optional(), warnings: z.array(text),
  detectedWeightGrams: number.optional(), confirmedWeightGrams: number.optional(),
  photoUri: text.optional(), createdAt: date, updatedAt: date,
}).strict();
const health = z.object({
  id, type: z.enum(['glucose', 'insulin', 'exercise']), timestamp: date, value: number,
  insulinKind: z.enum(['hurtig', 'langtid', 'annet']).optional(),
  intensity: z.enum(['lett', 'moderat', 'hard']).optional(), note: text,
}).strict();
const settings = z.object({
  advanced: z.boolean(), aiConsent: z.boolean(), clinicianRatio: z.number().finite().positive().nullable(),
  ratioNote: text, ratioSeeded: z.boolean().optional(),
}).strict();
const uniqueIds = <T extends { id: string }>(rows: T[]) => new Set(rows.map(r => r.id)).size === rows.length;
export const backupSchema = z.object({
  format: z.literal('karb-backup'), version: z.literal(1), exportedAt: date,
  meals: z.array(meal).max(100000).refine(uniqueIds),
  health: z.array(health).max(100000).refine(uniqueIds), settings,
}).strict();
export type Backup = z.infer<typeof backupSchema>;
export type BackupData = { meals: Meal[]; health: HealthEvent[]; settings: Settings };

export function parseBackup(raw: string): Backup {
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES) throw new Error('Filen er for stor. Maksimal størrelse er 20 MB.');
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new Error('Filen er ikke gyldig JSON. Ingen data er endret.'); }
  const result = backupSchema.safeParse(value);
  if (!result.success) throw new Error('Ugyldig eller ukjent Balanse-sikkerhetskopi. Kontroller format, versjon og innhold. Ingen data er endret.');
  return result.data;
}

export function buildBackup(data: BackupData): string {
  const raw = JSON.stringify({ format: 'karb-backup', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
  parseBackup(raw);
  return raw;
}

// Stable comparison ignores object key order, but never ignores record content.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
function mergeRows<T extends { id: string; timestamp: string }>(current: T[], incoming: T[]) {
  const rows = [...current];
  const used = new Set([...current, ...incoming].map(r => r.id));
  const existing = new Map(current.map(r => [r.id, r]));
  const content = (r: T) => canonical({ ...r, id: undefined });
  // Recognize previously renamed conflicts too, making repeated imports idempotent.
  const copies = new Map<string, string[]>();
  for (const row of current) {
    const signature = content(row);
    copies.set(signature, [...(copies.get(signature) ?? []), row.id]);
  }
  let skipped = 0;
  let conflicts = 0;
  for (const row of incoming) {
    const sameId = existing.get(row.id);
    const previousConflict = (copies.get(content(row)) ?? []).some(id => id.startsWith(`import-${row.id.slice(0, 450)}-`));
    if ((sameId && canonical(sameId) === canonical(row)) || previousConflict) {
      skipped++;
      continue;
    }
    let next = row;
    if (sameId) {
      let suffix = 1;
      let newId = `import-${row.id.slice(0, 450)}-${suffix}`;
      while (used.has(newId)) newId = `import-${row.id.slice(0, 450)}-${++suffix}`;
      next = { ...row, id: newId };
      conflicts++;
    }
    rows.push(next); used.add(next.id);
  }
  return { rows: rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp)), added: rows.length - current.length, skipped, conflicts };
}

export function mergeBackup(current: BackupData, backup: Backup, restoreSettings: boolean) {
  const meals = mergeRows(current.meals, backup.meals);
  const health = mergeRows(current.health, backup.health);
  return {
    next: {
      meals: meals.rows, health: health.rows,
      // Importing a file must not grant AI consent on a new device.
      settings: restoreSettings ? { ...backup.settings, aiConsent: current.settings.aiConsent, ratioSeeded: true } : current.settings,
    },
    added: meals.added + health.added, skipped: meals.skipped + health.skipped,
    conflicts: meals.conflicts + health.conflicts,
  };
}
