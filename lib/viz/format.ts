import { matLabel, sectionLabel as matSection, type UnitSystem } from '@/lib/units';

/** h:mm:ss for an elapsed duration in seconds. */
export function hms(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.round(seconds);
  const sign = s < 0 ? '−' : '';
  const a = Math.abs(s);
  return `${sign}${Math.floor(a / 3600)}:${String(Math.floor((a % 3600) / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`;
}

/** h:mm for a duration in minutes (e.g. 239 → "3:59"). */
export function hm(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.round(minutes);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** m:ss for a duration in seconds, with explicit sign when requested. */
export function mss(seconds: number, signed = false): string {
  if (!Number.isFinite(seconds)) return '—';
  const s = Math.round(Math.abs(seconds));
  const sign = signed ? (seconds < 0 ? '−' : '+') : seconds < 0 ? '−' : '';
  return `${sign}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function pct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function signedPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const v = Number(value.toFixed(digits));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}%`;
}

export function count(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '—';
}

export function compact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 1 : 2)} million`;
  if (Math.abs(value) >= 1e4) return `${Math.round(value / 1e3)}k`;
  return value.toLocaleString('en-US');
}

/**
 * A checkpoint's name: the mat, the same in both unit modes (owner decision 4): 30 → "30K", 42.195 → "Finish". The
 * units argument stays so every caller keeps its signature; it no longer changes the label.
 */
export function checkpointLabel(km: number, _units?: UnitSystem): string {
  return matLabel(km);
}

export const SECTION_BOUNDS: readonly [number, number][] = [
  [0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195],
];

/** A recorded section by index (0 = 0–5K … 8 = 40K–finish), named by its mats in both unit modes. */
export function sectionLabel(index: number, _units?: UnitSystem): string {
  const bounds = SECTION_BOUNDS[index];
  return bounds ? matSection(bounds[0], bounds[1]) : '—';
}

/**
 * Seven-step diverging scale for pace relative to a runner's own reference (negative = faster), for heatmaps only.
 * Faster runs to blue, slower through rose to a deep crimson, so a slow block never reads as the signal orange
 * (principle 3): every warm stop sits at OKLab ΔE ≥ 15 from --signal and --night-signal, and every colour on the warm
 * half at ≥ 14 (verify-css checks both). Each stop carries ink or paper text at 4.5:1 or better (`paceText`).
 */
export const PACE_RAMP = ['#1D3FD8', '#4F79F7', '#9DB6FB', '#EFE8DA', '#EDA6C1', '#C65F9E', '#8F1449'] as const;

/** Continuous diverging colour for a relative pace change in percent. */
export function paceColour(relativePct: number, span = 12): string {
  const stops = PACE_RAMP.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  const u = Math.max(0, Math.min(1, (relativePct / span + 1) / 2)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const c = stops[i].map((v, k) => Math.round(v + f * (stops[i + 1][k] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** The text colour that reads best on a `paceColour` block: ink on the light middle, paper on the dark ends. */
export function paceText(rgb: string): 'ink' | 'paper' {
  const [r, g, b] = (rgb.match(/\d+/g) ?? ['0', '0', '0']).map((v) => { const c = Number(v) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (l + 0.05) / 0.0619 >= 0.92 / (l + 0.05) ? 'ink' : 'paper';
}
