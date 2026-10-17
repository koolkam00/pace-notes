/**
 * Nuggets for the analyses (owned by WP3 from here; the redesign spec, section 5).
 *
 * WP0-C's bootstrap: the chapter leads the spec names (kick.bank, checkpoint.even30, courses.spread and
 * kick.recurrence) compute their values from the data paths in section 2.2, and every other analysis wraps its
 * existing data-built finding sentence (findingText) in both units. None has a recount yet: each is a placeholder that
 * WP3 replaces with a real nugget and its recount in scripts/verify-nuggets.cjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { findingText } from '@/lib/analysis-display';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getAnalysisStart } from '@/lib/analysis-server';
import { readInsight } from '@/lib/insights-server';
import type { Kick } from '@/lib/insights';
import { percentUnder } from '@/lib/personalized';
import type { CheckpointData } from '@/lib/personalized-types';
import { getPersonalSummary } from '@/lib/personalized-data';
import { delta, hm, ms, pct } from './format';
import { placeholder, shareFigure, type Builder } from './build';
import type { Nugget, NuggetId } from './types';

/** Chapter 02 lead, /analyses/starting-pace: the fastest opening band, what it banked and where it finished. */
function kickBank(): Nugget {
  const bands = readInsight<Kick>('kick.json').bank.bands ?? [];
  const fastest = bands.length ? bands.reduce((a, b) => (b.open_s < a.open_s ? b : a)) : null;
  const ok = !!fastest && fastest.open_s < 0 && fastest.finish_s > 0;
  // The band's own label, said the way the contents key reads it: "More than 10% faster" → "over 10% fast".
  const label = (fastest?.label ?? '').replace(/^More than (\d+)% faster$/i, 'over $1% fast').replace(/^[A-Z]/, (c) => c.toLowerCase());
  return placeholder({
    id: 'kick.bank', page: '/analyses/starting-pace', denominator: 'kick',
    values: fastest ? { band: fastest.label, n: fastest.n, open_s: fastest.open_s, after20_s: fastest.after20_s, finish_s: fastest.finish_s } : {},
    guard: ok,
    headline: `A first 5K ${label} banked ${ms(-(fastest?.open_s ?? 0))}, and *finished ${ms(fastest?.finish_s ?? 0)} behind*.`,
    fallback: fastest ? `A first 5K ${label}: *${delta(fastest.finish_s)}* at the finish, against the same pace.` : 'Fast starts, and what followed.',
    figure: fastest ? { value: delta(fastest.finish_s), sr: `${ms(Math.abs(fastest.finish_s))} ${fastest.finish_s > 0 ? 'behind' : 'ahead'}` } : null,
    key: `at the finish, after a first 5K ${label}`,
  });
}

/** Chapter 04 lead, /analyses/checkpoint: of finishes on even goal pace at 30K, the share that got under the goal. */
function checkpointEven30(): Nugget {
  const summary = getPersonalSummary();
  const city = summary?.cities.find((c) => c.city === EXAMPLE_PROFILE.city);
  const file = city ? path.join(process.cwd(), 'public/data/packs/ext_personalized_guide/tables', city.checkpoint_file) : '';
  const data = file && fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as CheckpointData) : null;
  const goal = EXAMPLE_PROFILE.goal;
  const elapsed = (goal * 30) / 42.195;
  const band = Math.floor(elapsed / 2) * 2;
  const row = data?.rows.find((r) => r.checkpoint === 30 && r.elapsed === band && r.trend === 'all' && r.age === 'all' && r.gender === 'all');
  const under = row ? percentUnder(row, goal) : null;
  const share = under === null ? NaN : under / 100;
  return placeholder({
    id: 'checkpoint.under', page: '/analyses/checkpoint', denominator: 'eligible',
    values: { goal_min: goal, band_min: band, n: row?.n ?? NaN, share }, guard: share < 0.5,
    headline: `Of finishes on even ${hm(goal)} pace at 30K, only *${pct(share)}* got under ${hm(goal)}.`,
    fallback: `Of finishes on even ${hm(goal)} pace at 30K, *${pct(share)}* got under ${hm(goal)}.`,
    figure: shareFigure(share), key: `on even ${hm(goal)} pace at 30K got under ${hm(goal)}`,
  });
}

