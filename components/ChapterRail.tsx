import MarkerBadge from './ui/MarkerBadge';
import ChapterLink from './ChapterLink';
import RailBeats from './RailBeats.client';
import { chapterNumber, cleanPath, livePages, placeOf } from '@/lib/chapters';

/**
 * The chapter rail (the redesign spec, section 2.5): from 1180 px, a sticky left column of 200 px on a page in the race.
 * The marker and the chapter's title, its pages with the current one marked, and under it the page's beats as anchors,
 * the one in view marked (RailBeats). Pages place it as the first child of a .with-rail grid (layout.css); under 1180 px
 * it is not shown. Course pages have none: their nav.course-toc does the job.
 */
export default function ChapterRail({ path }: { path: string }) {
  const place = placeOf(path);
  if (!place) return null;
  const { chapter } = place;
  const here = cleanPath(path);
  return (
    <aside className="rail chapter-rail">
      <nav aria-label={`Chapter ${chapterNumber(chapter)}`}>
        {/* The chapter's number shows once: a chapter after the finish has it on its badge (as in ChapterCrumbs). */}
        <p className="rail-chapter"><MarkerBadge marker={chapter.marker} />{chapter.marker === chapterNumber(chapter)
          ? <span className="sr-only">Chapter {chapterNumber(chapter)}</span>
          : <span className="t-kicker">Chapter {chapterNumber(chapter)}</span>}</p>
        <p className="rail-title">{chapter.title}</p>
        <ol className="rail-pages">
          {/* The chapter's hub (Every course) after its chain: the course pages' parent, reached from the rail. */}
          {[...livePages(chapter), ...(chapter.hub ? [chapter.hub] : [])].map((page) => (
            <li key={page.href}>
              <ChapterLink href={page.href} className="rail-link" {...(page.href === here ? { 'aria-current': 'page' as const } : {})}>{page.short}</ChapterLink>
              {page.href === here ? <RailBeats /> : null}
            </li>
          ))}
        </ol>
      </nav>
    </aside>
  );
}
