/**
 * Copy editions: editions whose records largely repeat another edition of the same race (Chicago 2018 and 2019
 * repeated the Chicago 2024 field in the September 2026 release; the October 2026 release removed them, so the list is
 * empty today; docs/KNOWN_ISSUES.md). The list comes from the verified
 * story manifest's duplicate-edition screen through `copyEditions()` in lib/duplicate-editions.ts, which re-exports
 * these helpers for server code. They are pure, so client components (the runner search) import them from here,
 * without the manifest reader's file access. An empty list changes nothing.
 */

export type CopyEdition = {
  city: string;
  year: number;
  /** The year of the same race whose field this edition repeats. */
  duplicate_of: number;
  /** Eligible finishes recorded under this edition. */
  eligible_removed: number;
  /** Of those, finishes whose nine checkpoint times all match a finish in `duplicate_of`. */
  identical_nine_time_twins: number;
};

const count = (value: number) => value.toLocaleString('en-US');

/** The copy-edition entry for an edition (by city and year), if it is one. */
export function copyEditionOf(edition: { city: string; year: number }, copies: readonly CopyEdition[]): CopyEdition | undefined {
  return copies.find(copy => copy.city === edition.city && copy.year === edition.year);
}

export function isCopyEdition(edition: { city: string; year: number }, copies: readonly CopyEdition[]): boolean {
  return copyEditionOf(edition, copies) !== undefined;
}

/**
 * One sentence for a copy edition, built only from the screen's counts. Never from its `reason` text, whose
 * participant-id claim the public shards cannot re-verify, and never "the same names" or "all": some names and some
 * finishes in each copy are not in the other field.
 */
export function copyEditionSentence(entry: CopyEdition): string {
  const { city, year, duplicate_of: source } = entry;
  return `${city} ${year}'s records largely repeat the ${city} ${source} field (${count(entry.identical_nine_time_twins)} of its ${count(entry.eligible_removed)} finishes share all nine checkpoint times with a ${source} finish), so they are shown as recorded times only, without pacing, peer or weather comparisons.`;
}
