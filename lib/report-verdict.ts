/**
 * The race's verdict from its nine times, and the threshold-safe percentages it is written in: the split check's rules,
 * shared by the race report (lib/report-shared re-exports all of it), the split check and the runner view's pacing
 * heading. A module of its own, with no imports but a type, so the runner search's first load carries these few lines
 * and not the report's comparison window, link and pace-band helpers. Pure.
 */
import type { SplitReading } from './tools/split-reading';

/* ---------- Percentages that never round across a threshold ---------- */

const EPS = 1e-12;
/** A section at least 25% slower than the 5–20 km pace, as the published definition counts it. */
export const qualifies = (frac: number) => frac + EPS >= 0.25;
/**
 * |frac| as a percentage with `digits` decimals, never rounded across the 25% threshold: a section 24.99% slower shows as
 * 24.99, not 25.0 (more decimals first, then truncation), and a qualifying one never shows below 25.
 */
export function pctNum(frac: number, digits: number): string {
  const p = Math.abs(frac) * 100;
  if (frac > 0 && !qualifies(frac)) {
    for (let d = digits; d <= 2; d += 1) {
      const text = p.toFixed(d);
      if (Number(text) < 25) return text;
    }
    return '24.99';
  }
  if (frac > 0 && p < 25) return (25).toFixed(digits);
  return p.toFixed(digits);
}
/** "27%"; more decimals when rounding would hide which side of 25% a value is on, or round a real change to 0%. */
export function pctAbs(frac: number): string {
  const p = Math.abs(frac) * 100;
  if (Math.round(p) === 0 && p >= 0.05) return `${p.toFixed(1)}%`;
  return `${pctNum(frac, 0)}%`;
}
/** "+27.3%" / "−4.1%", threshold-safe like pctNum. */
export function pctSigned(frac: number, digits = 1): string {
  if (!Number.isFinite(frac)) return '—';
  const text = pctNum(frac, digits);
  return `${Number(text) === 0 ? '' : frac > 0 ? '+' : '−'}${text}%`;
}
/** The opening as a percentage: whole numbers, with decimals near the 2, 5 and 10% edges of the opening groups. */
export function openingPct(frac: number): string {
  const p = Math.abs(frac) * 100;
  const r = Math.round(p);
  if (![2, 5, 10].includes(r) || p === r) return pctAbs(frac);
  const one = p.toFixed(1);
  return `${Number(one) === r ? p.toFixed(2) : one}%`;
}

/* ---------- Section tones (the split check's bar colours) ---------- */

export type Tone = 'quick' | 'even' | 'slow' | 'qualify';
/**
 * One race's verdict from its nine times alone, in the split check's own rules: the race report's night card says it
 * when the race has no record (a shared link), and the runner view's pacing heading says it for a record. With a
 * sustained slowdown, where it began and how far off the 5–20 km pace its slowest qualifying section ran; without one,
 * the slowest section after 20 km and how far off that pace it ran (null when every one held the pace or better).
 * Percentages are threshold-safe (pctAbs), so the words never round across 25%.
 */
export type TimesVerdict =
  | { slowdown: true; onsetKm: number; off: string }
  | { slowdown: false; worst: { index: number; off: string } | null };
export function timesVerdict(r: SplitReading): TimesVerdict {
  if (r.slowdown && r.onsetKm !== null) {
    const from = 4 + (r.onsetKm - 20) / 5;
    const off = Math.max(...r.vsBaseline.slice(from).filter((_, k) => toneOf(r, from + k) === 'qualify'));
    return { slowdown: true, onsetKm: r.onsetKm, off: pctAbs(off) };
  }
  const late = r.vsBaseline.slice(4);
  const worst = Math.max(...late);
  return { slowdown: false, worst: worst >= 0.005 ? { index: 4 + late.indexOf(worst), off: pctAbs(worst) } : null };
}

/** Bar category: a qualifying section is a 5 km section after 20 km at least 25% slower, or the final 2.195 km extending one. */
export function toneOf(r: SplitReading, i: number): Tone {
  const v = r.vsBaseline[i];
  if (i >= 4 && i <= 7 && qualifies(v)) return 'qualify';
  if (i === 8 && qualifies(v) && qualifies(r.vsBaseline[7])) return 'qualify';
  if (v <= -0.02) return 'quick';
  if (v < 0.02) return 'even';
  return 'slow';
}
