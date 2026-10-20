'use client';

import { useUnits } from '@/components/UnitsProvider';
import { withEm } from '@/components/ui/withEm';

/** A nugget sentence that names a distance or a temperature, in the reader's units (the miles text in the server HTML). */
export default function UnitsText({ mi, km }: { mi: string; km: string }) {
  const { units } = useUnits();
  return <>{withEm(units === 'km' ? km : mi)}</>;
}
