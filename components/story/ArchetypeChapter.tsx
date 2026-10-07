'use client';

import { useState } from 'react';
import type { Archetypes } from '@/lib/insights';
import { ArchetypeCards, ArchetypeRace } from './ArchetypeStory';

/** The race and the cards share a focused archetype. */
export default function ArchetypeChapter({ data }: { data: Archetypes }) {
  const [focus, setFocus] = useState<number | null>(null);
  return (
    <>
      <ArchetypeRace data={data} focus={focus} onFocus={setFocus} />
      <ArchetypeCards data={data} focus={focus} onFocus={setFocus} />
    </>
  );
}
