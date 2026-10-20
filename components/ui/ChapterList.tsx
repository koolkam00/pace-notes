import BigNumber from './BigNumber';
import { joinRanges } from '@/components/ui/keepTogether';
import MarkerBadge from './MarkerBadge';
import Arrow from './Arrow';
import ChapterLink from '@/components/ChapterLink';
import { CHAPTERS, chapterHref, livePages, partLabel, type Chapter, type ChapterPage, type PageKind, type ReadingOf } from '@/lib/chapters';

/**
 * The chapters as a course line (the redesign spec, section 3.5): each chapter's marker on a dashed line, its title and
 * the pages it holds, in three parts. The reader's chapter is marked "You are here" (aria-current) from the page's own
 * path.
 *
 * Variants:
 * - compact: the menu and the chapters drawer. Marker, title and pages; no readings (a menu is for finding a page). The
 *   whole row links to the chapter's first page.
 * - full: the home guide. Adds the chapter's reading with its key, when `readingOf` resolves it, and the trailing
 *   arrow every other list of links on the site carries, so each row reads as a way in.
 * - expanded: the contents (/research). Each chapter is a heading with its reading, and its pages are the links under
 *   it, by title alone: one reading per chapter, so the list stays one calm rhythm and no figure shows twice. Keys are
 *   plain text (round 4: a term link in a row's key was a second tap target). Rows carry their ids (chapter-01 …) for
 *   /research#chapter-06.
 *
 * Every row has one template: the marker, the name (and on the home guide the pages it holds), the reading. No
 * "Chapter 01" kicker: the marker on the course line already says where in the race a chapter is.
 *
 * `PageList` is the contents filtered to one kind of page (/stories, /analyses): a plain list of pages in race order,
 * each with its chapter and reading.
 *
 * A server component: the rows are markup, and only the links (ChapterLink, for the goal and the units) hydrate.
 */
type Variant = 'compact' | 'full' | 'expanded';

const pagesOf = (chapter: Chapter) => [...chapter.pages.map((p) => p.href), ...(chapter.hub ? [chapter.hub.href] : []), ...(chapter.children ?? []), ...(chapter.also ?? []).map((a) => a.href)];

/** A key as plain text: the rows are links (or sit in a whole-row link), so a key never holds a second tap target; the
 *  page a row opens links the term in its own first screen. */
function KeyText({ text }: { text: string }) {
  return <>{joinRanges(text)}</>;
}

function Reading({ readingOf, id, fallbackKey, size }: { readingOf?: ReadingOf; id: Chapter['lead']; fallbackKey?: string; size: 's' | 'm' }) {
  const reading = readingOf?.(id);
  if (!reading) return null;
  const key = reading.key ?? fallbackKey;
  return (
    <span className="chapter-reading">
      <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size={size} />
      {key ? <span className="chapter-key"><KeyText text={key} /></span> : null}
    </span>
  );
}

/** A page's reading on one quiet line (/stories, /analyses): the figure, then its key ("47% of the field had not …"). */
function PageReading({ readingOf, page }: { readingOf?: ReadingOf; page: ChapterPage }) {
  const reading = readingOf?.(page.nugget);
  if (!reading?.key) return null;
  return (
    <span className="page-reading">
      <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size="s" />
      <span className="page-reading-key"><KeyText text={reading.key} /></span>
    </span>
  );
}

export default function ChapterList({ variant = 'full', readingOf, label = 'Chapters', className, extra = {} }: {
  variant?: Variant; readingOf?: ReadingOf; label?: string; className?: string;
  /** Expanded only: plain links a chapter also holds (pages still in the sitemap that no chapter lists), by chapter id. */
  extra?: Record<string, { href: string; label: string }[]>;
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
                    <span className="chapter-name">{chapter.title}</span>
                  </h2>
                  <Reading readingOf={readingOf} id={chapter.lead} fallbackKey={chapter.key} size="s" />
                </div>
                <ol className="chapter-pages">
                  {/* The chapter's hub (Every course) closes its list: a page of the chapter, outside its chain. */}
                  {[...livePages(chapter), ...(chapter.hub ? [chapter.hub] : [])].map((page) => (
                    <li key={page.href}>
                      <ChapterLink href={page.href} match={[page.href]} className="chapter-page-link">
                        <span className="chapter-page-title">{page.title}</span>
                        <Arrow className="chapter-page-go" />
                      </ChapterLink>
                    </li>
                  ))}
                  {(extra[chapter.id] ?? []).map((link) => (
                    <li key={link.href}>
                      <ChapterLink href={link.href} match={[link.href]} className="chapter-page-link">
                        <span className="chapter-page-title">{link.label}</span>
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
                    <span className="chapter-name">{chapter.title}</span>
                    <span className="chapter-sub">{chapter.subtitle}</span>
                  </span>
                  {compact ? null : <Reading readingOf={readingOf} id={chapter.lead} fallbackKey={chapter.key} size="s" />}
                  {compact ? null : <Arrow className="chapter-go" />}
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
 * /analyses): the pages grouped under their chapter's line (its marker and name, said once), each row the page's
 * title as its link, then its reading. The link covers the whole row from behind (its ::after), so the row is one tap
 * target; its key is plain text, never a second link.
 */
export function PageList({ kind, prefix, readingOf, label }: { kind: PageKind | PageKind[]; prefix?: string; readingOf?: ReadingOf; label: string }) {
  const kinds = Array.isArray(kind) ? kind : [kind];
  const groups = CHAPTERS.map((chapter) => ({ chapter, pages: livePages(chapter).filter((p) => kinds.includes(p.kind) && (!prefix || p.href.startsWith(prefix))) })).filter((g) => g.pages.length);
  return (
    <nav className="page-list" aria-label={label}>
      <ol className="page-list-groups">
        {groups.map(({ chapter, pages }) => (
          <li key={chapter.id} className="page-list-group">
            <p className="page-list-chapter"><MarkerBadge marker={chapter.marker} /><span>{chapter.title}</span></p>
            <ol className="page-list-rows">
              {pages.map((page) => (
                <li key={page.href} className="page-list-row">
                  <ChapterLink href={page.href} className="page-list-link"><span className="page-list-title">{page.title}</span></ChapterLink>
                  <PageReading readingOf={readingOf} page={page} />
                  <Arrow className="page-list-go" />
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
