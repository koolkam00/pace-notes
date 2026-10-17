/**
 * Nuggets for the stories, /finish-times and /slowdown (owned by WP2 from here; the redesign spec, section 5).
 *
 * WP0-C ships two reference nuggets with independent recounts in scripts/verify-nuggets.cjs (field.median and
 * replay.first) and a placeholder for every other page and chapter lead, so the shell, the contents and the next cards
 * work from day one. A placeholder computes its value from the data path the spec names, but has no recount yet:
 * WP2 replaces each one with a real nugget and its recount.
 */
import { getFinishTimeSummary } from '@/lib/finish-times-summary';
import { readInsight } from '@/lib/insights-server';
import type { Archetypes, Courses, Demographics, FinishTimes, ReplayEditionMeta, ReplayIndex } from '@/lib/insights';
import { getStudyEvidence, table } from '@/lib/research-data';
import { STORIES } from '@/lib/stories';
import { approxWords, count, hm, inWords, pct, ratio, spokenPct, spokenTime } from './format';
import { capitalize, placeholder, shareFigure, type Builder } from './build';
import type { Nugget } from './types';

const story = (slug: string) => STORIES.find((s) => s.slug === slug);

/** Chapter 01 lead, /finish-times: the median finish, with recorded women's and men's medians (whole minutes). */
export function fieldMedianFrom(medians: { all: number | null; women: number | null; men: number | null; total: number }): Nugget {
  const { all, women, men } = medians;
  const ok = all !== null && women !== null && men !== null;
  return {
    id: 'field.median', page: '/finish-times', denominator: 'story',
    values: { median_min: all ?? NaN, women_median_min: women ?? NaN, men_median_min: men ?? NaN, total: medians.total },
    guard: ok,
    headline: ok ? `Half of all finishes took longer than *${hm(all!)}*. Recorded women’s median was ${hm(women!)}, men’s ${hm(men!)}.` : '',
    fallback: all !== null ? `Half of all finishes took longer than *${hm(all)}*.` : 'Finish times, every recorded minute.',
    figure: all !== null ? { value: hm(all), sr: spokenTime(all * 60) } : null,
    key: 'median finish',
  };
}

function fieldMedian(): Nugget {
  const { groups } = getFinishTimeSummary();
  return fieldMedianFrom({ all: groups.all.median, women: groups.women.median, men: groups.men.median, total: groups.all.total });
}

/**
 * The replay's moment: when the first runner finished, the share of the field that had not reached 20K. The edition
 * is chosen by the data (argmax of that share), never named in code. "Nearly half" needs at least 0.45 (and under 0.5).
 */
export function replayFirstFrom(editions: Pick<ReplayEditionMeta, 'slug' | 'city' | 'year' | 'finishes' | 'moments'>[]): Nugget {
  const scored = editions.filter((e) => e.moments && e.finishes > 0).map((e) => ({ e, share: e.moments!.not_past_20_at_first / e.finishes }));
  if (!scored.length) {
    return { id: 'replay.first', page: '/stories/race-replay', denominator: 'positions', values: {}, guard: false, headline: '', fallback: 'Watch a marathon unfold, the whole field on one clock.', figure: null };
  }
  const { e, share } = scored.reduce((a, b) => (b.share > a.share ? b : a));
  const race = `${e.city} ${e.year}`;
  return {
    id: 'replay.first', page: '/stories/race-replay', denominator: 'positions',
    values: { slug: e.slug, city: e.city, year: e.year, finishes: e.finishes, not_past_20: e.moments!.not_past_20_at_first, share, first_finish_s: e.moments!.first_finish_s },
    guard: share >= 0.45 && share < 0.5,
    headline: `When the first runner finished ${race}, *nearly half* the field had not reached 20K.`,
    fallback: `When the first runner finished ${race}, *${pct(share)}* of the field had not reached 20K.`,
    figure: shareFigure(share),
    key: 'of the field had not reached 20K at the first finish',
  };
}

function replayFirst(): Nugget {
  return replayFirstFrom(readInsight<ReplayIndex>('replay.json').editions);
}

/** Chapter 03 lead: the share of finishes whose second 20K was faster than their first. */
function shapeNegsplit(): Nugget {
  const row = table('ext_pacing_shapes', 'patterns.csv').find((r) => r.label === 'Faster second 20 km');
  const share = row ? Number(row.value) / 100 : NaN;
  const ok = Number.isFinite(share) && share > 0 && share < 0.5;
  return placeholder({
    id: 'shape.second20k', page: '/stories/pacing-types', denominator: 'eligible',
    values: { share, n: row ? Number(row.count) : NaN, total: row ? Number(row.n_value) : NaN }, guard: ok,
    headline: `Only *${inWords(share)}* finishes ran their second 20K faster than their first.`,
    fallback: Number.isFinite(share) ? `*${inWords(share)}* finishes ran their second 20K faster than their first.` : 'Second 20K against the first.',
    figure: Number.isFinite(share) ? { value: inWords(share), sr: `${inWords(share)} finishes` } : null,
    key: 'ran their second 20K faster than their first',
  });
}

/** /stories/pacing-types: the share of finishes in the evenest pacing type (the lowest median pace variation). */
function typesMetronome(): Nugget {
  const data = readInsight<Archetypes>('archetypes.json');
  const even = data.archetypes.reduce((a, b) => (b.median_cv < a.median_cv ? b : a));
  return placeholder({
    id: 'types.metronome', page: '/stories/pacing-types', denominator: 'shape',
    values: { types: data.archetypes.length, name: even.name, share: even.share, median_cv: even.median_cv }, guard: true,
    headline: `*${pct(even.share)}* of finishes held their pace from start to finish: the ${even.name}.`,
    fallback: story('pacing-types')?.title ?? 'Ways to run the same race',
    figure: shareFigure(even.share), key: `ran as the ${even.name}, the evenest type`,
  });
}

