/**
 * The chapter registry (the redesign spec, sections 2.2 and 2.3): the site read as one marathon, a prologue (home) and
 * eleven chapters in three parts. Part one follows the race clock, so its chapters carry race-distance markers; parts
 * two and three use their numbers. Each chapter's pages, in order, are the "next" chain.
 *
 * The header's menu, the desktop chapters drawer, the contents (/research, /stories, /analyses), the home guide, the
 * rail, the reading bar and every next card read this one file. It holds no numbers: a page's reading is a nugget id
 * that the server resolves at build (lib/nuggets/, WP0-C), passed to the components as `readingOf`.
 *
 * Client code reads what it needs from the markup (data-reading, data-pages), never this module, so the registry costs
 * no JavaScript.
 */
import type { Marker } from '@/components/ui/MarkerBadge';
import type { NuggetFigure, NuggetId } from './nuggets/types';

export type { NuggetId };
export type PageKind = 'story' | 'analysis' | 'explainer' | 'tool' | 'course-index' | 'runner' | 'report' | 'course';
export type MethodsAnchor = `/methodology#${string}`;

export type ChapterPage = {
  /** The canonical path, no query. */
  href: string;
  kind: PageKind;
  /** At most 28 characters: the rail, the reading bar and "← previous". */
  short: string;
  /** The page's display title. */
  readonly title: string;
  /** The page's reading (lib/nuggets), shown in contents sub-rows and next cards. */
  nugget: NuggetId;
  /** "How we know": the page's methods on /methodology (verify-chapters checks it exists). */
  howWeKnow: MethodsAnchor;
  /** Set while the page is not built yet: the package that builds it. Every list and link skips it until then. */
  pending?: string;
};

export type Chapter = {
  n: number;
  /** The id contents rows use: chapter-01 … chapter-11 (/research#chapter-06). */
  id: string;
  part: 1 | 2 | 3;
  marker: Marker;
  title: string;
  /** Names the pages ("Finish times, the replay"). */
  subtitle: string;
  /** The next chain, in order. */
  pages: ChapterPage[];
  /** Off-chain pages listed as "Also in this chapter". */
  also?: { href: string; label: string }[];
  /** Pages that belong to the chapter without being in its chain: a path, or a prefix ending in "/". */
  children?: string[];
  /** Where a child's "← previous" goes (default: the chapter's hub, else its last page). */
  back?: string;
  /** The off-chain page a chapter's children belong to (/courses for the course pages): their way back, listed in the
   *  rail and the contents, never in the next chain (round 5: a directory was a stop the journey stalled on). */
  hub?: ChapterPage;
  /** The contents-row reading. */
  lead: NuggetId;
  /** The key under the lead when its nugget has none (spec 2.2); the nugget's own key, when it has one, takes its place. */
  key: string;
};

/** A reading as the shell draws it: a nugget's figure and key (lib/nuggets NuggetFigure plus Nugget.key). */
export type ChapterReading = NuggetFigure & { key?: string; km?: NuggetFigure };
/** How a page hands the shell its readings: lib/nuggets resolves an id at build; null leaves the reading out. */
export type ReadingOf = (id: NuggetId) => ChapterReading | null;

export const PARTS: Readonly<Record<1 | 2 | 3, string>> = { 1: 'The race', 2: 'The runner and the road', 3: 'Your race' };
const PART_WORDS: Readonly<Record<1 | 2 | 3, string>> = { 1: 'one', 2: 'two', 3: 'three' };
export const partLabel = (part: 1 | 2 | 3) => `Part ${PART_WORDS[part]} · ${PARTS[part]}`;

/** A methods anchor built from its id (verify-chapters checks every one against the built /methodology). */
const methods = (id: string) => `/methodology#${id}` as MethodsAnchor;

/**
 * A page carries one name everywhere the shell lists it (the rail, the reading bar, contents rows, next cards): its
 * short title. A story's or an analysis's longer title (lib/stories.ts, lib/ten-analyses.ts) stays for its own page,
 * search, share cards and structured data.
 */
