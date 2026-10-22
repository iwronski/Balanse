import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import type { Meal } from '@/lib/types';
import { tap } from '@/components/ui';

/** Retain references; undo changes only consumed, never overwrites other meal fields. */
export function useMealRemoval() {
  const { setMealConsumed } = useStore();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ id: string; title: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const change = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try { await fn(); tap('success'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Kunne ikke lagre endringen. Prøv igjen.'); }
    finally { lock.current = false; setBusy(false); }
  };
  const remove = (meal: Meal) => change(async () => {
    await setMealConsumed(meal.id, false);
    setPending((p) => [...p.filter((x) => x.id !== meal.id), { id: meal.id, title: meal.title }]);
  });
  const undo = () => change(async () => {
    const last = pending[pending.length - 1];
    if (!last) return;
    await setMealConsumed(last.id, true);
    setPending((p) => p.filter((x) => x.id !== last.id));
  });
  return { remove, undo, pending, busy, error, dismiss: () => { if (!lock.current) { setPending([]); setError(null); } } };
}
