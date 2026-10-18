'use client';
import type { ReactNode } from 'react';
import { useUnits } from '@/components/UnitsProvider';

/**
 * Two server-drawn versions of one thing, in miles and in kilometres, and the visitor's one shown. The server HTML holds
 * the miles view (the default); the kilometres view arrives in the page data and replaces it once the units are read.
 * For a sentence, receipt or chart whose numbers change with the units, drawn on the server for both.
 */
export default function ByUnits({ mi, km }: { mi: ReactNode; km: ReactNode }) {
  const { units } = useUnits();
  return <>{units === 'km' ? km : mi}</>;
}