const story = (slug: string, short: string, nugget: NuggetId, pending?: string): ChapterPage => ({
  href: `/stories/${slug}`, kind: 'story', short, nugget, howWeKnow: methods(`story-${slug}`), ...(pending ? { pending } : {}),
  title: short,
});
const analysis = (slug: string, short: string, nugget: NuggetId, howWeKnow: MethodsAnchor = '/methodology#question-methods'): ChapterPage => ({
  href: `/analyses/${slug}`, kind: 'analysis', short, nugget, howWeKnow, title: short,
});
const page = (href: string, kind: PageKind, title: string, short: string, nugget: NuggetId, howWeKnow: MethodsAnchor): ChapterPage => ({ href, kind, title, short, nugget, howWeKnow });
const tool = (slug: string, title: string, short: string, nugget: NuggetId) => page(`/tools/${slug}`, 'tool', title, short, nugget, methods(`tools-${slug}`));

const ALL_FINISHER: MethodsAnchor = '/methodology#all-finisher-context';
/** The last item (Array.prototype.at is missing in the Safari versions the site supports). */
const lastOf = <T,>(list: readonly T[]): T | undefined => list[list.length - 1];

export const CHAPTERS: readonly Chapter[] = [
  { n: 1, id: 'chapter-01', part: 1, marker: 'START', title: 'The field', subtitle: 'Finish times, the replay',
    pages: [
      page('/finish-times', 'story', 'Finish times', 'Finish times', 'field.median', '/methodology#finish-times'),
      story('race-replay', 'The race replay', 'replay.first'),
    ],
    lead: 'field.median', key: 'median finish' },
  { n: 2, id: 'chapter-02', part: 1, marker: '5K', title: 'The first 5K', subtitle: 'Starting pace, downhill starts',
    pages: [
      analysis('starting-pace', 'Starting pace', 'kick.bank', '/methodology#fast-start-method'),
      analysis('downhill-start', 'Downhill starts', 'downhill.opening', ALL_FINISHER),
    ],
    lead: 'kick.bank', key: 'behind same-pace runners at the finish, after a very fast first 5K' },
  { n: 3, id: 'chapter-03', part: 1, marker: '10K', title: 'The shape of a race', subtitle: 'Pacing types, your pattern',
    pages: [
      story('pacing-types', 'Pacing types', 'types.top'),
      analysis('pacing-pattern', 'Your pacing pattern', 'pattern.profile'),
    ],
    lead: 'types.top', key: 'were the two most common pacing types' },
  // The projector is a race-day tool, so it sits beside the chapter (also), and part one reads as one story from the gun
  // to the finish line: places hands straight on to the sustained slowdown.
  { n: 4, id: 'chapter-04', part: 1, marker: 'HALF', title: 'Halfway to 30K', subtitle: 'Checkpoints, places',
    pages: [
      analysis('checkpoint', 'From a checkpoint', 'checkpoint.under'),
      story('places', 'Pass or be passed', 'places.gap'),
    ],
    also: [{ href: '/tools/projector', label: 'Race-day projector' }],
    lead: 'checkpoint.under', key: 'of finishes on even goal pace at 30K still got under the goal' },
  { n: 5, id: 'chapter-05', part: 1, marker: '30K', title: 'After 30K', subtitle: 'Sustained slowdown, where time goes',
    pages: [
      page('/slowdown', 'explainer', 'Sustained slowdown', 'Sustained slowdown', 'slowdown.onset', '/methodology#slowdown-method'),
      story('final-kick', 'After the slowdown', 'kick.twins'),
      analysis('where-time-is-gained', 'The minutes that matter', 'sections.split'),
    ],
    lead: 'slowdown.onset', key: 'of sustained slowdowns began at 30K or later' },
  { n: 6, id: 'chapter-06', part: 1, marker: 'FINISH', title: 'The finish line', subtitle: 'Round numbers, your target',
    pages: [
      story('round-numbers', 'Round numbers', 'round.top'),
      analysis('finish-time-context', 'Your target in context', 'target.context'),
    ],
    also: [{ href: '/tools/marathon-pace/4-00', label: 'Pace for a 4:00 goal' }],
    children: ['/tools/marathon-pace/'],
    lead: 'round.top', key: 'as many finishes as expected in the minute before a round mark' },
  { n: 7, id: 'chapter-07', part: 2, marker: '07', title: 'Who holds pace', subtitle: 'Women and men, age',
    pages: [
      story('who-holds-pace', 'Women and men', 'holds.gender'),
      analysis('age-and-pacing', 'Age and pace', 'age.retention'),
    ],
    lead: 'holds.gender', key: 'of recorded women’s and men’s finishes had a sustained slowdown, at the same finish times' },
  // Every course (/courses) is the chapter's hub: the course pages' parent and way back, not a stop in the chain, so
  // hills hands straight on to the weather.
  { n: 8, id: 'chapter-08', part: 2, marker: '08', title: 'Where you run', subtitle: 'Courses, hills, every city',
    pages: [
      story('courses', 'Course fingerprints', 'courses.named'),
      analysis('course-comparison', 'Compare the courses', 'courses.compare', ALL_FINISHER),
      analysis('hills-and-pacing', 'Hills and pacing', 'terrain.climb'),
    ],
    hub: page('/courses', 'course-index', 'Every course', 'Every course', 'courses.index', '/methodology#course-pages'),
    children: ['/courses/'],
    lead: 'courses.named', key: 'of races traced to their course by pacing shape alone' },
  { n: 9, id: 'chapter-09', part: 2, marker: '09', title: 'The weather', subtitle: 'Race morning, heat and wind',
    pages: [
      story('race-morning', 'Race morning', 'weather.pairs'),
      analysis('race-day-weather', 'Race-day weather', 'weather.start', ALL_FINISHER),
      tool('weather-match', 'Weather match', 'Weather match', 'weathermatch.mornings'),
    ],
    lead: 'weather.pairs', key: 'same-course pairs: the warmer year had more sustained slowdowns' },
  // The split check opens the chapter: its one data beat (how common a sustained slowdown was at the example's finish
  // time) is the chapter's lead, so the card into the chapter promises what the page it opens holds; a past race (a
  // search, no reading of its own) follows it.
  { n: 10, id: 'chapter-10', part: 3, marker: '10', title: 'Your race', subtitle: 'Your splits, a past race',
    pages: [
      tool('split-check', 'Split check', 'Split check', 'splitcheck.share'),
      page('/runners', 'runner', 'Analyze a past race', 'Analyze a past race', 'runner.yours', '/methodology#runner-search'),
    ],
    children: ['/report'], back: '/runners',
    lead: 'splitcheck.share', key: 'of finishes at one finish time had a sustained slowdown' },
  { n: 11, id: 'chapter-11', part: 3, marker: '11', title: 'The next one', subtitle: 'Improvement, your plan',
    pages: [
      analysis('finding-improvement', 'Where runners improve', 'gains.final'),
      tool('plan', 'Plan your race', 'Plan your race', 'plan.goal'),
    ],
    also: [{ href: '/tools/pace-band', label: 'Pace band' }, { href: '/tools/course-chooser', label: 'Course chooser' }, { href: '/tools/predictor', label: 'Finish-time predictor' }],
    // The chapter's tools lead on to the planner (their next card) and back to the chapter's opener, as every other
    // also-in-this-chapter page has a way back (round 6: theirs ended on "How we know" alone).
    back: '/analyses/finding-improvement',
    lead: 'gains.final', key: 'of the minutes improving finishes gained came after 30K' },
];

