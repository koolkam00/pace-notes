'use client';

import { useState } from 'react';
import type { Archetypes } from '@/lib/insights';
import { ArchetypeCards, ArchetypeRace } from './ArchetypeStory';
import { useStoryData } from './StoryData';

/** The race and the cards share a focused archetype. */
export default function ArchetypeChapter({ data: given }: { data?: Archetypes }) {
  const data = useStoryData('archetypes', given);
  const [focus, setFocus] = useState<number | null>(null);
  return (
    <>
      <ArchetypeRace data={data} focus={focus} onFocus={setFocus} />
      <ArchetypeCards data={data} focus={focus} onFocus={setFocus} />
    </>
  );
}
