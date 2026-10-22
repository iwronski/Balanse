import data from '@/data/foods.json';

export interface Food {
  id: string;
  name: string;
  category: string;
  carbsPer100g: number | null;
  sourceCode: string;
}
export const foods: Food[] = data;
export const FOOD_SOURCE = 'Matvaretabellen 2026, Mattilsynet – www.matvaretabellen.no';
const normalize = (s: string) => s.toLocaleLowerCase('nb-NO').replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const indexed = foods.map(food => ({ food, text: normalize(`${food.name} ${food.category}`) }));
export function searchFoods(query: string): Food[] {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return indexed.filter(({ text }) => terms.every(term => text.includes(term))).map(({ food }) => food);
}
export function parseAmount(value: string): number | null {
  const cleaned = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 && n <= 10000 ? n : null;
}
export const foodAttribution = (food: Food) =>
  `Kilde: ${FOOD_SOURCE}. Matvare-ID ${food.id}. Karbohydrat per 100 g spiselig del.`;
