'use client';

import { useUnits } from '@/components/UnitsProvider';
import type { UnitSystem } from '@/lib/units';

/**
 * A temperature in whole °F (miles mode) or °C, from Celsius, rounded first and then signed with a true minus, so a
 * value that rounds to zero never prints as "−0": −0.4 °C is "0°C", −1.2 °C is "−1°C".
 */
export function degreesText(c: number, units: UnitSystem): string {
  const value = Number((units === 'mi' ? c * 1.8 + 32 : c).toFixed(0)) || 0;
  return `${value < 0 ? '−' : ''}${Math.abs(value)}°${units === 'mi' ? 'F' : 'C'}`;
}

/** A temperature in the reader's units (degreesText). */
export function Degrees({ c }: { c: number }) {
  const { units } = useUnits();
  return <>{degreesText(c, units)}</>;
}

/** A wind speed in mph (miles mode) or km/h, from metres per second, one decimal. */
export function Wind({ mps }: { mps: number }) {
  const { units } = useUnits();
  return <>{(mps * (units === 'mi' ? 2.2369362920544 : 3.6)).toFixed(1)} {units === 'mi' ? 'mph' : 'km/h'}</>;
}

/** A signed elevation change in feet (miles mode) or metres, with a true minus sign: −238 ft, +3 ft, 0 ft. */
export function NetElevation({ metres }: { metres: number }) {
  const { units } = useUnits();
  const value = Math.round(Math.abs(metres) / (units === 'mi' ? 0.3048 : 1));
  return <>{value === 0 ? '' : metres < 0 ? '−' : '+'}{value.toLocaleString('en-US')} {units === 'mi' ? 'ft' : 'm'}</>;
}
