/**
 * Registry of the data stories. A story is published only when its data file is in the verified manifest.
 * Server only: text that quotes a share, count or year (titles, deks, search titles and descriptions)
 * is a getter that reads the number from the verified story data at build time, so none is typed in.
 */
import { getInsightsManifest, readInsight } from './insights-server';
import type { Archetypes, CourseGeometry, Courses, InsightsManifest, Kick, ReplayIndex } from './insights';
import { checkpointLabel } from './viz/format';

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
  title: string;
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

/**
 * An observed share in words for the start of a sentence: "Three in four" for 0.7457, the simplest
 * n in d (d up to 10) within one percentage point of the share, otherwise "75% of".
 */
export function shareInWords(share: number): string {
  for (let d = 2; d < WORDS.length; d += 1) {
    const n = Math.round(share * d);
    if (n > 0 && n < d && Math.abs(n / d - share) <= 0.01) return `${WORDS[n][0].toUpperCase()}${WORDS[n].slice(1)} in ${WORDS[d]}`;
  }
  return `${Math.round(share * 100)}% of`;
}

/** Screened finishes in millions with one decimal, the same value as finishesM() in lib/seo.tsx (not imported: lib/seo-routes imports this file). */
const finishesMillions = () => (getInsightsManifest().analysis_n / 1e6).toFixed(1);

/** "Three in four" from kick.json: finishes that ran the final 2.195 km faster than 35–40 km. Null when the kick data is not in this build. */
function kickShare(): string | null {
  const kick = insight<Kick>('kick.json');
  return kick ? shareInWords(kick.kick.share) : null;
}

/** Share of finishes with a sustained slowdown that ran the final section faster than their 5–20 km pace ("2.2%"), or null without the kick data. */
function slowdownFinalBelowBaseline(): string | null {
  const kick = insight<Kick>('kick.json');
  return kick ? `${(kick.kick.slowdown_final_below_baseline * 100).toFixed(1)}%` : null;
}

/** A small count in words ("six"), or null when it has no word. */
export const countWord = (n: number | null) => (n !== null && n > 0 && n < WORDS.length ? WORDS[n] : null);
export const capital = (word: string) => `${word[0].toUpperCase()}${word.slice(1)}`;

/** Pacing types in archetypes.json, or null when the file is not in this build. */
function pacingTypes(): string | null {
  const types = insight<Archetypes>('archetypes.json');
  return types ? countWord(types.archetypes.length) : null;
}

/** Finishes grouped into pacing types, in millions with one decimal ("3.3"), or null without the file. */
function pacingCohortMillions(): string | null {
  const types = insight<Archetypes>('archetypes.json');
  return types ? (types.cohort_n / 1e6).toFixed(1) : null;
}

