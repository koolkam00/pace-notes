'use client';
import type { ReactNode } from 'react';
import { useUnits } from '@/components/UnitsProvider';

/**
 * Text or a figure in the reader's units: the server renders both versions and this island shows the one the units
 * switch names (miles, the default, in the server HTML and the first render). The page must be on unitSwitchShown.
 */
export default function ByUnits({ mi, km }: { mi: ReactNode; km: ReactNode }) {
  const { units } = useUnits();
  return <>{units === 'km' ? km : mi}</>;
}
