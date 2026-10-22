import type { BackupData } from './backup';

export const SNAPSHOT_KEY = 'karb.snapshot.v1';
export const LEGACY_KEYS = ['karb.meals.v1', 'karb.health.v1', 'karb.settings.v1'];

/** One durable key is the commit point: multiSet is not atomic on web/native. */
export async function persistSnapshot(
  storage: { setItem: (key: string, value: string) => Promise<unknown>; multiRemove: (keys: string[]) => Promise<unknown> },
  data: BackupData,
) {
  await storage.setItem(SNAPSHOT_KEY, JSON.stringify(data));
  // Cleanup is not the commit point. A failure leaves a redundant old copy, not a failed import.
  try { await storage.multiRemove(LEGACY_KEYS); } catch { /* The authoritative snapshot is already durable. */ }
}
