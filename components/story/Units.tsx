'use client';

import { useUnits } from '@/components/UnitsProvider';
import { KM_PER_MILE, paceLabel } from '@/lib/units';

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
