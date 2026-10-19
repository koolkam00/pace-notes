/**
 * Registry of the data stories. A story is published only when its data file is in the verified manifest.
 * Server only: text that quotes a share, count or year (titles, deks, search titles and descriptions)
 * is a getter that reads the number from the verified story data at build time, so none is typed in.
 */
import { getInsightsManifest, readInsight } from './insights-server';
import type { Archetypes, Courses, InsightsManifest, ReplayIndex } from './insights';
import { getNugget, sentenceOf } from './nuggets';

/** One parsed copy of each story file per verified manifest, so the getters below do not re-read files on every access. */
const files = new WeakMap<InsightsManifest, Map<string, unknown>>();
function insight<T>(name: string): T | null {
  const manifest = getInsightsManifest();
  if (!manifest.files[name]) return null;
  let cache = files.get(manifest);
  if (!cache) files.set(manifest, (cache = new Map()));
  if (!cache.has(name)) cache.set(name, readInsight<T>(name));
  return cache.get(name) as T;
}

export interface StoryDefinition {
  slug: string;
  file: string;
  number: string;
  kicker: string;
  /** The display title: contents rows, next cards, search and share cards. Plain text. */
  title: string;
  /** The page's H1 when it differs from the title or carries the one italic accent (*…*); defaults to the title. */
  heading?: string;
  /** The question the story answers: the dek under its H1 (the redesign spec, section 4.1). */
  dek: string;
  accent: string;
  /** The day the story page was first added (git, YYYY-MM-DD): Article datePublished. */
  published: string;
  /** Search and social title, at most 60 characters. Defaults to `${title} | Pace Notes`. */
  seoTitle?: string;
  /** Search and social description, at most 155 characters. Defaults to the dek. */
  seoDescription?: string;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** Screened finishes in millions with one decimal, the same value as finishesM() in lib/seo.tsx (not imported: lib/seo-routes imports this file). */
const finishesMillions = () => (getInsightsManifest().analysis_n / 1e6).toFixed(1);

/** A small count in words ("six"), or null when it has no word. */
export const countWord = (n: number | null) => (n !== null && n > 0 && n < WORDS.length ? WORDS[n] : null);
export const capital = (word: string) => `${word[0].toUpperCase()}${word.slice(1)}`;

/** Pacing types in archetypes.json, or null when the file is not in this build. */
function pacingTypes(): string | null {
  const types = insight<Archetypes>('archetypes.json');
  return types ? countWord(types.archetypes.length) : null;
}

/**
 * Replayed races in replay.json and the finishes each replay draws: a sample of each field ("1,500", or "up to 1,500"
 * when the samples differ), never the whole field. Null when the file is not in this build.
 */
function replayFields(): { races: string; sample: string } | null {
  const replay = insight<ReplayIndex>('replay.json');
  if (!replay) return null;
  const races = countWord(replay.editions.length);
  const samples = replay.editions.map((e) => e.sample);
  const largest = Math.max(...samples).toLocaleString('en-US');
  return races ? { races, sample: samples.every((n) => n === samples[0]) ? largest : `up to ${largest}` } : null;
}

/** Courses in courses.json and the first and last race year they cover, or null when the course data is not in this build. */
export function courseSpan(): { courses: number; first: number; last: number } | null {
  const data = insight<Courses>('courses.json');
  if (!data) return null;
  const years = data.courses.flatMap((c) => c.years);
  return years.length ? { courses: data.courses.length, first: Math.min(...years), last: Math.max(...years) } : null;
}

/** Courses in courses.json with a pacing shape (a course whose every edition fails the start-offset screen has none). */
function shapedCourses(): number | null {
  const data = insight<Courses>('courses.json');
  return data ? data.courses.filter((c) => c.curve?.length).length : null;
}

/** A story's H1 as its finding: the nugget's sentence when its guard holds, else the plain title. */
function headingOf(id: `${string}.${string}`, title: string): string {
  const n = getNugget(id);
  return n.guard ? sentenceOf(n) : title;
}

export const STORIES: StoryDefinition[] = [
  { slug: 'pacing-types', file: 'archetypes.json', number: '01', kicker: 'The shape of a marathon',
    get title() {
      const types = pacingTypes();
      return `${types ? capital(types) : 'Different'} ways to run the same race`;
    },
    /** The finding (the types.top nugget): the two commonest types, named from the data, when together they hold most finishes. */
    get heading() { return sentenceOf(getNugget('types.top')); },
    dek: 'Does everyone pace a marathon the same way?',
    accent: '#17A673',
    published: '2026-10-07',
    get seoTitle() {
      const types = pacingTypes();
      return `${types ? `${capital(types)} ` : ''}Marathon Pacing Types from 5 km Splits | Pace Notes`;
    },
    get seoDescription() {
      const types = pacingTypes();
      return `Grouping millions of recorded marathon finishes by the shape of their 5 km splits reveals ${types ? `${types} ` : ''}recurring pacing types, and how often a shape repeats.`;
    } },
  { slug: 'round-numbers', file: 'finish-times.json', number: '02', kicker: 'Round numbers',
    /** One name everywhere the story is listed or linked: the chapter's short name for it. */
    title: 'Round numbers',
    /** The finding: finishes crowd in just under the round mark that stands tallest against the curve. */
    get heading() {
      const top = getNugget('round.top');
      return top.guard ? `Finishes crowd in *just under ${top.values.mark}*.` : `${this.title}.`;
    },
    dek: 'Do round numbers change when runners finish?', accent: '#FF5B2E',
    published: '2026-10-07',
    seoTitle: 'Round Numbers: Marathon Finishes Bunch Under Round Times',
    get seoDescription() {
      return `Marathon finish times pile up just under every hour and half-hour. See the bunching second by second in ${finishesMillions()} million recorded finishes.`;
    } },
  { slug: 'race-replay', file: 'replay.json', number: '03', kicker: 'On the race clock', title: 'Watch a marathon unfold',
    /** The moment as a finding (the replay.title nugget), or the title when its guard fails. */
    get heading() {
      const n = getNugget('replay.title');
      return n.guard ? sentenceOf(n) : this.title;
    },
    dek: 'How spread out is a marathon field?',
    accent: '#F4B23E',
    published: '2026-10-07',
    seoTitle: 'Marathon Race Replay from Recorded Splits | Pace Notes',
    get seoDescription() {
      const fields = replayFields();
      return fields
        ? `Replay ${fields.races} big-city marathons from their recorded 5 km splits and watch ${fields.sample} sampled finishes from each field spread out along the course.`
        : 'Replay big-city marathons from their recorded 5 km splits and watch a sample of each field spread out along the course.';
    } },
  { slug: 'places', file: 'positions.json', number: '04', kicker: 'Places on the clock', title: 'Pass or be passed',
    /** The H1 is the finding (the places.title nugget), or the title when its guard fails. */
    get heading() { return headingOf('places.title', this.title); },
    dek: 'How much can still change after 30K?', accent: '#2F5BFF',
    published: '2026-10-07',
    seoTitle: 'How Marathon Places Change Late in the Race | Pace Notes',
    seoDescription: 'How much a marathon field reorders after 30K: how often a finish trailing there still crossed the line first, and how many moved up late.' },
  { slug: 'final-kick', file: 'kick.json', number: '05', kicker: 'After 30K',
    /** The short name its list rows and next cards show (its reading gives the minutes). */
    title: 'After the slowdown',
    /** The H1 is the finding in words (the kick.title nugget), ending on its full stop like the race replay's. */
    get heading() {
      return sentenceOf(getNugget('kick.title'));
    },
    dek: 'What happens to a race after a sustained slowdown begins?',
    accent: '#E2416B',
    published: '2026-10-07',
    seoTitle: 'The Marathon Final Kick: Who Speeds Up Late | Pace Notes',
    /** The page's own finding (kick.twins), then what the story follows. */
    get seoDescription() {
      const twins = getNugget('kick.twins');
      const lead = twins.guard ? `Same pace to 20K, ${twins.figure?.value} minutes apart at the finish. ` : '';
      return `${lead}What followed a sustained slowdown in recorded marathon finishes, from the warning sign to the finish.`;
    } },
  { slug: 'who-holds-pace', file: 'demographics.json', number: '06', kicker: 'Gender and age', title: 'Women and men',
    get heading() { return headingOf('holds.title', this.title); },
    dek: 'Do women and men run the second half differently?', accent: '#7A4DFF',
    published: '2026-10-07',
    seoTitle: 'Women and Men: Who Holds Marathon Pace | Pace Notes',
    get seoDescription() {
      const n = getNugget('holds.gender');
      const w = Number(n.values.women), m = Number(n.values.men);
      return n.guard
        ? `At the same finish times, ${Math.round(w * 100)}% of recorded women’s marathon finishes had a sustained slowdown, against ${Math.round(m * 100)}% of men’s. Mat by mat, from 5 km splits.`
        : 'Recorded women and men at the same marathon finish times, mat by mat, from 5 km splits.';
    } },
  { slug: 'courses', file: 'courses.json', number: '07', kicker: 'Where you run', title: 'Every course has a fingerprint',
    /** The finding when a pacing shape names its course well above chance (the courses.named guard). */
    get heading() { return getNugget('courses.named').guard ? 'A race’s pacing shape can *name its course*.' : `${this.title}.`; },
    dek: 'Does a course change how its marathon is paced?',
    accent: '#0FA3A3',
    published: '2026-10-07',
    seoTitle: 'Marathon Course Fingerprints: Pace by Section | Pace Notes',
    get seoDescription() {
      const span = courseSpan();
      const shaped = shapedCourses();
      return span && shaped
        ? `Section-by-section pacing shapes for ${shaped === span.courses ? shaped : `${shaped} of ${span.courses}`} marathon courses, with race-morning weather, finish times from ${span.first} to ${span.last} and route profiles where mapped.`
        : 'Section-by-section pacing shapes for marathon courses, with race-morning weather, finish times and route profiles where mapped.';
    } },
  { slug: 'race-morning', file: 'courses.json', number: '08', kicker: 'The weather', title: 'Race-morning weather',
    get heading() { return headingOf('weather.title', this.title); },
    dek: 'Does a warm morning change a marathon?',
    accent: '#2F5BFF',
    published: '2026-10-17',
    seoTitle: 'Marathon Weather: Warm vs Cool Race Mornings | Pace Notes',
    get seoDescription() {
      const pairs = insight<Courses>('courses.json')?.weather?.pairs;
      return pairs
        ? `The same marathon course on warmer and cooler mornings: in ${pairs.hotter_slowed_more} of ${pairs.total} pairs of editions, the warmer one had more sustained slowdowns.`
        : 'The same marathon course on warmer and cooler mornings, and how the race changed with the start temperature.';
    } },
];

export function storyHref(story: StoryDefinition) {
  return `/stories/${story.slug}`;
}
