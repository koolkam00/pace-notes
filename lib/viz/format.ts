import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

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

/** Checkpoint label in the selected units; source checkpoints stay metric. */
export function checkpointLabel(km: number, units: UnitSystem): string {
  if (km >= 42.19) return 'Finish';
  if (units === 'km') return `${km} km`;
  return `${(km / KM_PER_MILE).toFixed(1)} mi`;
}

export const SECTION_BOUNDS: readonly [number, number][] = [
  [0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195],
];

export function sectionLabel(index: number, units: UnitSystem): string {
  const [a, b] = SECTION_BOUNDS[index];
  if (units === 'km') return `${a}–${b === 42.195 ? '42.2' : b} km`;
  return `${(a / KM_PER_MILE).toFixed(1)}–${(b / KM_PER_MILE).toFixed(1)} mi`;
}

/** Seven-step diverging scale for pace relative to a runner's own reference (negative = faster). */
export const PACE_RAMP = ['#1D3FD8', '#4F79F7', '#9DB6FB', '#EFE8DA', '#FFB48A', '#FF6A3D', '#C8202F'] as const;

/** Continuous diverging colour for a relative pace change in percent. */
export function paceColour(relativePct: number, span = 12): string {
  const stops = PACE_RAMP.map((hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
  const u = Math.max(0, Math.min(1, (relativePct / span + 1) / 2)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const c = stops[i].map((v, k) => Math.round(v + f * (stops[i + 1][k] - v)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
