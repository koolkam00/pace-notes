'use client';
import { useUnits } from '@/components/UnitsProvider';
import { withEm } from '@/components/ui/withEm';

/**
 * A units-aware nugget sentence (lib/nuggets: `headline: { mi, km }`) in the reader's units, its one *…* accent as <em>.
 * The server HTML and the first render are in miles, the default; the page must be on unitSwitchShown.
 */
export default function UnitSentence({ mi, km }: { mi: string; km: string }) {
  const { units } = useUnits();
  return <>{withEm(units === 'km' ? km : mi)}</>;
}
