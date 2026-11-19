import Link from 'next/link';
import { LINKED_BY_NAME, linkedEditionReading } from '@/lib/linked-server';

/**
 * The year's verdict from the linked-records family ("a slow year for linked runners"), as one quiet column of an edition
 * table on a course page and a results page (November 19, 2026). The words and the guard are lib/linked-server.ts's
 * (`linkedEditionReading`, recounted in scripts/nuggets/linked.cjs); a year without a verdict prints a dash, and a table
 * whose race has no verdict in any year has no column at all. An edition a written review released from the hold links
 * to that review. The page says once, under the table, that the records are linked by name.
 */

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1);

/** Whether any of these years of the race has a verdict: the column shows only then. */
export const hasLinkedYears = (label: string, years: number[]) => years.some((year) => linkedEditionReading(label, year) !== null);

/** The column's header. */
export const LinkedYearHead = () => <th scope="col" className="is-text">Linked runners</th>;

/** One edition's cell: the verdict's words, or a dash. */
export function LinkedYearCell({ label, year }: { label: string; year: number }) {
  const reading = linkedEditionReading(label, year);
  if (!reading) return <td className="is-text linked-year">—</td>;
  return (
    <td className="is-text linked-year" data-linked={reading.verdict}>
      {capital(reading.words)}{reading.reviewed ? <>{' '}<Link href={reading.reviewHref} prefetch={false} className="linked-year-review">(reviewed)</Link></> : null}
    </td>
  );
}

/** The one line a page with a verdict says about it, under its table. */
export const LinkedYearNote = () => <p className="course-note linked-year-note">Linked runners: {LINKED_BY_NAME}.</p>;
