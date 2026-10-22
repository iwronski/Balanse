import { Platform, Share } from 'react-native';
import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { buildBackup, MAX_BACKUP_BYTES, type BackupData } from './backup';
import { cleanOldBackupShares, shareBackupFile } from './backup-sharing';
import type { HealthEvent, Meal, Settings } from './types';
import { carbsOf, fmt, fmtStamp, mealCarbs, isConsumed } from './types';

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCsv(meals: Meal[], health: HealthEvent[], includeHealth: boolean) {
  const rows: (string | number)[][] = [['tidspunkt', 'type', 'beskrivelse', 'verdi', 'enhet', 'detaljer']];
  const all: { t: string; r: (string | number)[] }[] = [];
  meals.forEach((m) => {
    all.push({ t: m.timestamp, r: [fmtStamp(m.timestamp), isConsumed(m) ? 'måltid (spist, estimat)' : 'referanse (ikke spist)', m.title, fmt(mealCarbs(m), 1), 'g karbohydrat',
      m.ingredients.map((i) => `${i.name} ${fmt(i.grams, 1)} g x ${fmt(i.carbsPer100g, 1)}/100 g = ${fmt(carbsOf(i), 1)} g${i.assumption ? ` (${i.assumption})` : ''}`).join(' | ')] });
  });
  if (includeHealth) health.forEach((h) => {
    const map = { glucose: ['glukose', 'mmol/L'], insulin: ['insulin', 'enheter'], exercise: ['aktivitet', 'min'] } as const;
    const [label, unit] = map[h.type];
    const det = [h.insulinKind ? `type: ${h.insulinKind}` : '', h.intensity ? `intensitet: ${h.intensity}` : '', h.note].filter(Boolean).join(' | ');
    all.push({ t: h.timestamp, r: [fmtStamp(h.timestamp), label, '', fmt(h.value, 1), unit, det] });
  });
  all.sort((a, b) => a.t.localeCompare(b.t)).forEach((x) => rows.push(x.r));
  return rows.map((r) => r.map(csvCell).join(';')).join('\n');
}

export function buildText(meals: Meal[], health: HealthEvent[], settings: Settings, includeHealth: boolean) {
  const lines: string[] = ['Balanse – logg til samtale med behandler', 'Alle karbohydratverdier er estimater og må ikke brukes som eneste grunnlag for dosering.', ''];
  if (settings.clinicianRatio) lines.push(`Egen anslått karbohydratfaktor: ${fmt(settings.clinicianRatio, 1)} g/enhet${settings.ratioNote ? ` (${settings.ratioNote})` : ''}`, '');
  lines.push('MÅLTIDER');
  meals.forEach((m) => {
    lines.push(`${fmtStamp(m.timestamp)}  ${m.title}  ca. ${fmt(mealCarbs(m), 1)} g karb  [${isConsumed(m) ? 'Spist' : 'Referanse – ikke spist'}]`);
    m.ingredients.forEach(i => lines.push(`  ${i.name}: ${fmt(i.grams, 1)} g, ${fmt(carbsOf(i), 1)} g karbohydrat${i.assumption ? ` – ${i.assumption}` : ''}`));
  });
  if (includeHealth && health.length) {
    lines.push('', 'LOGG');
    health.forEach((h) => {
      const v = h.type === 'glucose' ? `glukose ${fmt(h.value, 1)} mmol/L` : h.type === 'insulin' ? `insulin ${fmt(h.value, 1)} E${h.insulinKind ? ` (${h.insulinKind})` : ''}` : `aktivitet ${fmt(h.value)} min${h.intensity ? ` (${h.intensity})` : ''}`;
      lines.push(`${fmtStamp(h.timestamp)}  ${v}${h.note ? `  – ${h.note}` : ''}`);
    });
  }
  return lines.join('\n');
}

export async function shareExport(kind: 'text' | 'csv', meals: Meal[], health: HealthEvent[], settings: Settings) {
  const inc = true;
  const message = kind === 'csv' ? buildCsv(meals, health, inc) : buildText(meals, health, settings, inc);
  await Share.share({ message, title: kind === 'csv' ? 'balanse-logg.csv' : 'Balanse-logg' });
}

export async function downloadBackup(data: BackupData) {
  const json = buildBackup(data);
  const name = `karb-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  if (Platform.OS === 'web') {
    // No awaited work before click: preserve Safari's user gesture. Do not use File System Access API.
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a);
    a.click(); a.remove();
    // Safari may consume the URL after the click handler returns.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('Fildeling er ikke tilgjengelig på denne enheten.');
  const directory = new Directory(Paths.cache, 'karb-backup-shares');
  directory.create({ idempotent: true });
  try {
    cleanOldBackupShares(directory.list().filter((entry): entry is ExpoFile => entry instanceof ExpoFile));
  } catch { /* Retry cache cleanup on the next export if listing fails. */ }
  const file = new ExpoFile(directory, name);
  await shareBackupFile(file, json, uri =>
    Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Lagre sikkerhetskopi' }));
}

export function pickBackup(): Promise<string | null> {
  if (Platform.OS === 'web') return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
    document.body.appendChild(input);
    const cleanup = () => input.remove();
    input.oncancel = () => { cleanup(); resolve(null); };
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        if (file.size > MAX_BACKUP_BYTES) throw new Error('Filen er for stor. Maksimal størrelse er 20 MB.');
        resolve(await file.text());
      } catch (e) { reject(e); } finally { cleanup(); }
    };
    input.click();
  });
  return (async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
    if (result.canceled) return null;
    const asset = result.assets[0];
    const file = new ExpoFile(asset.uri);
    try {
      if ((asset.size ?? file.size) > MAX_BACKUP_BYTES) throw new Error('Filen er for stor. Maksimal størrelse er 20 MB.');
      return await file.text();
    } finally { if (file.exists) file.delete(); }
  })();
}
