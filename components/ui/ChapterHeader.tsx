import type { ReactNode } from 'react';
import MarkerBadge from './MarkerBadge';
import { withEm } from './withEm';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { chapterNumber, contentsHref, placeLabel, placeOf } from '@/lib/chapters';

/**
 * The crumbs of a page in the race (the redesign spec, section 3.5), the one treatment every page in the race uses:
 * "[FINISH] Chapter 06 · The finish line · Page 1 of 2". The chapter's number shows once: a chapter after the finish
 * (07 to 11) has it on its badge, so its text is the title alone ("[08] Where you run"; screen readers still hear
 * "Chapter 08"). The chapter part links to its row on the contents (/research#chapter-06), 44 px tall. The place
 * shows from 600 px: the page's "Page N of M" (lib/chapters.ts placeLabel), or `place` when the page names its own
 * (a course page's "Courses"), or nothing with `place={false}`. Its separator is drawn by CSS in the gap before it,
 * so a wrapped line never opens on "·". Pass it as Reading's `crumbs`; null for a page outside the race.
 */
export function ChapterCrumbs({ path, place: own }: { path: string; place?: ReactNode | false }) {
  const place = placeOf(path);
  if (!place) return null;
  const { chapter } = place;
  const number = chapterNumber(chapter);
  const where = own === false ? null : own ?? placeLabel(path);
  return (
    <>
      <MarkerBadge marker={chapter.marker} />
      <Link href={contentsHref(chapter)} className="crumb-chapter">
        <span className="crumb-text">
          {chapter.marker === number
            ? <><span className="sr-only">Chapter {number} · </span>{chapter.title}</>
            : <><span className="crumb-number">Chapter {number}{'\u00a0·'}</span>{' '}<span className="crumb-title">{chapter.title}</span></>}
        </span>
      </Link>
      {where ? <span className="crumb-place">{where}</span> : null}
    </>
  );
}

/**
 * The opener of a page in the race that does not use Reading: the crumbs, the H1 (one *…* accent, rendered as <em>) and
 * the dek. Reading pages pass <ChapterCrumbs> to Reading instead.
 */
export default function ChapterHeader({ path, title, dek, titleSize = 'display', className }: {
  path: string; title: string | ReactNode; dek?: ReactNode; titleSize?: 'display' | 'title'; className?: string;
}) {
  return (
    <header className={`chapter-header${className ? ` ${className}` : ''}`}>
      <div className="reading-crumbs t-kicker"><ChapterCrumbs path={path} /></div>
      <h1 className={`reading-title t-${titleSize}`}>{typeof title === 'string' ? withEm(title) : title}</h1>
      {dek ? <p className="reading-dek">{dek}</p> : null}
    </header>
  );
}
