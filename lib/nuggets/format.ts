/**
 * The format helpers every nugget uses (the redesign spec, sections 3.10 and 5), so one value reads the same on every
 * page: "1 in 25" here is "1 in 25" there. Pure functions of plain numbers; scripts/verify-nuggets.cjs tests them.
 *
 * Conventions: shares are 0–1; times and gaps are seconds; paces are seconds per km; temperatures are °C. A negative
 * sign is the minus sign (−), never a hyphen. A count is written out with separators ("10,000"), never "10K", because
 * 10K is a distance on this site.
 */
import { distance, matLabel, paceLabel, sectionLabel, type UnitSystem } from '@/lib/units';

export { distance, matLabel, sectionLabel };

const MINUS = '−';
const finite = (v: number) => typeof v === 'number' && Number.isFinite(v);

/** A count with separators: 15856 → "15,856". */
export function count(n: number): string {
  return finite(n) ? Math.round(n).toLocaleString('en-US') : '—';
}

/** A share as a percentage: 0.4716 → "47%"; `digits` decimals. */
export function pct(share: number, digits = 0): string {
  if (!finite(share)) return '—';
  const v = Number((share * 100).toFixed(digits));
  return `${(Object.is(v, -0) ? 0 : v).toFixed(digits)}%`.replace('-', MINUS);
}

/** Millions with one decimal, for "{n} million finishes": 3871767 → "3.9". */
export function millions(n: number): string {
  return finite(n) ? (n / 1e6).toFixed(1) : '—';
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** A small count in words ("seven"); 13 and above, or a non-integer, as figures. */
export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : count(n);
}

/** The denominators a plain fraction may use: "1 in 2" … "1 in 100". */
export const IN_WORDS_DENOMINATORS: readonly number[] = [2, 3, 4, 5, 10, 20, 25, 50, 100];

/**
 * A share as a plain fraction: the closest "1 in d" from the fixed list, when its relative error is under 10%
 * (0.0395 → "1 in 25"); otherwise the percentage ("30%"). With a noun both branches read as a phrase: "1 in 25
 * finishes" or "3% of finishes", so a caller never appends a noun to a bare percentage.
 */
export function inWords(share: number, noun?: string): string {
  const best = nearestOneIn(share);
  if (!noun) return best ? `1 in ${best}` : pct(share);
  return best ? `1 in ${best} ${noun}` : `${pct(share)} of ${noun}`;
}
function nearestOneIn(share: number): number | null {
  if (!finite(share) || share <= 0 || share >= 1) return null;
  let best: { d: number; err: number } | null = null;
  for (const d of IN_WORDS_DENOMINATORS) {
    const err = Math.abs(1 / d - share) / share;
    if (err < 0.1 && (!best || err < best.err)) best = { d, err };
  }
  return best ? best.d : null;
}

/**
 * A share in tenths for prose: "about 3 in 10" (within a hundredth of a tenth's step), "just over 7 in 10" or
 * "just under 7 in 10" (up to 3.5 hundredths away); otherwise the percentage. With a `noun`, a phrase that reads in
 * both branches ("about 3 in 10 finishes", "14% of finishes"), so a caller never builds "14% finishes".
 */
export function approxWords(share: number, noun?: string): string {
  if (!finite(share)) return '—';
  const tenths = share * 10;
  const n = Math.round(tenths);
  const gap = tenths - n;
  if (n < 1 || n > 9 || Math.abs(gap) > 0.35) return noun ? `${pct(share)} of ${noun}` : pct(share);
  const words = Math.abs(gap) <= 0.1 ? `about ${n} in 10` : `${gap > 0 ? 'just over' : 'just under'} ${n} in 10`;
  return noun ? `${words} ${noun}` : words;
}

/** Whole minutes as h:mm: 250 → "4:10". */
export function hm(minutes: number): string {
  if (!finite(minutes)) return '—';
  const m = Math.round(minutes);
  const sign = m < 0 ? MINUS : '';
  const a = Math.abs(m);
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
}

