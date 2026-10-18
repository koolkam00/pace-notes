'use client';

import type { ReactNode } from 'react';
import { useUnits } from '@/components/UnitsProvider';

/**
 * One of two server-drawn renders by the reader's units: a chart whose ticks or readout name feet or °F in miles mode
 * and metres or °C in kilometres. The server HTML carries the miles render.
 */
export default function ByUnits({ mi, km }: { mi: ReactNode; km: ReactNode }) {
  const { units } = useUnits();
  return <>{units === 'km' ? km : mi}</>;
}
