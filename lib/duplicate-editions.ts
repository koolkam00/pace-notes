/**
 * Copy editions for server code: `copyEditions()` reads the verified story manifest's duplicate-edition screen at
 * build time, so no year or count is typed in, and the helpers are re-exported from lib/duplicate-editions-shared.ts.
 * Server only (it reads files); client components import the helpers from that module and get the list as props.
 * `scripts/verify-duplicate-editions.cjs` fails when the screen misses a same-city twin pair or keeps a stale one.
 */
import { getInsightsManifest } from './insights-server';
import type { CopyEdition } from './duplicate-editions-shared';

export { copyEditionOf, copyEditionSentence, isCopyEdition, type CopyEdition } from './duplicate-editions-shared';

const integer = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && Number(value) >= minimum;

/** The copy editions in the adopted release, ordered by city and year: empty once a release without copies is adopted. */
export function copyEditions(): CopyEdition[] {
  const screen = getInsightsManifest().duplicate_edition_screen ?? [];
  return screen.map(({ city, year, duplicate_of, eligible_removed, identical_nine_time_twins }) => {
    if (typeof city !== 'string' || !city || !integer(year, 1) || !integer(duplicate_of, 1) || duplicate_of === year
      || !integer(eligible_removed, 1) || !integer(identical_nine_time_twins, 1) || identical_nine_time_twins > eligible_removed) {
      throw new Error(`The duplicate-edition screen has an unusable entry: ${city} ${year}`);
    }
    return { city, year, duplicate_of, eligible_removed, identical_nine_time_twins };
  }).sort((a, b) => a.city.localeCompare(b.city) || a.year - b.year);
}
