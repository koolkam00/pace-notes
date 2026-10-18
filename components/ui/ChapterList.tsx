import BigNumber from './BigNumber';
import { joinRanges } from '@/components/ui/keepTogether';
import MarkerBadge from './MarkerBadge';
import Arrow from './Arrow';
import ChapterLink from '@/components/ChapterLink';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { CHAPTERS, chapterHref, livePages, partLabel, type Chapter, type ChapterPage, type PageKind, type ReadingOf } from '@/lib/chapters';

/**
 * The chapters as a course line (the redesign spec, section 3.5): each chapter's marker on a dashed line, its title and
 * the pages it holds, in three parts. The reader's chapter is marked "You are here" (aria-current) from the page's own
 * path.
 *
 * Variants:
 * - compact: the menu and the chapters drawer. Marker, title and pages; no readings (a menu is for finding a page). The
 *   whole row links to the chapter's first page.
 * - full: the home guide. Adds the chapter's reading with its key, when `readingOf` resolves it.
 * - expanded: the contents (/research). Each chapter is a heading with its reading, and its pages are the links under
 *   it, by title alone: one reading per chapter, so the list stays one calm rhythm and no figure shows twice. The first
 *   chapter key that names the sustained slowdown links the term to its definition (a heading, so outside any row
 *   link). Rows carry their ids (chapter-01 …) for /research#chapter-06.
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

const pagesOf = (chapter: Chapter) => [...chapter.pages.map((p) => p.href), ...(chapter.children ?? []), ...(chapter.also ?? []).map((a) => a.href)];

/** A figure with no number in it ("Yours") is a word, not a reading: it shows as its key alone, in plain text. */
const isNumber = (value: string) => /\d/.test(value);
const TERM = /\bsustained[ -]slowdowns?\b/i;
const TERM_HREF = '/methodology#sustained-slowdown';
/** A key with its first "sustained slowdown" linked to the definition (only where the key sits outside a row link). */
function KeyText({ text, term }: { text: string; term: boolean }) {
  const m = term ? TERM.exec(text) : null;
  if (!m) return <>{joinRanges(text)}</>;
  return <>{joinRanges(text.slice(0, m.index))}<Link href={TERM_HREF} className="term-link">{m[0]}</Link>{joinRanges(text.slice(m.index + m[0].length))}</>;
}

function Reading({ readingOf, id, fallbackKey, size, term = false }: { readingOf?: ReadingOf; id: Chapter['lead']; fallbackKey?: string; size: 's' | 'm'; term?: boolean }) {
  const reading = readingOf?.(id);
  if (!reading) return null;
  const key = reading.key ?? fallbackKey;
  if (!isNumber(reading.value)) return key ? <span className="chapter-reading is-key-only"><span className="chapter-key"><KeyText text={key} term={term} /></span></span> : null;
  return (
    <span className="chapter-reading">
      <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size={size} />
      {key ? <span className="chapter-key"><KeyText text={key} term={term} /></span> : null}
    </span>
  );
}

/** A page's reading on one quiet line (/stories, /analyses): the figure, then its key ("47% of the field had not …"). */
function PageReading({ readingOf, page }: { readingOf?: ReadingOf; page: ChapterPage }) {
  const reading = readingOf?.(page.nugget);
  if (!reading?.key) return null;
  // A figure that is a word shows its key alone.
  if (!isNumber(reading.value)) return <span className="page-reading is-key-only"><span className="page-reading-key">{joinRanges(reading.key)}</span></span>;
  return (
    <span className="page-reading">
      <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size="s" />
      <span className="page-reading-key">{joinRanges(reading.key)}</span>
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
  // The contents link the term once, in the first chapter key that uses it.
  const keyOf = (c: Chapter) => readingOf?.(c.lead)?.key ?? c.key;
  const termAt = variant === 'expanded' ? CHAPTERS.find((c) => readingOf?.(c.lead) && TERM.test(keyOf(c)))?.id : undefined;
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
                  <Reading readingOf={readingOf} id={chapter.lead} fallbackKey={chapter.key} size="s" term={chapter.id === termAt} />
                </div>
                <ol className="chapter-pages">
                  {livePages(chapter).map((page) => (
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
              <li className="chapter-row" key={chapter.id} data-lead={chapter.lead}>
                <ChapterLink href={chapterHref(chapter)} match={pagesOf(chapter)} className="chapter-link">
                  <span className="chapter-mark"><MarkerBadge marker={chapter.marker} /></span>
                  <span className="chapter-text">
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
 * /analyses): the pages grouped under their chapter's line (its marker and name, said once), each row one link with
 * the page's title and its reading.
 */
export function PageList({ kind, prefix, readingOf, label }: { kind: PageKind; prefix?: string; readingOf?: ReadingOf; label: string }) {
  const groups = CHAPTERS.map((chapter) => ({ chapter, pages: livePages(chapter).filter((p) => p.kind === kind && (!prefix || p.href.startsWith(prefix))) })).filter((g) => g.pages.length);
  return (
    <nav className="page-list" aria-label={label}>
      <ol className="page-list-groups">
        {groups.map(({ chapter, pages }) => (
          <li key={chapter.id} className="page-list-group">
            <p className="page-list-chapter"><MarkerBadge marker={chapter.marker} /><span>{chapter.title}</span></p>
            <ol className="page-list-rows">
              {pages.map((page) => (
                <li key={page.href}>
                  <ChapterLink href={page.href} className="page-list-link">
                    <span className="page-list-title">{page.title}</span>
                    <PageReading readingOf={readingOf} page={page} />
                    <Arrow className="page-list-go" />
                  </ChapterLink>
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}
