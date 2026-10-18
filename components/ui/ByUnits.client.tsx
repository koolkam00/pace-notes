'use client';
import type { ReactNode } from 'react';
import { useUnits } from '@/components/UnitsProvider';

/**
 * Two server-drawn versions of one thing, in miles and in kilometres, and the reader's one shown: a sentence, a receipt
 * or a chart whose numbers, ticks or readout change with the units. The server HTML (and the first render) holds the
 * miles version, the default; the kilometres version arrives in the page data and replaces it once the units are read.
 * The page must be on unitSwitchShown (lib/unit-preference.ts).
 */
export default function ByUnits({ mi, km }: { mi: ReactNode; km: ReactNode }) {
  const { units } = useUnits();
  return <>{units === 'km' ? km : mi}</>;
}
