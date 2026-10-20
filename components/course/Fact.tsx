import Link from 'next/link';
import type { ReactNode } from 'react';
import type { TRACKED_SECTIONS } from '@/lib/analytics-policy';
import { withEm } from '@/components/ui/withEm';
import { joinRanges } from '@/components/ui/keepTogether';
import type { Nugget } from '@/lib/nuggets';
import UnitsText from './UnitsText.client';

type TrackedSection = (typeof TRACKED_SECTIONS)[number];

/**
 * One printed figure from the data files: `<data value="raw" data-k="key">shown</data>`. The key names the field it came
 * from (the grammar is in scripts/verify-courses.cjs), so the built-page check can look the value up in the file itself
 * and compare both the value and the text the visitor sees. Units components inside it print the default miles view.
 */
export function Fact({ k, v, children }: { k: string; v: number | string; children: ReactNode }) {
  return <data value={String(v)} data-k={k}>{children}</data>;
}

/**
 * A link to a section of this page. It goes through the app router (next/link), not a plain `href="#…"`: a plain
 * fragment link adds a history entry the router ignores on Back, so after following any other link, Back would show the
 * course page's address over the page left. The router scrolls to the section and focuses it (sections take focus).
 */
export function SectionLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return <Link href={`#${to}`} prefetch={false} className={className}>{children}</Link>;
}

/**
 * A nugget's sentence as the page shows it: the headline when its guard holds, else the neutral fallback, with its one
 * *…* accent as <em>, its ranges kept whole. A sentence that names a distance or a temperature follows the units switch.
 */
export function Said({ nugget }: { nugget: Nugget }) {
  const text = nugget.guard ? nugget.headline : nugget.fallback;
  // A section range ("35–40K", "20–25K") never breaks at its dash (round 6): a word joiner follows it.
  if (typeof text === 'string') return <>{withEm(joinRanges(text))}</>;
  return <UnitsText mi={joinRanges(text.mi)} km={joinRanges(text.km)} />;
}

/**
 * A course section (the redesign spec, section 4.3, cut under section 00): one finding as its H2, one chart, nothing
 * boxed. Marked for section_viewed with its generic id, and a beat for the reading bar.
 */
export function CourseSection({ id, track, beat, title, className = '', children }: {
  id: string; track?: TrackedSection; beat: string; title: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <section id={id} tabIndex={-1} className={`course-beat ${className}`.trim()} aria-labelledby={`${id}-title`} data-beat={beat} {...(track ? { 'data-track-section': track } : {})}>
      <h2 id={`${id}-title`} className="course-h2">{title}</h2>
      {children ? <div className="course-beat-body">{children}</div> : null}
    </section>
  );
}

/**
 * A course table in its sideways-scrolling wrapper: a named region that takes keyboard focus, so it can be scrolled
 * without a mouse, labelled by the table's own caption (a small heading, or for a table that is its section's chart,
 * spoken only).
 */
export function CourseTable({ id, caption, captionHidden = false, className = '', children }: { id: string; caption: ReactNode; captionHidden?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className="tool-table-wrap course-table-wrap" role="region" aria-labelledby={id} tabIndex={0}>
      <table className={`tool-table course-table ${className}`.trim()}>
        <caption id={id} className={captionHidden ? 'sr-only' : undefined}>{caption}</caption>
        {children}
      </table>
    </div>
  );
}
