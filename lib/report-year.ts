// One line of year context from the linked-records family in a runner record's race report (/runners only). A module of
// its own, with no import, so the runner view carries it without the report's code.

/** The linked family's edition verdicts, in the order of a row's code. */
export const LINKED_VERDICT_CODES = ['slow', 'fast', 'usual'] as const;
export type LinkedVerdictCode = (typeof LINKED_VERDICT_CODES)[number];
/**
 * What the server hands the runner page (app/runners/page.tsx, from lib/linked-server.ts linkedEditionReading): the
 * editions that have a verdict under the family's own guard, as [label, year, verdict code, reviewed]; the words of
 * each verdict and the family's "records linked by name", passed once; each race's story link. The client only picks
 * the selected edition's row: it never recomputes a verdict.
 */
export interface LinkedYears {
  words: Readonly<Record<LinkedVerdictCode, string>>;
  byName: string;
  reviewHref: string;
  hrefs: Readonly<Record<string, string>>;
  rows: readonly [label: string, year: number, verdict: 0 | 1 | 2, reviewed: 0 | 1][];
}
export interface LinkedYear { words: string; byName: string; href: string; reviewed: boolean; reviewHref: string }

/** The selected edition's line, or null when the family states nothing about that year (no row: print nothing). */
export function linkedYearOf(years: LinkedYears | undefined, label: string, year: number): LinkedYear | null {
  const row = years?.rows.find(([l, y]) => l === label && y === year);
  if (!years || !row) return null;
  const href = years.hrefs[label];
  if (!href) return null;
  return { words: years.words[LINKED_VERDICT_CODES[row[2]]], byName: years.byName, href, reviewed: row[3] === 1, reviewHref: years.reviewHref };
}
