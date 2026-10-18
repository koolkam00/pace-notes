import BigNumber from './BigNumber';
import MarkerBadge from './MarkerBadge';
import Arrow from './Arrow';
import ChapterLink from '@/components/ChapterLink';
import { CHAPTERS, chapterHref, chapterNumber, livePages, partLabel, type Chapter, type ChapterPage, type PageKind, type ReadingOf } from '@/lib/chapters';

/**
 * The chapters as a course line (the redesign spec, section 3.5): each chapter's marker on a dashed line, its title and
 * the pages it holds, in three parts. The reader's chapter is marked "You are here" (aria-current) from the page's own
 * path.
 *
 * Variants:
 * - compact: the menu and the chapters drawer. Marker, title and pages; no readings (a menu is for finding a page). The
 *   whole row links to the chapter's first page.
 * - full: the home guide. Adds "Chapter 01" and the chapter's reading with its key, when `readingOf` resolves it.
 * - expanded: the contents (/research). Each chapter is a heading with its reading, and its pages are the links under
 *   it, each with its own reading when it has one that is not the chapter's (so no figure shows twice and no page has
 *   two links on one screen). Rows carry their ids (chapter-01 …) for /research#chapter-06.
 *
 * `PageList` is the contents filtered to one kind of page (/stories, /analyses): a plain list of pages in race order,
 * each with its chapter and reading.
 *
 * A server component: the rows are markup, and only the links (ChapterLink, for the goal and the units) hydrate.
 */
type Variant = 'compact' | 'full' | 'expanded';

const pagesOf = (chapter: Chapter) => [...chapter.pages.map((p) => p.href), ...(chapter.children ?? []), ...(chapter.also ?? []).map((a) => a.href)];

function Reading({ readingOf, id, fallbackKey, size }: { readingOf?: ReadingOf; id: Chapter['lead']; fallbackKey?: string; size: 's' | 'm' }) {
  const reading = readingOf?.(id);
  if (!reading) return null;
  const key = reading.key ?? fallbackKey;
  return (
    <span className="chapter-reading">
      <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size={size} />
      {key ? <span className="chapter-key">{key}</span> : null}
    </span>
  );
}

/** A page's reading on one quiet line: the figure, then its key ("47% of the field had not reached 20K …"). */
function PageReading({ readingOf, page, skip }: { readingOf?: ReadingOf; page: ChapterPage; skip?: string }) {
  if (page.nugget === skip) return null;
  const reading = readingOf?.(page.nugget);
  if (!reading?.key) return null;
  return (
    <span className="page-reading">
      <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size="s" />
      <span className="page-reading-key">{reading.key}</span>
    </span>
  );
}

export default function ChapterList({ variant = 'full', readingOf, label = 'Chapters', className }: {
  variant?: Variant; readingOf?: ReadingOf; label?: string; className?: string;
}) {
  const parts = ([1, 2, 3] as const).map((part) => ({ part, chapters: CHAPTERS.filter((c) => c.part === part) }));
  const compact = variant === 'compact';
  return (
    <nav className={`chapter-list is-${variant}${className ? ` ${className}` : ''}`} aria-label={label}>
      {parts.map(({ part, chapters }) => (
        <div className="chapter-part" key={part}>
          <p className="chapter-part-label t-kicker">{partLabel(part)}</p>
          <ol className="chapter-rows">
            {chapters.map((chapter) => variant === 'expanded' ? (
              <li className="chapter-row" key={chapter.id} id={chapter.id}>
                <div className="chapter-heading">
                  <span className="chapter-mark"><MarkerBadge marker={chapter.marker} /></span>
                  <h2 className="chapter-text">
                    <span className="chapter-no t-kicker">Chapter {chapterNumber(chapter)}</span>
                    <span className="chapter-name">{chapter.title}</span>
                  </h2>
                  <Reading readingOf={readingOf} id={chapter.lead} fallbackKey={chapter.key} size="s" />
                </div>
                <ol className="chapter-pages">
                  {livePages(chapter).map((page) => (
                    <li key={page.href}>
                      <ChapterLink href={page.href} match={[page.href]} className="chapter-page-link">
                        <span className="chapter-page-title">{page.title}</span>
                        <PageReading readingOf={readingOf} page={page} skip={chapter.lead} />
                        <Arrow className="chapter-page-go" />
                      </ChapterLink>
                    </li>
                  ))}
                </ol>
              </li>
            ) : (
              <li className="chapter-row" key={chapter.id}>
                <ChapterLink href={chapterHref(chapter)} match={pagesOf(chapter)} className="chapter-link">
                  <span className="chapter-mark"><MarkerBadge marker={chapter.marker} /></span>
                  <span className="chapter-text">
                    {compact ? null : <span className="chapter-no t-kicker">Chapter {chapterNumber(chapter)}</span>}
                    <span className="chapter-name">{chapter.title}</span>
                    <span className="chapter-sub">{chapter.subtitle}</span>
                  </span>
                  {compact ? null : <Reading readingOf={readingOf} id={chapter.lead} fallbackKey={chapter.key} size="s" />}
                </ChapterLink>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </nav>
  );
}

/**
 * The contents filtered to one kind of page (and, with `prefix`, one section of the site), in race order (/stories,
 * /analyses): each row is one link with the page's chapter (marker and name), its title and its reading.
 */
export function PageList({ kind, prefix, readingOf, label }: { kind: PageKind; prefix?: string; readingOf?: ReadingOf; label: string }) {
  const rows = CHAPTERS.flatMap((chapter) => livePages(chapter).filter((p) => p.kind === kind && (!prefix || p.href.startsWith(prefix))).map((page) => ({ chapter, page })));
  return (
    <nav className="page-list" aria-label={label}>
      <ol className="page-list-rows">
        {rows.map(({ chapter, page }) => (
          <li key={page.href}>
            <ChapterLink href={page.href} className="page-list-link">
              <span className="page-list-place"><MarkerBadge marker={chapter.marker} /><span className="t-kicker">Chapter {chapterNumber(chapter)} · {chapter.title}</span></span>
              <span className="page-list-title">{page.title}</span>
              <PageReading readingOf={readingOf} page={page} />
              <Arrow className="page-list-go" />
            </ChapterLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}
