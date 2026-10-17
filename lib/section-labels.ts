import { sectionLabel as matSection } from './units';

export const MARATHON_SECTION_ENDS = [5, 10, 15, 20, 25, 30, 35, 40, 42.195];

/**
 * The 5 km section that ends at `value`, named by its mats in both unit modes (the redesign spec, section 3.10): "0–5K",
 * "35–40K", "40K–finish". A value that is not a section end is returned as written.
 */
export function sectionLabel(value: unknown, ends: number[] = MARATHON_SECTION_ENDS): string {
  const end = Number(value);
  const index = ends.findIndex(point => Math.abs(point - end) < 0.001);
  if (index < 0) return String(value ?? 'Not recorded');
  const start = index ? ends[index - 1] : 0;
  return matSection(start, ends[index]);
}
