import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '@/constants/colors';
import { F } from '@/constants/type';
import { confirmAsync } from './confirm';
import type { HealthEvent, Meal, Settings } from './types';
import { mergeBackup, parseBackup } from './backup';
import { persistSnapshot, SNAPSHOT_KEY } from './persistence';
import { mergeEntryRecords } from './entryRecords';

const K = { meals: 'karb.meals.v1', health: 'karb.health.v1', settings: 'karb.settings.v1' };
const defaultSettings: Settings = { advanced: true, aiConsent: false, clinicianRatio: null, ratioNote: '', ratioSeeded: false };
// One-time seed of the personal ratio the user stated during setup. Applied only if never set; never overwrites later edits/clears.
const SEED_RATIO = 12;

export class StorageError extends Error {}
export const STORAGE_WRITE_MSG = 'Kunne ikke lagre på enheten. Ingenting ble endret. Prøv igjen.';

interface Store {
  ready: boolean;
  meals: Meal[];
  health: HealthEvent[];
  settings: Settings;
  saveMeal: (m: Meal) => Promise<void>;
  deleteMeal: (id: string) => Promise<void>;
  setMealConsumed: (id: string, consumed: boolean) => Promise<void>;
  saveHealth: (h: HealthEvent) => Promise<void>;
  saveEntries: (meals: Meal[], health: HealthEvent[]) => Promise<void>;
  deleteHealth: (id: string) => Promise<void>;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  wipeAll: () => Promise<void>;
  importBackup: (raw: string, restoreSettings: boolean) => Promise<void>;
}

const Ctx = createContext<Store | null>(null);
const byTime = <T extends { timestamp: string }>(a: T[]) => [...a].sort((x, y) => y.timestamp.localeCompare(x.timestamp));

function parseArray<T>(raw: string | null, label: string): T[] {
  if (raw == null) return [];
  let v: unknown;
  try { v = JSON.parse(raw); } catch { throw new StorageError(`Lagrede ${label} er skadet og kan ikke leses.`); }
  if (!Array.isArray(v)) throw new StorageError(`Lagrede ${label} har ukjent format.`);
  return v as T[];
}

