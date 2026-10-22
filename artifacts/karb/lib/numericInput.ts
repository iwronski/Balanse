/** Localized editable quantities; never rounds to a different step grid. */
export const parseDecimal = (s: string) => {
  const t = s.trim().replace(',', '.').replace(/\s/g, '');
  return /^\d*(?:\.\d+)?$/.test(t) && t !== '' ? Number(t) : NaN;
};
export const formatDecimal = (n: number, decimals = 2) =>
  String(Number(n.toFixed(decimals))).replace('.', ',');

export function adjustQuantity(value: string, step: number, direction: 1 | -1, min = 0, decimals = 1) {
  const current = parseDecimal(value);
  const base = Number.isFinite(current) ? current : min;
  // Preserve user-entered precision, e.g. 3,25 E + 0,5 E = 3,75 E.
  const precision = Math.min(8, Math.max(decimals, (String(base).split('.')[1] ?? '').length));
  return formatDecimal(Math.max(min, base + direction * step), precision);
}