/** Chapter 05 lead, /slowdown: of sustained slowdowns, the share that began at 30K or later. */
function slowdownLate(): Nugget {
  const study = getStudyEvidence();
  const rows = study?.timing.charts[0]?.rows ?? [];
  const total = rows.reduce((s, r) => s + Number(r.episodes ?? 0), 0);
  const late = rows.filter((r) => Number(r.label) >= 30).reduce((s, r) => s + Number(r.episodes ?? 0), 0);
  const share = total ? late / total : NaN;
  const ok = share >= 0.5;
  return placeholder({
    id: 'slowdown.onset', page: '/slowdown', denominator: 'eligible', term: '/methodology#sustained-slowdown',
    values: { share, late, total, rate: study ? study.rate / 100 : NaN }, guard: ok,
    headline: `${capitalize(approxWords(share))} sustained slowdowns began at *30K or later*.`,
    fallback: `*${pct(share)}* of sustained slowdowns began at 30K or later.`,
    figure: shareFigure(share),
    key: 'of sustained slowdowns began at 30K or later',
  });
}

/** Chapter 06 lead: the busiest finishing minute (all finishes). */
function finishPeak(): Nugget {
  const ft = readInsight<FinishTimes>('finish-times.json');
  const peak = ft.histogram.reduce((a, b) => (b.all > a.all ? b : a));
  return placeholder({
    id: 'finish.busiest', page: '/stories/round-numbers', denominator: 'story',
    values: { minute: peak.minute, n: peak.all }, guard: true,
    headline: `The busiest finishing minute was *${hm(peak.minute)}*: ${count(peak.all)} finishes.`,
    fallback: `The busiest finishing minute was *${hm(peak.minute)}*.`,
    figure: { value: hm(peak.minute), sr: spokenTime(peak.minute * 60) }, key: 'the busiest finishing minute',
  });
}

/** /stories/round-numbers: the minute before the round mark that stands tallest against the smooth curve. */
function roundTop(): Nugget {
  const ft = readInsight<FinishTimes>('finish-times.json');
  const top = ft.marks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return placeholder({
    id: 'round.top', page: '/stories/round-numbers', denominator: 'story',
    values: { mark: top.mark, minutes: top.minutes, ratio: top.ratio, n: top.minute_before }, guard: top.ratio > 1,
    headline: `The minute before ${top.mark} held *${ratio(top.ratio)}* what a smooth curve expects.`,
    fallback: `In the minute before ${top.mark}, ${count(top.minute_before)} finishes landed.`,
    figure: { value: top.ratio.toFixed(2), unit: '×', sr: `${top.ratio.toFixed(2)} times` }, key: `the smooth curve, in the minute before ${top.mark}`,
  });
}

/** Chapter 07 lead: sustained slowdown, recorded women against recorded men at the same finish times. */
function demoSlowdown(): Nugget {
  const d = readInsight<Demographics>('demographics.json');
  const w = d.overall.women_slowdown, m = d.overall.men_slowdown;
  return placeholder({
    id: 'holds.gender', page: '/stories/who-holds-pace', denominator: 'demographics', term: '/methodology#sustained-slowdown',
    values: { women: w, men: m }, guard: m > w,
    headline: `At the same finish times, *${pct(w)}* of recorded women’s finishes had a sustained slowdown, against ${pct(m)} of men’s.`,
    fallback: `At the same finish times: recorded women ${pct(w)}, recorded men ${pct(m)}.`,
    figure: { value: `${pct(w)} · ${pct(m)}`, sr: `${spokenPct(w)} of recorded women, ${spokenPct(m)} of recorded men` },
    key: 'sustained slowdown, women · men, at the same finish times',
  });
}

/** Chapter 09 lead: same-course weather pairs in which the warmer year had more sustained slowdowns. */
function weatherPairs(): Nugget {
  const pairs = readInsight<Courses>('courses.json').weather?.pairs;
  const n = pairs?.hotter_slowed_more ?? NaN, total = pairs?.total ?? NaN;
  return placeholder({
    id: 'weather.pairs', page: '/stories/race-morning', denominator: 'course', term: '/methodology#sustained-slowdown',
    values: { warmer_more: n, total }, guard: n > total / 2,
    headline: `In *${count(n)} of ${count(total)}* same-course pairs, the warmer year had more sustained slowdowns.`,
    fallback: `${count(n)} of ${count(total)} same-course pairs: the warmer year had more sustained slowdowns.`,
    figure: Number.isFinite(n) ? { value: `${count(n)} of ${count(total)}`, sr: `${count(n)} of ${count(total)}` } : null,
    key: 'same-course pairs: the warmer year had more sustained slowdowns',
  });
}

const titled = (id: Nugget['id'], slug: string, denominator: Nugget['denominator']): Builder => () => {
  const s = story(slug);
  const title = s?.title ?? 'A Pace Notes story';
  return placeholder({ id, page: `/stories/${slug}`, denominator, values: {}, guard: true, headline: title, fallback: title, figure: null });
};

export const STORY_NUGGETS: Record<string, Builder> = {
  'field.median': fieldMedian,
  'replay.first': replayFirst,
  'shape.second20k': shapeNegsplit,
  'types.metronome': typesMetronome,
  'slowdown.onset': slowdownLate,
  'finish.busiest': finishPeak,
  'round.top': roundTop,
  'holds.gender': demoSlowdown,
  'weather.pairs': weatherPairs,
  'places.gap': titled('places.gap', 'places', 'positions'),
  'kick.twins': titled('kick.twins', 'final-kick', 'kick'),
};
