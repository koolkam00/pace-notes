import BigNumber from './BigNumber';
import MarkerBadge from './MarkerBadge';
import ChapterLink from '@/components/ChapterLink';
import { CHAPTERS, chapterHref, chapterNumber, livePages, partLabel, type Chapter, type ReadingOf } from '@/lib/chapters';

/**
 * The chapters as a course line (the redesign spec, section 3.5): each chapter's marker on a dashed line, its title and
 * the pages it holds, in three parts. The whole row links to the chapter's first page; the reader's chapter is marked
 * "You are here" (aria-current) from the page's own path.
 *
 * Variants:
 * - compact: the menu and the chapters drawer. Marker, title and pages; no readings (a menu is for finding a page).
 * - full: the home guide. Adds "Chapter 01" and the chapter's reading with its key, when `readingOf` resolves it.
 * - expanded: the contents (/research). As full, and each chapter lists its pages as sub-rows with their readings; rows
 *   carry their ids (chapter-01 …) for /research#chapter-06.
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
            {chapters.map((chapter) => (
              <li className="chapter-row" key={chapter.id} {...(variant === 'expanded' ? { id: chapter.id } : {})}>
                <ChapterLink href={chapterHref(chapter)} match={pagesOf(chapter)} className="chapter-link">
                  <span className="chapter-mark"><MarkerBadge marker={chapter.marker} /></span>
                  <span className="chapter-text">
                    {compact ? null : <span className="chapter-no t-kicker">Chapter {chapterNumber(chapter)}</span>}
                    <span className="chapter-name">{chapter.title}</span>
                    <span className="chapter-sub">{chapter.subtitle}</span>
                  </span>
                  {compact ? null : <Reading readingOf={readingOf} id={chapter.lead} fallbackKey={chapter.key} size="s" />}
                </ChapterLink>
                {variant === 'expanded' ? (
                  <ol className="chapter-pages">
                    {livePages(chapter).map((page) => (
                      <li key={page.href}>
                        <ChapterLink href={page.href} match={[page.href]} className="chapter-page-link">
                          <span className="chapter-page-title">{page.title}</span>
                          <Reading readingOf={readingOf} id={page.nugget} size="s" />
                        </ChapterLink>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </nav>
  );
}