/** Replayed races in replay.json and the largest field among them, or null when the file is not in this build. */
function replayFields(): { races: string; largest: string } | null {
  const replay = insight<ReplayIndex>('replay.json');
  if (!replay) return null;
  const races = countWord(replay.editions.length);
  return races ? { races, largest: Math.max(...replay.editions.map((e) => e.finishes)).toLocaleString('en-US') } : null;
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

/** Courses in courses.json that have a supplied route file in course-geometry.json (some courses have none). */
function mappedCourses(): number | null {
  const data = insight<Courses>('courses.json');
  const geometry = insight<{ courses: CourseGeometry[] }>('course-geometry.json');
  if (!data || !geometry) return null;
  const routes = new Set(geometry.courses.map((c) => c.city));
  return data.courses.filter((c) => routes.has(c.city)).length;
}

export const STORIES: StoryDefinition[] = [
  { slug: 'pacing-types', file: 'archetypes.json', number: '01', kicker: 'The shape of a marathon',
    get title() {
      const types = pacingTypes();
      return `${types ? capital(types) : 'Different'} ways to run the same race`;
    },
    get dek() {
      const types = pacingTypes();
      const millions = pacingCohortMillions();
      return `Every finish has a shape. Grouping ${millions ? `${millions} million` : 'millions'} of them reveals ${types ? `${types} ` : ''}recurring pacing types, and how often the same shape shows up in a runner’s next linked race.`;
    },
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
  { slug: 'round-numbers', file: 'finish-times.json', number: '02', kicker: 'Round numbers', title: 'The 3:59 effect',
    dek: 'Finish times pile up just before every hour and half-hour. See how the bunching forms, second by second, and how many more finishes slip under a round number in the final stretch.', accent: '#FF5B2E',
    published: '2026-10-07',
    seoTitle: 'The 3:59 Effect: Marathon Finishes Bunch Under the Hour',
    get seoDescription() {
      return `Marathon finish times pile up just under every hour and half-hour. See the bunching second by second in ${finishesMillions()} million recorded finishes.`;
    } },
  { slug: 'race-replay', file: 'replay.json', number: '03', kicker: 'On the race clock', title: 'Watch a marathon unfold',
    get dek() {
      const fields = replayFields();
      return fields
        ? `Replay ${fields.races} big-city races from their recorded splits and watch fields of up to ${fields.largest} finishes stretch across the course.`
        : 'Replay big-city races from their recorded splits and watch a whole field stretch across the course.';
    },
    accent: '#F4B23E',
    published: '2026-10-07',
    seoTitle: 'Marathon Race Replay from Recorded Splits | Pace Notes',
    get seoDescription() {
      const fields = replayFields();
      return fields
        ? `Replay ${fields.races} big-city marathons from their recorded 5 km splits and watch fields of up to ${fields.largest} finishes spread out along the course.`
        : 'Replay big-city marathons from their recorded 5 km splits and watch a whole field spread out along the course.';
    } },
  { slug: 'places', file: 'positions.json', number: '04', kicker: 'Places on the clock', title: 'Pass or be passed',
    dek: 'How much the order of a field changes after 20 km, who moves up late and which section reshuffles the race the most.', accent: '#2F5BFF',
    published: '2026-10-07',
    seoTitle: 'How Marathon Places Change Late in the Race | Pace Notes',
    get seoDescription() {
      return `How much a marathon field reorders after the ${checkpointLabel(20, 'km')} mat (${checkpointLabel(20, 'mi')}), who moves up late and which section reshuffles finishing places the most.`;
    } },
  { slug: 'final-kick', file: 'kick.json', number: '05', kicker: 'The second half', title: 'The finish-line magnet',
    get dek() {
      const share = kickShare();
      const back = slowdownFinalBelowBaseline();
      const opening = share && back
        ? `${share} finishes speed up over the final stretch, yet only ${back} of those with a sustained slowdown ran it faster than their early pace.`
        : 'How often finishes speed up over the final stretch, and how often those with a sustained slowdown get back to their early pace.';
      return `${opening} Where the field breaks, how fast starts and later slowing line up, and how often a sustained slowdown recurs in a next linked race.`;
    },
    accent: '#E2416B',
    published: '2026-10-07',
    seoTitle: 'The Marathon Final Kick: Who Speeds Up Late | Pace Notes',
    get seoDescription() {
      const share = kickShare();
      return `${share ? `${share} recorded marathon finishes speed up over the final stretch. ` : ''}Where fields slow, and how late speed-ups and sustained slowdowns line up.`;
    } },
  { slug: 'who-holds-pace', file: 'demographics.json', number: '06', kicker: 'Gender and age', title: 'Who holds their pace',
    dek: 'At the same finish times, recorded women and men pace their races differently, and so do runners of different ages.', accent: '#7A4DFF',
    published: '2026-10-07',
    seoTitle: 'Marathon Pacing by Age and Recorded Gender | Pace Notes',
    seoDescription: 'At the same finish times, recorded women and men pace marathons differently, and so do age groups. Section-by-section evidence from 5 km splits.' },
  { slug: 'courses', file: 'courses.json', number: '07', kicker: 'Courses, weather and years', title: 'Every course has a fingerprint',
    get dek() {
      const span = courseSpan();
      const shaped = shapedCourses();
      const mapped = mappedCourses();
      if (!span || !shaped) return 'Pacing shapes, route maps and elevation where the data allow, with the weather on race morning for each marathon.';
      const of = (n: number) => (n === span.courses ? `all ${n}` : `${n} of ${span.courses}`);
      const maps = mapped ? `, route maps and elevation for ${mapped === span.courses ? 'all' : mapped}` : '';
      return `Pacing shapes for ${of(shaped)} marathons${maps}, with the weather on race morning and finish times from ${span.first} to ${span.last}.`;
    },
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
];

export function storyHref(story: StoryDefinition) {
  return `/stories/${story.slug}`;
}
