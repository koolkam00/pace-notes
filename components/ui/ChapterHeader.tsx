import type { ReactNode } from 'react';
import MarkerBadge from './MarkerBadge';
import { withEm } from './withEm';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { chapterNumber, contentsHref, placeLabel, placeOf } from '@/lib/chapters';

/**
 * The crumbs of a page in the race (the redesign spec, section 3.5): "[FINISH] Chapter 06 · The finish line · Story 1
 * of 2". The chapter part links to its row on the contents (/research#chapter-06), 44 px tall through padding. Pass it
 * as Reading's `crumbs`; null for a page outside the race.
 */
export function ChapterCrumbs({ path }: { path: string }) {
  const place = placeOf(path);
  if (!place) return null;
  const { chapter } = place;
  const where = placeLabel(path);
  return (
    <>
      <MarkerBadge marker={chapter.marker} />
      <Link href={contentsHref(chapter)} className="crumb-chapter">Chapter {chapterNumber(chapter)} · {chapter.title}</Link>
      {where ? <span className="crumb-place">· {where}</span> : null}
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