type Data = { meals: Meal[]; health: HealthEvent[]; settings: Settings };

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [data, setData] = useState<Data>({ meals: [], health: [], settings: defaultSettings });
  const dataRef = useRef(data);
  const loadedRef = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(async () => {
    setStatus('loading');
    loadedRef.current = false;
    try {
      const snapshot = await AsyncStorage.getItem(SNAPSHOT_KEY);
      let saved: Data | null = null;
      if (snapshot !== null) {
        try {
          saved = JSON.parse(snapshot);
          if (!saved || !Array.isArray(saved.meals) || !Array.isArray(saved.health) || !saved.settings || typeof saved.settings !== 'object') throw new Error();
        } catch { throw new StorageError('Lagrede data er skadet og kan ikke leses.'); }
      }
      const [m, h, s] = saved
        ? [JSON.stringify(saved.meals), JSON.stringify(saved.health), JSON.stringify(saved.settings)]
        : await Promise.all([K.meals, K.health, K.settings].map((k) => AsyncStorage.getItem(k)));
      const meals = parseArray<Meal>(m, 'måltider');
      const health = parseArray<HealthEvent>(h, 'helseoppføringer');
      let settings = defaultSettings;
      if (s != null) {
        try { settings = { ...defaultSettings, ...JSON.parse(s) }; } catch { throw new StorageError('Lagrede innstillinger er skadet og kan ikke leses.'); }
      }
      if (!settings.ratioSeeded) {
        settings = { ...settings, ratioSeeded: true, clinicianRatio: settings.clinicianRatio ?? SEED_RATIO };
        try { await persistSnapshot(AsyncStorage, { meals, health, settings }); } catch { throw new StorageError('Kunne ikke lagre faktorinnstillingen. Prøv igjen.'); }
      }
      const next = { meals, health, settings };
      dataRef.current = next;
      setData(next);
      loadedRef.current = true;
      setStatus('ready');
    } catch (e) {
      setLoadError(e instanceof StorageError ? e.message : 'Kunne ikke lese lagrede data fra enheten.');
      setStatus('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Serialized durable mutation: compute next from latest committed data, persist, then commit to state.
  const mutate = useCallback((fn: (d: Data) => { next: Data; keys: (keyof Data)[] }) => {
    const run = async () => {
      if (!loadedRef.current) throw new StorageError('Data er ikke lastet inn. Lagring er blokkert.');
      const { next } = fn(dataRef.current);
      try {
        await persistSnapshot(AsyncStorage, next);
      } catch {
        throw new StorageError(STORAGE_WRITE_MSG);
      }
      dataRef.current = next;
      setData(next);
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  const saveMeal = useCallback((m: Meal) => mutate((d) => ({ next: { ...d, meals: byTime([m, ...d.meals.filter((x) => x.id !== m.id)]) }, keys: ['meals'] })), [mutate]);
  const deleteMeal = useCallback((id: string) => mutate((d) => ({ next: { ...d, meals: d.meals.filter((x) => x.id !== id) }, keys: ['meals'] })), [mutate]);
  const setMealConsumed = useCallback((id: string, consumed: boolean) => mutate((d) => ({
    next: { ...d, meals: d.meals.map((m) => m.id === id ? { ...m, consumed, updatedAt: new Date().toISOString() } : m) },
    keys: ['meals'],
  })), [mutate]);
  const saveHealth = useCallback((h: HealthEvent) => mutate((d) => ({ next: { ...d, health: byTime([h, ...d.health.filter((x) => x.id !== h.id)]) }, keys: ['health'] })), [mutate]);
  // One durable write for a mixed AI draft; retries use the same IDs.
  const saveEntries = useCallback((meals: Meal[], health: HealthEvent[]) => mutate((d) => ({
    next: mergeEntryRecords(d, meals, health), keys: ['meals', 'health'],
  })), [mutate]);
  const deleteHealth = useCallback((id: string) => mutate((d) => ({ next: { ...d, health: d.health.filter((x) => x.id !== id) }, keys: ['health'] })), [mutate]);
  const updateSettings = useCallback((p: Partial<Settings>) => mutate((d) => ({ next: { ...d, settings: { ...d.settings, ...p } }, keys: ['settings'] })), [mutate]);
  const importBackup = useCallback((raw: string, restoreSettings: boolean) => {
    const backup = parseBackup(raw);
    return mutate((d) => ({ next: mergeBackup(d, backup, restoreSettings).next, keys: ['meals', 'health', 'settings'] }));
  }, [mutate]);
  const wipeAll = useCallback(() => {
    const run = async () => {
      const next = { meals: [], health: [], settings: { ...defaultSettings, ratioSeeded: true } };
      try { await persistSnapshot(AsyncStorage, next); } catch { throw new StorageError('Kunne ikke slette data på enheten. Prøv igjen.'); }
      dataRef.current = next; setData(next); loadedRef.current = true; setStatus('ready');
    };
    const p = queue.current.then(run, run);
    queue.current = p.catch(() => {});
    return p;
  }, []);

  const value = useMemo(
    () => ({ ready: status === 'ready', ...data, settings: { ...data.settings, advanced: true }, saveMeal, deleteMeal, setMealConsumed, saveHealth, saveEntries, deleteHealth, updateSettings, wipeAll, importBackup }),
    [status, data, saveMeal, deleteMeal, setMealConsumed, saveHealth, saveEntries, deleteHealth, updateSettings, wipeAll, importBackup],
  );

  const c = colors.light;
  if (status !== 'ready') {
    return (
      <View style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 }}>
        {status === 'loading' ? <ActivityIndicator color={c.primary} /> : (
          <>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: c.foreground, textAlign: 'center' }}>Kunne ikke laste dataene dine</Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 22, color: c.mutedForeground, textAlign: 'center', maxWidth: 340 }}>
              {loadError} Ingenting er slettet eller overskrevet, og lagring er sperret til dataene kan leses.
            </Text>
            <Pressable testID="storage-retry" accessibilityRole="button" onPress={load}
              style={({ pressed }) => ({ backgroundColor: c.primary, borderRadius: 999, paddingVertical: 14, paddingHorizontal: 26, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontFamily: F.semibold, fontSize: 16, color: c.primaryForeground }}>Prøv igjen</Text>
            </Pressable>
            <Pressable testID="storage-wipe" accessibilityRole="button" onPress={async () => { if (await confirmAsync('Slette lagrede data?', 'Alle måltider, loggoppføringer og innstillinger på enheten fjernes.', 'Slett')) wipeAll().catch((e: Error) => setLoadError(e.message)); }}>
              <Text style={{ fontFamily: F.medium, fontSize: 13.5, color: c.destructive, textAlign: 'center', marginTop: 8 }}>
                Slett lagrede data og start på nytt (kan ikke angres)
              </Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be inside StoreProvider');
  return c;
}
