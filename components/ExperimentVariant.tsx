'use client';

import { useEffect, useState } from 'react';
import { activeVariants } from '@/lib/experiment-runtime';

/** This tab's variant of an experiment, for behaviour rather than markup. 'control' until mounted, and when none applies. */
export function useVariant(key: string): string {
  const [variant, setVariant] = useState('control');
  useEffect(() => { setVariant(activeVariants()[key] ?? 'control'); }, [key]);
  return variant;
}
