'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Archetypes, CourseGeometry, Courses, Demographics, FinishTimes, Kick, Positions, ReplayIndex } from '@/lib/insights';

/**
 * Story datasets shared by the client charts on a page. A server body passes each dataset to this
 * provider once, instead of to every chart: React serializes an object a second time when it is
 * passed to several client components, which doubled the size of each story page.
 */
export interface StoryDataValue {
  archetypes?: Archetypes;
  finish?: FinishTimes;
  positions?: Positions;
  kick?: Kick;
  demographics?: Demographics;
  courses?: Courses;
  geometry?: CourseGeometry[];
  replay?: ReplayIndex;
}

const StoryDataContext = createContext<StoryDataValue>({});

export function StoryData({ value, children }: { value: StoryDataValue; children: ReactNode }) {
  const parent = useContext(StoryDataContext);
  const merged = useMemo(() => ({ ...parent, ...value }), [parent, value]);
  return <StoryDataContext.Provider value={merged}>{children}</StoryDataContext.Provider>;
}

/** A dataset from the nearest StoryData provider, unless the chart was given it directly. */
export function useStoryData<K extends keyof StoryDataValue>(key: K, given?: StoryDataValue[K]): NonNullable<StoryDataValue[K]> {
  const context = useContext(StoryDataContext);
  const value = given ?? context[key];
  if (value == null) throw new Error(`Story chart needs "${key}" data from a StoryData provider or a prop.`);
  return value as NonNullable<StoryDataValue[K]>;
}

/** Like useStoryData, but returns undefined when no provider supplies the dataset. */
export function useOptionalStoryData<K extends keyof StoryDataValue>(key: K): StoryDataValue[K] {
  return useContext(StoryDataContext)[key];
}
