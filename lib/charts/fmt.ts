/**
 * Value text for the chart renderer: one function from a raw value and a Fmt to the string a tick, a bar end or a note
 * prints. It reuses the nugget formatters, so "47%" or "3:59" reads the same here as anywhere on the site.
 */
import { clock, count, delta, hm, ms, pace, temp, tempGap } from '@/lib/nuggets/format';
import { elevationValue, type UnitSystem } from '@/lib/units';
import type { Fmt } from './spec';

const MINUS = '−';
const signed = (text: string, v: number) => (v > 0 ? `+${text}` : v < 0 ? `${MINUS}${text.replace(/^[-−]/, '')}` : text);

export function fmt(v: number, f: Fmt, units: UnitSystem = 'mi'): string {
  if (!Number.isFinite(v)) return '—';
  switch (f) {
    case 'hm': return hm(v / 60);
    case 'hms': return clock(v);
    case 'ms': return ms(v);
    case 'delta': return delta(v);
    case 'mins': return `${Math.round(v / 60)} min`;
    case 'dmins': { const m = Math.round(v / 60); return `${signed(String(Math.abs(m)), m)} min`; }
    case 'share': return `${Math.round(v * 100)}%`;
    case 'share1': return v === 0 ? '0%' : `${(v * 100).toFixed(1)}%`;
    case 'dpct': { const p = Math.round(v * 100); return `${signed(String(Math.abs(p)), p)}%`; }
    case 'dpts': { const p = Math.round(v * 100) || 0; return `${signed(String(Math.abs(p)), p)} ${Math.abs(p) === 1 ? 'pt' : 'pts'}`; }
    case 'dpct1': { const p = Number((v * 100).toFixed(1)); return `${signed(Math.abs(p).toFixed(1), p)}%`; }
    case 'count': return count(v);
    case 'ratio': return `${v.toFixed(1)}×`;
    case 'ratio2': return `${v.toFixed(2)}×`;
    case 'int': return String(Math.round(v)).replace('-', MINUS);
    case 'num1': return v.toFixed(1).replace('-', MINUS);
    case 'num2': return v.toFixed(2).replace('-', MINUS);
    case 'year': return String(Math.round(v));
    case 'yy': return `’${String(Math.round(v) % 100).padStart(2, '0')}`;
    case 'pace': return pace(v, units, false);
    case 'temp': return temp(v, units);
    case 'dtemp': { const t = tempGap(Math.abs(v), units); return v > 0 ? `+${t}` : v < 0 ? `${MINUS}${t}` : t; }
    case 'elev': { const e = Math.round(elevationValue(v, units)) || 0; return `${e < 0 ? MINUS : ''}${count(Math.abs(e))} ${units === 'mi' ? 'ft' : 'm'}`; }
  }
}

/** The unit a pace axis names in its title ("/mi"). */
export const paceUnit = (units: UnitSystem) => (units === 'mi' ? 'per mile' : 'per km');

/** Round tick values for a format: clock steps for times, round fractions for shares, 1-2-5 steps otherwise. */
export function ticksFor(min: number, max: number, f: Fmt, count = 4, units: UnitSystem = 'mi'): number[] {
  if (!(max > min)) return [min];
  if (f === 'hm' || f === 'hms' || f === 'mins' || f === 'dmins' || f === 'ms' || f === 'delta') {
    const steps = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1200, 1800, 3600, 7200, 10800];
    const raw = (max - min) / count;
    const step = steps.find((s) => s >= raw) ?? 10800;
    return range(min, max, step);
  }
  if (f === 'pace') {
    // Round paces in the reader's units: steps of 15 s, 30 s or a minute per mile or km.
    const k = units === 'mi' ? 1.609344 : 1;
    const raw = ((max - min) * k) / count;
    const step = [5, 10, 15, 30, 60, 120].find((s) => s >= raw) ?? 120;
    return range(min * k, max * k, step).map((v) => v / k);
  }
  if (f === 'temp' || f === 'dtemp') {
    const toU = (c: number) => (units === 'mi' ? (f === 'temp' ? c * 1.8 + 32 : c * 1.8) : c);
    const fromU = (u: number) => (units === 'mi' ? (f === 'temp' ? (u - 32) / 1.8 : u / 1.8) : u);
    return nice(toU(min), toU(max), count).map(fromU);
  }
  if (f === 'elev') {
    // Round heights in the reader's units (feet or metres), drawn back at their metre positions.
    const k = units === 'mi' ? elevationValue(1, units) : 1;
    return nice(min * k, max * k, count).map((v) => v / k);
  }
  if (f === 'year' || f === 'yy' || f === 'int') return nice(min, max, count).filter((v) => Number.isInteger(v));
  return nice(min, max, count);
}

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(9)));
  return out;
}

function nice(min: number, max: number, count: number): number[] {
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return range(min, max, step);
}
