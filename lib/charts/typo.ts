/**
 * Series typography for the Top 100 charts: one apostrophe across every title, takeaway, label and table cell, whatever
 * the builder or the words module wrote (men's → men’s). Applied where the words and the plot are read, so the card, the
 * page and its table always agree.
 */
export const typo = (text: string) => text.replace(/'/g, '’');

/** Every string inside a chart spec (labels, notes, keys, titles), with the series typography. */
export function typeset<T>(value: T): T {
  if (typeof value === 'string') return typo(value) as T;
  if (Array.isArray(value)) return value.map((v) => typeset(v)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, typeset(v)])) as T;
  return value;
}
