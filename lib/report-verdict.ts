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
/**
 * The opening (the first 5K against the 5–20K pace) as a percentage, in the one decimal every section's change takes on
 * the runner pages (m3, November 20, 2026: "2.5% slower" in the sentence above a row that said "+2%"), with a second
 * decimal only where one would land on an edge of the opening groups (2, 5 and 10%) that the value is not on.
 */
export function openingPct(frac: number): string {
  const p = Math.abs(frac) * 100;
  const one = p.toFixed(1);
  return `${[2, 5, 10].includes(Number(one)) && Number(one) !== p ? p.toFixed(2) : one}%`;
}
/** The opening signed, as the 0–5K row of a lap list says it beside the other sections ("+2.5%", "−4.96%"). */
export function openingSigned(frac: number): string {
  if (!Number.isFinite(frac)) return '—';
  const text = openingPct(frac);
  return `${Number(text.slice(0, -1)) === 0 ? '' : frac > 0 ? '+' : '−'}${text}`;
}
/** A section's change against the 5–20K pace as a lap list's row says it: the opening's words for 0–5K, else pctSigned. */
export const sectionChange = (frac: number, index: number): string => (index === 0 ? openingSigned(frac) : pctSigned(frac, 1));

/* ---------- Section tones (the split check's bar colours) ---------- */

export type Tone = 'quick' | 'even' | 'slow' | 'qualify';
/**
 * One race's verdict from its nine times alone, in the split check's own rules: the race report's night card says it
 * when the race has no record (a shared link), and the runner view's pacing heading says it for a record. With a
 * sustained slowdown, where it began and how far off the 5–20 km pace its slowest qualifying section ran; without one,
 * the slowest section after 20 km and how far off that pace it ran (null when every one held the pace or better).
 * Percentages take one decimal, as the lap list's rows beside them (m3, November 20, 2026), and are threshold-safe
 * (pctNum), so the words never round across 25%; a stretch is "off" the pace from the first tenth of a percent.
 */
export type TimesVerdict =
  | { slowdown: true; onsetKm: number; off: string }
  | { slowdown: false; worst: { index: number; off: string } | null };
export function timesVerdict(r: SplitReading): TimesVerdict {
  if (r.slowdown && r.onsetKm !== null) {
    const from = 4 + (r.onsetKm - 20) / 5;
    const off = Math.max(...r.vsBaseline.slice(from).filter((_, k) => toneOf(r, from + k) === 'qualify'));
    return { slowdown: true, onsetKm: r.onsetKm, off: `${pctNum(off, 1)}%` };
  }
  const late = r.vsBaseline.slice(4);
  const worst = Math.max(...late);
  return { slowdown: false, worst: worst >= 0.0005 ? { index: 4 + late.indexOf(worst), off: `${pctNum(worst, 1)}%` } : null };
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