/** Seconds as h:mm:ss: 7397 → "2:03:17". */
export function clock(seconds: number): string {
  if (!finite(seconds)) return '—';
  const s = Math.round(Math.abs(seconds));
  const sign = seconds < 0 && s ? MINUS : '';
  return `${sign}${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds as m:ss (an hour or more as h:mm:ss): 162 → "2:42". */
export function ms(seconds: number): string {
  if (!finite(seconds)) return '—';
  const s = Math.round(Math.abs(seconds));
  if (s >= 3600) return clock(seconds);
  const sign = seconds < 0 && s ? MINUS : '';
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A time in the style a sentence needs. */
export function time(seconds: number, style: 'h:mm' | 'h:mm:ss' | 'm:ss' = 'h:mm:ss'): string {
  if (style === 'h:mm') return hm(seconds / 60);
  return style === 'm:ss' ? ms(seconds) : clock(seconds);
}

/** A signed gap: 300 → "+5:00", −162 → "−2:42", 0 → "0:00". */
export function delta(seconds: number): string {
  if (!finite(seconds)) return '—';
  const s = Math.round(seconds);
  return s === 0 ? '0:00' : `${s > 0 ? '+' : MINUS}${ms(Math.abs(s))}`;
}

/** A pace in the reader's units: 300 s/km → "8:03/mi" or "5:00/km". */
export function pace(secondsPerKm: number, units: UnitSystem, withUnit = true): string {
  return paceLabel(secondsPerKm, units, withUnit);
}

/** A ratio: 1.7312 → "1.73×". */
export function ratio(r: number, digits = 2): string {
  return finite(r) ? `${r.toFixed(digits)}×` : '—';
}

/** A temperature in the reader's units: 6.8 °C → "44°F" or "7°C". */
export function temp(celsius: number, units: UnitSystem, digits = 0): string {
  if (!finite(celsius)) return '—';
  const v = units === 'mi' ? celsius * 1.8 + 32 : celsius;
  return `${v.toFixed(digits).replace('-', MINUS)}°${units === 'mi' ? 'F' : 'C'}`;
}

/** A temperature gap in the reader's units (°F gap = °C gap × 9/5): 5 → "9°F" or "5°C". */
export function tempGap(celsius: number, units: UnitSystem, digits = 0): string {
  if (!finite(celsius)) return '—';
  const v = units === 'mi' ? celsius * 1.8 : celsius;
  return `${v.toFixed(digits).replace('-', MINUS)}°${units === 'mi' ? 'F' : 'C'}`;
}

/** A duration said in full for a screen reader: 15000 → "4 hours 10 minutes"; 162 → "2 minutes 42 seconds". */
/** An effect per degree, from per °C (the data) to the reader's degree: per °F is per °C ÷ 1.8 in miles mode. */
export function perDegree(perCelsius: number, units: UnitSystem): number {
  return units === 'mi' ? perCelsius / 1.8 : perCelsius;
}
/** The degree a per-degree effect is shown in: "1 °F" in miles mode, "1 °C" in kilometres. */
export function degreeStep(units: UnitSystem): string {
  return units === 'mi' ? '1 °F' : '1 °C';
}
export function spokenTime(seconds: number): string {
  if (!finite(seconds)) return 'not available';
  const s = Math.round(Math.abs(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const part = (n: number, w: string) => (n ? `${n} ${w}${n === 1 ? '' : 's'}` : '');
  return [part(h, 'hour'), part(m, 'minute'), h ? '' : part(sec, 'second')].filter(Boolean).join(' ') || '0 seconds';
}

/** A share said in full: 0.4716 → "47 percent". */
export function spokenPct(share: number, digits = 0): string {
  return finite(share) ? `${(share * 100).toFixed(digits)} percent` : 'not available';
}