/** Chapter 08 lead: the range of sustained-slowdown shares across courses (n ≥ 100, three or more editions). */
function coursesSpread(): Nugget {
  const courses = getAllFinisherContextStart().initial.courses.filter((c) => c.n >= 100 && c.edition_n >= 3 && Number.isFinite(c.slowdown_pct));
  const values = courses.map((c) => c.slowdown_pct / 100);
  const lo = values.length ? Math.min(...values) : NaN, hi = values.length ? Math.max(...values) : NaN;
  const range = `${pct(lo).replace('%', '')}–${pct(hi)}`;
  return placeholder({
    id: 'courses.spread', page: '/stories/courses', denominator: 'course', term: '/methodology#sustained-slowdown',
    values: { lo, hi, courses: courses.length }, guard: hi / lo > 1.5,
    headline: `Across courses, sustained slowdown ran from *${range}* of finishes.`,
    fallback: `Sustained slowdown across courses: ${range} of finishes.`,
    figure: values.length ? { value: `${pct(lo).replace('%', '')}–${pct(hi).replace('%', '')}`, unit: '%', sr: `${pct(lo)} to ${pct(hi)}` } : null,
    key: 'sustained slowdown, across courses',
  });
}

/** Chapter 11 lead: after a sustained slowdown, the share of next races that had one too, against what was typical. */
function kickRecurrence(): Nugget {
  const after = readInsight<Kick>('kick.json').recurrence.after_slowdown;
  const observed = after?.observed ?? NaN, expected = after?.expected ?? NaN;
  return placeholder({
    id: 'kick.recurrence', page: '/analyses/finding-improvement', denominator: 'kick', term: '/methodology#sustained-slowdown',
    values: { observed, expected, pairs: after?.pairs ?? NaN }, guard: observed > expected,
    headline: `After a sustained slowdown, *${pct(observed)}* of next races had one too (${pct(expected)} typical).`,
    fallback: `After a sustained slowdown, ${pct(observed)} of next races had one too; ${pct(expected)} was typical.`,
    figure: shareFigure(observed), key: `of next races had one too, after a sustained slowdown (${pct(expected)} typical)`,
  });
}

/** The page's existing finding sentence (findingText) in both units, until WP3 writes its nugget. */
const finding = (id: NuggetId, slug: string, answerId: string): Builder => () => {
  const answer = getAnalysisStart().answers.find((a) => a.id === answerId);
  const text = answer ? { mi: findingText(answer, 'mi'), km: findingText(answer, 'km') } : 'An analysis of recorded finishes.';
  return placeholder({ id, page: `/analyses/${slug}`, denominator: 'eligible', values: {}, guard: true, headline: text, fallback: text, figure: null });
};

export const ANALYSIS_NUGGETS: Record<string, Builder> = {
  'kick.bank': kickBank,
  'checkpoint.under': checkpointEven30,
  'courses.spread': coursesSpread,
  'kick.recurrence': kickRecurrence,
  'downhill.opening': finding('downhill.opening', 'downhill-start', 'downhill'),
  'pattern.profile': finding('pattern.profile', 'pacing-pattern', 'profile'),
  'sections.split': finding('sections.split', 'where-time-is-gained', 'sections'),
  'target.context': finding('target.context', 'finish-time-context', 'ambition'),
  'age.retention': finding('age.retention', 'age-and-pacing', 'age'),
  'terrain.climb': finding('terrain.climb', 'hills-and-pacing', 'terrain'),
  'weather.start': finding('weather.start', 'race-day-weather', 'weather'),
  'courses.compare': finding('courses.compare', 'course-comparison', 'courses'),
};
