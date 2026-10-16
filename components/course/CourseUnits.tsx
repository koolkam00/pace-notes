'use client';

import { useUnits } from '@/components/UnitsProvider';

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
