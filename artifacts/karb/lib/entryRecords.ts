import type { HealthEvent, Meal } from './types';

/** Preserve unrelated registrations; stable draft IDs make a retry an upsert, not a duplicate. */
export function mergeEntryRecords<T extends { meals: Meal[]; health: HealthEvent[] }>(
  current: T, meals: Meal[], health: HealthEvent[],
): T {
  const mealIds = new Set(meals.map(m => m.id)), healthIds = new Set(health.map(h => h.id));
  const newest = <U extends { timestamp: string }>(items: U[]) =>
    items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return { ...current,
    meals: newest([...meals, ...current.meals.filter(m => !mealIds.has(m.id))]),
    health: newest([...health, ...current.health.filter(h => !healthIds.has(h.id))]),
  };
}
