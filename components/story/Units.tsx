'use client';

import { useUnits } from '@/components/UnitsProvider';
import { KM_PER_MILE, paceLabel } from '@/lib/units';
import { checkpointLabel, sectionLabel } from '@/lib/viz/format';

/** A distance in the reader's chosen units; the source value stays metric. */
export function Distance({ km, digits = 1, unit = true }: { km: number; digits?: number; unit?: boolean }) {
  const { units } = useUnits();
  const value = units === 'mi' ? km / KM_PER_MILE : km;
  return <>{value.toFixed(digits)}{unit ? (units === 'mi' ? ' mi' : ' km') : ''}</>;
}

export function DistanceUnit({ plural = false }: { plural?: boolean }) {
  const { units } = useUnits();
  return <>{units === 'mi' ? (plural ? 'miles' : 'mile') : plural ? 'kilometres' : 'km'}</>;
}

export function Pace({ secondsPerKm }: { secondsPerKm: number }) {
  const { units } = useUnits();
  return <>{paceLabel(secondsPerKm, units)}</>;
}

/** An elevation in feet (miles mode) or metres. */
export function Elevation({ metres }: { metres: number }) {
  const { units } = useUnits();
  return <>{units === 'mi' ? `${Math.round(metres / 0.3048).toLocaleString('en-US')} ft` : `${Math.round(metres).toLocaleString('en-US')} m`}</>;
}

/** A temperature in °F (miles mode) or °C. Source values are Celsius. */
export function Temperature({ c, digits = 0 }: { c: number; digits?: number }) {
  const { units } = useUnits();
  return <>{units === 'mi' ? `${(c * 1.8 + 32).toFixed(digits)}°F` : `${c.toFixed(digits)}°C`}</>;
}

/** A temperature difference, e.g. 5 °C → "9°F". */
export function TemperatureStep({ c, digits = 0 }: { c: number; digits?: number }) {
  const { units } = useUnits();
  return <>{units === 'mi' ? `${(c * 1.8).toFixed(digits)}°F` : `${c.toFixed(digits)}°C`}</>;
}

/** A rate per degree, converted from per °C to per °F in miles mode. */
export function PerDegree({ perC, digits = 2, unit }: { perC: number; digits?: number; unit: string }) {
  const { units } = useUnits();
  const v = units === 'mi' ? perC / 1.8 : perC;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return <>{sign}{Math.abs(v).toFixed(digits)}{unit ? ` ${unit}` : ''} per {units === 'mi' ? '°F' : '°C'}</>;
}

/** A per-degree interval, e.g. "0.54 to 0.94". */
export function PerDegreeRange({ lo, hi, digits = 2 }: { lo: number; hi: number; digits?: number }) {
  const { units } = useUnits();
  const k = units === 'mi' ? 1 / 1.8 : 1;
  return <>{(lo * k).toFixed(digits)} to {(hi * k).toFixed(digits)}</>;
}

/** A checkpoint distance in the reader's units, e.g. 30 → "18.6 mi". */
export function Checkpoint({ km }: { km: number }) {
  const { units } = useUnits();
  return <>{checkpointLabel(km, units)}</>;
}

/** A recorded section (0 = 0–5 km … 8 = 40–42.2 km) in the reader's units. */
export function Section({ i }: { i: number }) {
  const { units } = useUnits();
  return <>{sectionLabel(i, units)}</>;
}