/** The /methodology anchors of off-chain pages that end on a ChapterEnd. */
const CHILD_METHODS: readonly [string, MethodsAnchor][] = [
  ['/tools/projector', '/methodology#tools-projector'],
  ['/courses/', '/methodology#course-pages'], ['/report', '/methodology#race-report'], ['/tools/marathon-pace/', '/methodology#tools-goal-pages'],
  ['/tools/pace-band', '/methodology#tools-pace-band'], ['/tools/course-chooser', '/methodology#tools-course-chooser'], ['/tools/predictor', '/methodology#tools-predictor'],
];

/** The page path without its query, hash, base path or trailing slash. */
export function cleanPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  let p = path.split(/[?#]/)[0] || '/';
  if (base && p.startsWith(base)) p = p.slice(base.length) || '/';
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/** The chapter's pages that are built (pending ones left out). */
export const livePages = (chapter: Chapter) => chapter.pages.filter((p) => !p.pending);
/** "06". */
export const chapterNumber = (chapter: Chapter) => String(chapter.n).padStart(2, '0');
/** The chapter's first built page: where its row in a list goes. */
export const chapterHref = (chapter: Chapter) => livePages(chapter)[0]?.href ?? '/research';
/** The chapter's row on the contents. */
export const contentsHref = (chapter: Chapter) => `/research#${chapter.id}`;

const isChild = (chapter: Chapter, path: string) =>
  chapter.hub?.href === path
  || (chapter.children ?? []).some((c) => (c.endsWith('/') ? path.startsWith(c) && path.length > c.length : path === c))
  || (chapter.also ?? []).some((a) => a.href === path);

export type Place =
  | { chapter: Chapter; index: number; page: ChapterPage }
  | { chapter: Chapter; child: true };

/** Where a page sits: its chapter and place in the chain, or its chapter as a child; null outside the race. */
export function placeOf(path: string): Place | null {
  const p = cleanPath(path);
  for (const chapter of CHAPTERS) {
    const index = chapter.pages.findIndex((page) => page.href === p);
    if (index >= 0) return { chapter, index, page: chapter.pages[index] };
  }
  for (const chapter of CHAPTERS) if (isChild(chapter, p)) return { chapter, child: true };
  return null;
}

export type Next = { page: ChapterPage; chapter: Chapter; opensChapter: boolean };

/** The first built page after `chapter` (the next chapter's opener), or null after the last. */
function opener(after: Chapter): Next | null {
  for (const chapter of CHAPTERS.filter((c) => c.n > after.n)) {
    const first = livePages(chapter)[0];
    if (first) return { page: first, chapter, opensChapter: true };
  }
  return null;
}

/**
 * The page after this one. The last page of a chapter leads to the next chapter's first page (`opensChapter`, so the
 * card shows that chapter's lead). A child (a course page, the report, an also-in-this-chapter tool) leads to the next
 * chapter, or after the last chapter to its finish line. /tools/plan, the journey's finish, returns null.
 */
export function nextOf(path: string): Next | null {
  const place = placeOf(path);
  if (!place) return null;
  const { chapter } = place;
  if ('child' in place) {
    const next = opener(chapter);
    if (next) return next;
    const last = lastOf(livePages(chapter));
    return last && last.href !== cleanPath(path) ? { page: last, chapter, opensChapter: false } : null;
  }
  const following = chapter.pages.slice(place.index + 1).find((p) => !p.pending);
  return following ? { page: following, chapter, opensChapter: false } : opener(chapter);
}

/** The page before this one: the previous page in the chain (across chapters), or for a child its chapter's way back. */
export function prevOf(path: string): ChapterPage | null {
  const place = placeOf(path);
  if (!place) return null;
  const { chapter } = place;
  if ('child' in place) {
    const live = livePages(chapter);
    const here = cleanPath(path);
    // The hub hands back to the chain's last page; its children hand back to the hub.
    if (chapter.hub && chapter.hub.href !== here) return chapter.hub;
    return live.find((p) => p.href === chapter.back) ?? lastOf(live) ?? null;
  }
  const before = lastOf(chapter.pages.slice(0, place.index).filter((p) => !p.pending));
  if (before) return before;
  for (const earlier of CHAPTERS.filter((c) => c.n < chapter.n).reverse()) {
    const last = lastOf(livePages(earlier));
    if (last) return last;
  }
  return null;
}

/** "How we know" for any page in the race: its own anchor, or its child family's. */
export function howWeKnowOf(path: string): MethodsAnchor | null {
  const place = placeOf(path);
  if (!place) return null;
  if ('page' in place) return place.page.howWeKnow;
  const p = cleanPath(path);
  if (place.chapter.hub?.href === p) return place.chapter.hub.howWeKnow;
  return CHILD_METHODS.find(([c]) => (c.endsWith('/') ? p.startsWith(c) : p === c))?.[1] ?? null;
}

/**
 * The attributes a reading page puts on its root so the header's reading bar can show it (the marker and the short
 * title); the bar counts the page's [data-beat] sections itself. Pages outside the race pass their own short title.
 */
export function readingAttrs(path: string, short?: string): Record<string, string> {
  const place = placeOf(path);
  const attrs: Record<string, string> = { 'data-reading': '' };
  if (place) attrs['data-marker'] = place.chapter.marker;
  const title = short ?? (place && 'page' in place ? place.page.short : place && place.chapter.hub?.href === cleanPath(path) ? place.chapter.hub.short : place?.chapter.title);
  if (title) attrs['data-short'] = title;
  return attrs;
}

/** Every nugget id the registry names: lib/nuggets must resolve each one (verify-nuggets, verify-chapters). */
export const CHAPTER_NUGGETS: readonly NuggetId[] = [...new Set(CHAPTERS.flatMap((c) => [c.lead, ...c.pages.map((p) => p.nugget), ...(c.hub ? [c.hub.nugget] : [])]))];
