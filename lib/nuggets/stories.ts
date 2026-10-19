/**
 * Nuggets for the stories, /finish-times and /slowdown (owned by WP2; the redesign spec, section 5).
 *
 * Every story's reading and every beat's finding is a nugget here: raw values read from the verified story data, a guard
 * for the direction or size the sentence asserts, the headline when it holds and a neutral fallback when it does not.
 * Examples are picked by the data (an argmax, the band nearest a round value), never by a city, label or index typed
 * here. Each builder has a pure `…From(data)` twin, so scripts/nuggets/stories.cjs can recount it from the raw files and
 * prove its fallback on a fixture. /slowdown's reading (slowdown.onset) is WP3's and recounted there.
 */
import { getFinishTimeSummary } from '@/lib/finish-times-summary';
import { readInsight } from '@/lib/insights-server';
import type { Archetypes, Courses, Demographics, FinishTimes, Kick, Positions, ReplayEditionMeta, ReplayIndex } from '@/lib/insights';
import { getStudyEvidence, table } from '@/lib/research-data';
import { MARATHON_KM, type UnitSystem } from '@/lib/units';
import { displayCity } from '@/lib/course-page';
import { approxWords, count, countWord, distance, hm, inWords, matLabel, ms, pct, perDegree, sectionLabel, spokenPct, spokenTime, temp, tempGap } from './format';
import { capitalize, shareFigure, type Builder } from './build';
import { HOME_NUGGETS } from './home';
import type { Nugget, UnitsAware } from './types';

const MINUS = '−';
/** A signed number with the minus sign: −5.8, +2.2. */
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}`;
/** One decimal. */
const one = (v: number) => v.toFixed(1);
/** Both unit modes of a sentence. */
const both = (f: (units: UnitSystem) => string): UnitsAware<string> => ({ mi: f('mi'), km: f('km') });
/** A data section label ("35–40", "40–42.2") as its mat names ("35–40K", "40K–finish"). */
export function sectionName(label: string): string {
  const [a, b] = label.split('–').map(Number);
  return Number.isFinite(a) && Number.isFinite(b) ? sectionLabel(a, b >= 42 ? MARATHON_KM : b) : label;
}
/** A year range as a reader says it: 2015–19. */
const years = ([a, b]: [number, number]) => `${a}–${String(b).slice(2)}`;

// ---------- Chapter 01 · The field (/finish-times) ----------

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
 * /finish-times H1: the median as a finding in words ("More than half of all finishes took over four hours."), so the
 * reading's figure is the one place the median's time shows. "Over" needs the median at least a minute past the hour.
 */
export function fieldTitleFrom(median: number | null): Nugget {
  const hours = median !== null ? Math.floor(median / 60) : NaN;
  const ok = median !== null && hours >= 1 && median - hours * 60 >= 1;
  return {
    id: 'field.title', page: '/finish-times', denominator: 'story',
    values: { median_min: median ?? NaN, hours }, guard: ok,
    headline: ok ? `More than half of all finishes took *over ${countWord(hours)} hours*.` : '',
    fallback: 'Marathon finish times',
    figure: null,
  };
}

/** /finish-times #field: the middle half of all finishes, the 25th to the 75th percentile (nearest rank, whole minutes). */
export function fieldMiddleFrom(q: { p25: number | null; median: number | null; p75: number | null }): Nugget {
  const { p25, median, p75 } = q;
  const ok = p25 !== null && median !== null && p75 !== null && p25 < median && median < p75;
  return {
    id: 'field.middle', page: '/finish-times#field', denominator: 'story',
    values: { p25: p25 ?? NaN, median: median ?? NaN, p75: p75 ?? NaN },
    guard: ok,
    headline: ok ? `The middle half finished between *${hm(p25!)} and ${hm(p75!)}*.` : '',
    fallback: 'Every finish time, from the front of the field to the back.',
    figure: null,
  };
}

function fieldMiddle(): Nugget {
  const g = getFinishTimeSummary().groups.all;
  const at = (p: number) => g.percentiles.find((x) => x.p === p)?.minute ?? null;
  return fieldMiddleFrom({ p25: at(0.25), median: g.median, p75: at(0.75) });
}

/**
 * /finish-times #front: from the first era to the last, the change in the 10th- and 90th-percentile finish across the
 * courses with full coverage in both. "Got faster" needs the 10th percentile's interval below zero; "didn't clearly move"
 * needs the 90th's interval to straddle zero.
 */
export function fieldFrontFrom(eras: Courses['years']['eras']): Nugget {
  const { p10, p90 } = eras.summary;
  const minutes = Math.round(-p10.change);
  const ok = p10.ci95[1] < 0 && p90.ci95[0] < 0 && p90.ci95[1] > 0 && minutes >= 1;
  const span = `From ${years(eras.pre)} to ${years(eras.post)}`;
  return {
    id: 'field.front', page: '/finish-times#front', denominator: 'course',
    values: { p10_change: p10.change, p10_lo: p10.ci95[0], p10_hi: p10.ci95[1], p90_change: p90.change, p90_lo: p90.ci95[0], p90_hi: p90.ci95[1],
      p10_lower: p10.lower, courses: eras.high_coverage_courses.length, pre_from: eras.pre[0], pre_to: eras.pre[1], post_from: eras.post[0], post_to: eras.post[1] },
    guard: ok,
    headline: `The front got *${countWord(minutes)} minutes faster*; the back didn’t clearly move.`,
    fallback: `${span}, the 10th-percentile finish changed by ${signed(p10.change)} min and the 90th by ${signed(p90.change)} min.`,
    figure: null,
  };
}

/** /finish-times #by-race: the lowest and highest median finish among courses with 100 or more finishes and three or more editions. */
export function fieldByRaceFrom(courses: Pick<Courses['courses'][number], 'city' | 'finishes' | 'editions' | 'median_s'>[]): Nugget {
  const solid = courses.filter((c) => c.finishes >= 100 && c.editions >= 3);
  const lo = solid.length ? solid.reduce((a, b) => (b.median_s < a.median_s ? b : a)) : null;
  const hi = solid.length ? solid.reduce((a, b) => (b.median_s > a.median_s ? b : a)) : null;
  const ok = !!lo && !!hi && solid.length >= 2 && hi.median_s - lo.median_s >= 60;
  return {
    id: 'field.byrace', page: '/finish-times#by-race', denominator: 'course',
    values: { courses: solid.length, low_s: lo?.median_s ?? NaN, high_s: hi?.median_s ?? NaN, low: lo?.city ?? '', high: hi?.city ?? '' },
    guard: ok,
    // Floored to the minute, as the course pages and a race clock read a time (3:59:56 is "3:59", never "4:00").
    headline: ok ? `Median finish, course by\u00a0course: *${hm(Math.floor(lo!.median_s / 60))} to ${hm(Math.floor(hi!.median_s / 60))}*.` : '',
    fallback: 'Median finish, course by course.',
    figure: null,
  };
}

// ---------- Chapter 01 · The race replay ----------

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

/** The race replay's H1: the moment as a finding, without the race (the replay names it). Same guard as replay.first. */
export function replayTitleFrom(first: Nugget): Nugget {
  return {
    id: 'replay.title', page: '/stories/race-replay', denominator: 'positions',
    values: { share: Number(first.values.share ?? NaN) }, guard: first.guard,
    headline: 'At the first finish, *nearly half* the field hadn’t reached 20K.',
    fallback: 'Watch a marathon unfold',
    figure: null,
  };
}

/** A distance with one decimal in either unit, kept even when it is whole ("4.9 mi", "8.0 km"), so the two read alike. */
export const oneDecimal = (km: number, u: UnitSystem) => `${(u === 'mi' ? km / 1.609344 : km).toFixed(1)}\u00a0${u}`;

/**
 * The home band's moment (its flag frame, the first finish): how far the back of the field had come, in the edition
 * where it had come least (argmin of the back's distance at the first finish). The race-replay story opens on another
 * finding, the share short of 20K, in its own edition (replay.first), so the home page and chapter 01 never open on the
 * same race and moment unless the data picks one edition for both. "Just" needs the back short of halfway.
 */
export function replayBackFrom(edition: Pick<ReplayEditionMeta, 'city' | 'year' | 'moments'> & { slug?: string } | null): Nugget {
  const km = edition?.moments?.back_km_at_first ?? NaN;
  const ok = Number.isFinite(km) && km > 0 && km < MARATHON_KM / 2;
  const race = edition ? `${displayCity(edition.city)} ${edition.year}` : '';
  return {
    id: 'replay.back', page: '/', denominator: 'positions',
    values: { back_km: km, slug: edition?.slug ?? '', city: edition?.city ?? '', year: edition?.year ?? NaN }, guard: ok,
    headline: both((u) => `When the first runner finished ${race}, the back of the field had covered just *${oneDecimal(km, u)}*.`),
    fallback: Number.isFinite(km) ? both((u) => `When the first runner finished ${race}, the back of the field had covered ${oneDecimal(km, u)}.`) : 'The whole field, on one race clock.',
    figure: null,
  };
}

function replayBack(): Nugget {
  const known = readInsight<ReplayIndex>('replay.json').editions.filter((e) => Number.isFinite(e.moments?.back_km_at_first));
  return replayBackFrom(known.length ? known.reduce((a, b) => (b.moments!.back_km_at_first < a.moments!.back_km_at_first ? b : a)) : null);
}

/** #packs: finishes that passed the same mat together, and how far apart the middle 80% of them finished, in the page's own edition (replay.first's). */
export function replayPacksFrom(edition: Pick<ReplayEditionMeta, 'slug' | 'city' | 'year' | 'pack'> | null): Nugget {
  const e = edition?.pack && edition.pack.n >= 100 ? edition : null;
  if (!e) return { id: 'replay.packs', page: '/stories/race-replay#packs', denominator: 'positions', values: {}, guard: false, headline: '', fallback: 'Finishes that passed a mat together, mile by mile after it.', figure: null };
  const minutes = Math.round(e.pack!.finish_window_min);
  return {
    id: 'replay.packs', page: '/stories/race-replay#packs', denominator: 'positions',
    values: { slug: e.slug, city: e.city, year: e.year, n: e.pack!.n, checkpoint_km: e.pack!.checkpoint_km, window_min: e.pack!.finish_window_min },
    guard: minutes >= 10,
    headline: `Same ${matLabel(e.pack!.checkpoint_km)} split, *${minutes}\u00a0minutes* apart at the finish.`,
    fallback: `Through ${matLabel(e.pack!.checkpoint_km)} together; the middle 80% finished ${minutes} minutes apart.`,
    figure: null,
  };
}

// ---------- Chapter 03 · The shape of a race (/stories/pacing-types) ----------

/** A word unit follows its figure after a no-break space (the figure draws its unit with no gap of its own). */
const NBSP = '\u00a0';

/**
 * Chapter 03 lead and the pacing-types reading (the six types are its instrument): the two commonest types, named from
 * the data, and their share of finishes together. "Most" needs the two to hold more than half.
 */
export function typesTopFrom(types: Pick<Archetypes['archetypes'][number], 'name' | 'share'>[]): Nugget {
  const [a, b] = [...types].sort((x, y) => y.share - x.share);
  const share = a && b ? a.share + b.share : NaN;
  const names = a && b ? `${a.name}s or ${b.name}s` : '';
  return {
    id: 'types.top', page: '/stories/pacing-types', denominator: 'shape',
    values: { first: a?.name ?? '', first_share: a?.share ?? NaN, second: b?.name ?? '', second_share: b?.share ?? NaN, share, types: types.length },
    guard: Number.isFinite(share) && share > 0.5 && share < 1,
    // The reading is the accent (round 4: the one story H1 without one), the pair the figure under it counts.
    headline: `Most finishes were *${names}*.`,
    fallback: types.length ? `${capitalize(countWord(types.length))} ways to run *the same race*.` : 'Ways to run the same race.',
    figure: shareFigure(share),
    key: `were ${names}`,
  };
}

/**
 * The line under the pacing-types H1: the home page's guess (home.second20k) said where its hand-off lands, so the
 * reader's answer continues on the page it opens ("Only 1 in 25 finishes ran their second 20K faster than their
 * first."). Same guard and figure as the guess's answer; the eligible family, as the guess counts it.
 */
export function typesSecondFrom(guess: Pick<Nugget, 'guard' | 'figure' | 'values'>): Nugget {
  const words = guess.figure?.value ?? '';
  return {
    id: 'types.second20k', page: '/stories/pacing-types', denominator: 'eligible',
    values: { share: Number(guess.values.share ?? NaN) }, guard: guess.guard && !!words,
    headline: `Only ${words} finishes ran their second 20K faster than their first.`,
    fallback: 'The second 20K against the first, finish by finish.',
    figure: null,
  };
}

/** The evenest pacing type: the lowest median pace variation. */
export const evenestType = (types: Pick<Archetypes['archetypes'][number], 'median_cv'>[]) => types.reduce((best, t, i) => (t.median_cv < types[best].median_cv ? i : best), 0);

/** #river: the evenest type's share of the first and the last finish band. "Fades" needs the first at least twice the last. */
export function typesRiverFrom(data: Pick<Archetypes, 'archetypes' | 'river'>): Nugget {
  const m = evenestType(data.archetypes);
  const first = data.river[0], last = data.river[data.river.length - 1];
  const a = first?.shares[m] ?? NaN, b = last?.shares[m] ?? NaN;
  const name = data.archetypes[m]?.name ?? '';
  return {
    id: 'types.river', page: '/stories/pacing-types#river', denominator: 'shape',
    values: { type: name, first_band: first?.label ?? '', last_band: last?.label ?? '', first: a, last: b },
    guard: a > 2 * b && b > 0,
    headline: `${name}s were *${pct(a)}* of ${first?.label} finishes and ${pct(b)} of ${last?.label}.`,
    fallback: `${name}s: ${pct(a)} of ${first?.label} finishes, ${pct(b)} of ${last?.label}.`,
    figure: null,
  };
}

// ---------- Chapter 04 · Pass or be passed (/stories/places) ----------

/** The coin-flip row of a mat nearest a gap (seconds), or undefined. */
const nearestGap = (rows: { gap_lo_s: number; share: number }[] | undefined, s: number) =>
  rows?.length ? rows.reduce((a, b) => (Math.abs(b.gap_lo_s - s) < Math.abs(a.gap_lo_s - s) ? b : a)) : undefined;

/**
 * The places reading: trailing by about a minute at 30K, how often a finish still beat the runner ahead to the line, and the same gap from
 * 40K. Rows are the 30-second gap bands nearest 60 seconds, found in the data. "Still" needs the 30K share above the 40K one.
 */
export function placesGapFrom(coin: Positions['coin_flip']): Nugget {
  const a = nearestGap(coin['30'], 60), b = nearestGap(coin['40'], 60);
  const step = coin['30'] && coin['30'].length > 1 ? coin['30'][1].gap_lo_s - coin['30'][0].gap_lo_s : 30;
  if (!a || !b) return { id: 'places.gap', page: '/stories/places', denominator: 'positions', values: {}, guard: false, headline: '', fallback: 'Places after 30K, gap by gap.', figure: null };
  const gap = `${ms(a.gap_lo_s)}–${ms(a.gap_lo_s + step)}`;
  return {
    id: 'places.gap', page: '/stories/places', denominator: 'positions',
    values: { gap_lo_s: a.gap_lo_s, step_s: step, at30: a.share, at40: b.share }, guard: a.share > b.share,
    headline: `${gap} back at 30K, *${pct(a.share)}* still beat the runner ahead to the line. From 40K, ${pct(b.share)}.`,
    fallback: `${gap} back: ${pct(a.share)} beat the runner ahead to the line from 30K, ${pct(b.share)} from 40K.`,
    figure: shareFigure(a.share), key: `of finishes ${gap} back at 30K still beat the runner ahead to the line`,
  };
}

/**
 * /stories/places H1: the reading's gap, trailing by about a minute, closed how many times as often from 30K as from
 * 40K. "Twice" (or "three times" …) needs the ratio within a quarter of that whole number.
 */
export function placesTitleFrom(coin: Positions['coin_flip']): Nugget {
  const a = nearestGap(coin['30'], 60), b = nearestGap(coin['40'], 60);
  const step = coin['30'] && coin['30'].length > 1 ? coin['30'][1].gap_lo_s - coin['30'][0].gap_lo_s : 30;
  const r = a && b && b.share > 0 ? a.share / b.share : NaN;
  const k = Math.round(r);
  const times = k === 2 ? 'twice' : `${countWord(k) ?? k} times`;
  const gap = a ? `${ms(a.gap_lo_s)}–${ms(a.gap_lo_s + step)}` : '';
  return {
    id: 'places.title', page: '/stories/places', denominator: 'positions',
    values: { gap_lo_s: a?.gap_lo_s ?? NaN, at30: a?.share ?? NaN, at40: b?.share ?? NaN, ratio: r },
    guard: Number.isFinite(r) && k >= 2 && Math.abs(r - k) <= 0.25,
    headline: `From 30K, a ${gap} gap closed *${times} as often* as from 40K.`,
    fallback: 'Pass or be passed',
    figure: null,
  };
}

/**
 * #gap: how far back at 30K still beat the runner ahead as often as a minute back at 40K. The 30K band (three minutes back or
 * more, up to ten) whose share is nearest the 40K share at the reading's gap; "as often as" needs the two within a point.
 */
export function placesCoinFrom(coin: Positions['coin_flip']): Nugget {
  const b = nearestGap(coin['40'], 60);
  const far = (coin['30'] ?? []).filter((r) => b && r.gap_lo_s >= 3 * Math.max(60, b.gap_lo_s) && r.gap_lo_s <= 600);
  const a = b && far.length ? far.reduce((x, y) => (Math.abs(y.share - b.share) < Math.abs(x.share - b.share) ? y : x)) : undefined;
  const words = (s: number) => (s % 60 === 0 ? `${capitalize(countWord(s / 60))} minute${s === 60 ? '' : 's'}` : ms(s));
  return {
    id: 'places.coin', page: '/stories/places#gap', denominator: 'positions',
    values: { gap30_s: a?.gap_lo_s ?? NaN, at30: a?.share ?? NaN, gap40_s: b?.gap_lo_s ?? NaN, at40: b?.share ?? NaN },
    guard: !!a && !!b && Math.abs(a.share - b.share) <= 0.01,
    headline: a && b ? `*${words(a.gap_lo_s)} back* at 30K matched ${words(b.gap_lo_s).toLowerCase()} back at 40K.` : '',
    fallback: 'How often a finish beat the runner ahead to the line, by how far back it was, from 30K and from 40K.',
    figure: null,
  };
}

/** #break-even: the 30–40K pace, against a finish's own 5–20K pace, below which finishes still tended to gain places. */
export function placesBreakevenFrom(crossing: number | null): Nugget {
  const x = crossing ?? NaN;
  const ok = Number.isFinite(x) && x > 0 && x < 60;
  return {
    id: 'places.breakeven', page: '/stories/places#break-even', denominator: 'positions',
    values: { crossing: x }, guard: ok,
    headline: `Up to about *${Math.round(x)}% slower* after 30K, most finishes still gained places.`,
    fallback: 'Places gained after 30K, by the pace of 30–40K against a finish’s own 5–20K pace.',
    figure: null,
  };
}

/** #shuffle: the share that moved up after 30K, against how many more lost 10 or more places per 100 than gained them. */
export function placesShuffleFrom(p: Pick<Positions, 'gained_share' | 'surger_share' | 'sinker_share'>): Nugget {
  const r = p.surger_share > 0 ? p.sinker_share / p.surger_share : NaN;
  const ok = p.gained_share > 0.5 && r >= 1.5;
  return {
    id: 'places.shuffle', page: '/stories/places#shuffle', denominator: 'positions',
    values: { gained: p.gained_share, surgers: p.surger_share, sinkers: p.sinker_share, ratio: r }, guard: ok,
    headline: `Big drops after 30K outnumbered big gains *${Math.round(r)} to 1*.`,
    fallback: `${pct(p.gained_share)} moved up after 30K; ${pct(p.surger_share, 1)} gained 10 or more places per 100 and ${pct(p.sinker_share, 1)} lost 10 or more.`,
    figure: null,
  };
}

// ---------- Chapter 05 · After 30K (/slowdown, /stories/final-kick) ----------

/** Chapter 05 lead, /slowdown: of sustained slowdowns, the share that began at 30K or later. */
function slowdownLate(): Nugget {
  const study = getStudyEvidence();
  const rows = study?.timing.charts[0]?.rows ?? [];
  const total = rows.reduce((s, r) => s + Number(r.episodes ?? 0), 0);
  const late = rows.filter((r) => Number(r.label) >= 30).reduce((s, r) => s + Number(r.episodes ?? 0), 0);
  const share = total ? late / total : NaN;
  const ok = share >= 0.5;
  // A real nugget (WP3 owns /slowdown): scripts/nuggets/analyses.cjs recounts it.
  return ({
    id: 'slowdown.onset', page: '/slowdown', denominator: 'eligible', term: '/methodology#sustained-slowdown',
    values: { share, late, total, rate: study ? study.rate / 100 : NaN }, guard: ok,
    headline: `${capitalize(approxWords(share, 'sustained slowdowns'))} began at *30K or later*.`,
    fallback: `*${pct(share)}* of sustained slowdowns began at 30K or later.`,
    figure: shareFigure(share),
    key: 'of sustained slowdowns began at 30K or later',
  });
}

/** The final-kick title and reading: finishes matched on race, recorded gender and 5–20K pace, with and without a sustained slowdown. */
export function kickTwinsFrom(cost: Kick['cost']['stratified']): Nugget {
  const minutes = Math.round(cost.median_gap_s / 60);
  return {
    id: 'kick.twins', page: '/stories/final-kick', denominator: 'kick', term: '/methodology#sustained-slowdown',
    values: { median_gap_s: cost.median_gap_s, strata: cost.strata, finishes: cost.slowdown_finishes }, guard: cost.median_gap_s > 600,
    headline: `Same pace to 20K, *${minutes}${NBSP}minutes* apart at the finish.`,
    fallback: 'Same pace to 20K, apart at the finish.',
    figure: Number.isFinite(minutes) ? { value: String(minutes), unit: `${NBSP}min`, sr: `${minutes} minutes` } : null,
    key: 'later at the finish with a sustained slowdown than without, on the same pace to 20K',
  };
}

/**
 * The final-kick H1: its own finding with its number (round 4: "Same pace to 20K, far apart" repeated chapter 01's
 * "Same 10K split, 49 minutes apart" and withheld its number), in one short claim (round 5: four display lines, then the
 * same minutes again as a big figure). The comparison, the same pace to 20K, is the opener's dek. Said as an
 * observation, never a cause; the same guard as kick.twins (a typical gap of more than ten minutes), whose figure, on
 * the card into the page, gives the same whole minutes.
 */
export function kickTitleFrom(cost: Pick<Kick['cost']['stratified'], 'median_gap_s'>): Nugget {
  const minutes = Math.round(cost.median_gap_s / 60);
  return {
    id: 'kick.title', page: '/stories/final-kick', denominator: 'kick',
    values: { median_gap_s: cost.median_gap_s }, guard: cost.median_gap_s > 600,
    headline: `A sustained slowdown: *${minutes}${NBSP}minutes* later at the finish.`,
    fallback: 'From the same pace to 20K, finishes with and without a sustained slowdown.',
    figure: null,
  };
}

/** #twins: the gap at the finish across every 5–20K pace band. "At every pace" needs a positive gap in each band. */
export function kickBandsFrom(bands: Kick['cost']['bands']): Nugget {
  const rows = bands.filter((b) => b.slowdown_n >= 100 && b.other_n >= 100);
  const gaps = rows.map((b) => b.slowdown_finish_s - b.other_finish_s);
  const lo = gaps.length ? Math.min(...gaps) : NaN, hi = gaps.length ? Math.max(...gaps) : NaN;
  return {
    id: 'kick.bands', page: '/stories/final-kick#twins', denominator: 'kick',
    values: { bands: rows.length, low_s: lo, high_s: hi }, guard: rows.length >= 2 && lo > 0,
    headline: `At every pace through 20K, *${Math.round(lo / 60)} to ${Math.round(hi / 60)} minutes* later.`,
    fallback: 'Finish times with and without a sustained slowdown, by pace through 20K.',
    figure: null,
  };
}

/**
 * #warning: in the middle section the data reports, how often the most-slowed finishes went on to a sustained slowdown,
 * against finishes running faster than their early pace (the first and last rows, ordered by how much slower).
 */
export function kickWarningFrom(warning: Kick['warning']): Nugget {
  const w = warning[Math.floor(warning.length / 2)];
  const first = w?.rows[0], last = w?.rows[w.rows.length - 1];
  const ok = !!first && !!last && last.later > 0.5 && first.later < last.later;
  const section = w ? sectionName(w.after) : '';
  return {
    id: 'kick.warning', page: '/stories/final-kick#warning', denominator: 'kick',
    values: { section: w?.after ?? '', slowed: last?.label ?? '', slowed_later: last?.later ?? NaN, faster: first?.label ?? '', faster_later: first?.later ?? NaN },
    guard: ok,
    headline: `Already ${last?.label.toLowerCase()} at ${section}: *${pct(last?.later ?? NaN)}* went on to a sustained slowdown.`,
    fallback: `How often each pace at ${section} was followed by a sustained slowdown.`,
    figure: null,
  };
}

/** #states: finishes at sustained-slowdown pace in one section, and how many stayed that slow in the next. */
export function kickStayFrom(stay: Kick['recovery']['stay']): Nugget {
  const s = stay[0];
  const ok = !!s && s.stay > 0.5;
  return {
    id: 'kick.stay', page: '/stories/final-kick#states', denominator: 'kick',
    values: { source: s?.source ?? '', target: s?.target ?? '', n: s?.n ?? NaN, stay: s?.stay ?? NaN, back: s?.back_within_10 ?? NaN }, guard: ok,
    // The group it counts (sustained-slowdown pace over the section before) is the beat's dek.
    headline: s ? `No second wind: *${pct(s.stay)}* stayed that slow over ${sectionName(s.target)}.` : '',
    fallback: s ? `Of finishes at sustained-slowdown pace over ${sectionName(s.source)}, ${pct(s.stay)} stayed that slow over ${sectionName(s.target)}.` : 'Sustained-slowdown pace, section to section.',
    figure: null,
  };
}

/**
 * #magnet: of finishes with a sustained slowdown (the beat's subject, after "no second wind"), the share that ran the
 * last 2.2K faster than 35–40K, and how few of them got back to their early pace. "Even so" needs a majority.
 */
export function kickMagnetFrom(k: Pick<Kick['kick'], 'slowdown_share' | 'slowdown_final_below_baseline'>): Nugget {
  const last = MARATHON_KM - 40;
  const ok = k.slowdown_share > 0.5 && k.slowdown_final_below_baseline < 0.1;
  return {
    id: 'kick.magnet', page: '/stories/final-kick#magnet', denominator: 'kick',
    values: { share: k.slowdown_share, back: k.slowdown_final_below_baseline }, guard: ok,
    // The group it counts (finishes with a sustained slowdown) is the beat's dek, as for kick.stay.
    headline: both((u) => `Even so, *${pct(k.slowdown_share)}* sped up over the last ${distance(last, u)}.`),
    fallback: both((u) => `Of finishes with a sustained slowdown, ${pct(k.slowdown_share)} sped up over the last ${distance(last, u)}; ${pct(k.slowdown_final_below_baseline, 1)} got back to their early pace.`),
    figure: null,
  };
}

// ---------- Chapter 06 · The finish line (/stories/round-numbers) ----------

/** Chapter 06 lead: the busiest finishing minute (all finishes). The busiest is the argmax, so the guard is that it exists. The
 * scrolly's first step says it; the chart's readout beside the step gives its count. */
export function finishBusiestFrom(histogram: FinishTimes['histogram']): Nugget {
  const peak = histogram.length ? histogram.reduce((a, b) => (b.all > a.all ? b : a)) : null;
  return {
    id: 'finish.busiest', page: '/stories/round-numbers', denominator: 'story',
    values: { minute: peak?.minute ?? NaN, n: peak?.all ?? NaN }, guard: !!peak && peak.all > 0,
    headline: peak ? `Every finish, minute by minute: the busiest is *${hm(peak.minute)}*.` : '',
    fallback: 'Every finish, minute by minute.',
    figure: peak ? { value: hm(peak.minute), sr: spokenTime(peak.minute * 60) } : null, key: 'the busiest finishing minute',
  };
}

/**
 * The round-numbers reading: the minute before the round mark that stands tallest against the smooth curve. The figure
 * gives its ratio; the sentence gives the count and the minute, and "far above" needs the ratio at one and a half or more.
 */
export function roundTopFrom(marks: FinishTimes['marks']): Nugget {
  const top = marks.length ? marks.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : null;
  if (!top) return { id: 'round.top', page: '/stories/round-numbers', denominator: 'story', values: {}, guard: false, headline: '', fallback: 'Finish times, minute by minute.', figure: null };
  const before = hm(top.minutes - 1);
  return {
    id: 'round.top', page: '/stories/round-numbers', denominator: 'story',
    values: { mark: top.mark, minutes: top.minutes, ratio: top.ratio, n: top.minute_before, expected: top.expected_minute_before }, guard: top.ratio >= 1.5,
    // The figure and its key say how far above expected; the sentence gives the count and the minute.
    headline: `${count(top.minute_before)} finishes landed between ${before}:00 and ${before}:59.`,
    fallback: `${count(top.minute_before)} finishes landed between ${before}:00 and ${before}:59.`,
    // One decimal: the figure is a size a reader feels ("1.7×"); the towers' Values keep the two-decimal ratios.
    figure: { value: top.ratio.toFixed(1), unit: '×', sr: `${top.ratio.toFixed(1)} times` }, key: `as many finishes as expected in the minute before ${top.mark}`,
  };
}

/** The scrolly's round-mark step: hours and half-hours stand above the curve; most quarter-hours do not. */
export function roundMarksFrom(marks: FinishTimes['marks']): Nugget {
  const big = marks.filter((m) => m.kind === 'hour' || m.kind === 'half-hour'), quarters = marks.filter((m) => m.kind === 'quarter');
  const flat = quarters.filter((m) => m.ratio < 1.05).length;
  const ok = big.length > 0 && big.every((m) => m.ratio > 1.05) && quarters.length > 0 && flat > quarters.length / 2;
  return {
    id: 'round.marks', page: '/stories/round-numbers#towers', denominator: 'story',
    values: { marks: big.length, above: big.filter((m) => m.ratio > 1.05).length, quarters: quarters.length, flat }, guard: ok,
    // The beat's H2, the H1's finding widened (the H1 names 3:00): no accent, since the towers it names are ink.
    headline: 'A crowd gathers before every hour and half-hour.',
    fallback: 'The minute before each round mark, against the curve.',
    figure: null,
  };
}

/**
 * The scrolly's last step, its end state (the chart against the curve, the needle on a quarter-hour): hours and
 * half-hours stand above the curve, and quarter-hours mostly don't, named by the busiest quarter-hour under 1.05×.
 * The same guard as round.marks, plus that quarter-hour itself.
 */
export function roundQuarterFrom(marks: FinishTimes['marks']): Nugget {
  const marked = roundMarksFrom(marks);
  const flat = marks.filter((m) => m.kind === 'quarter' && m.ratio < 1.05);
  const q = flat.length ? flat.reduce((a, b) => (b.minute_before > a.minute_before ? b : a)) : null;
  return {
    id: 'round.quarter', page: '/stories/round-numbers#towers', denominator: 'story',
    values: { mark: q?.mark ?? '', minutes: q?.minutes ?? NaN, ratio: q?.ratio ?? NaN, n: q?.minute_before ?? NaN }, guard: marked.guard && !!q,
    headline: q ? `Against the curve, the minute before every hour and half-hour stands tall; before a quarter-hour like *${q.mark}*, it mostly doesn’t.` : '',
    fallback: 'Against the curve, the minute before each round mark.',
    figure: null,
  };
}

/** The round-numbers guess: at 40K on course for just over the busiest round mark, the share that still got under it, against finishes away from a mark. */
export function roundRescueFrom(bubble: FinishTimes['bubble']): Nugget {
  const b = bubble.length ? bubble.reduce((a, c) => (c.over.n > a.over.n ? c : a)) : null;
  const x = b?.over.share_under ?? NaN, y = b?.over.expected_share_under ?? NaN;
  return {
    id: 'round.rescue', page: '/stories/round-numbers#rescue', denominator: 'story',
    values: { mark: b?.mark ?? '', minutes: b?.minutes ?? NaN, n: b?.over.n ?? NaN, under: x, expected: y }, guard: x > y,
    headline: `*${pct(x)}* did. Away from a round mark, ${pct(y)}.`,
    fallback: `${pct(x)} did. Away from a round mark, ${pct(y)}.`,
    figure: null,
  };
}

// ---------- Chapter 07 · Who holds pace (/stories/who-holds-pace) ----------

/** Chapter 07 lead: sustained slowdown, recorded women against recorded men at the same finish times. */
export function holdsGenderFrom(o: Pick<Demographics['overall'], 'women_slowdown' | 'men_slowdown'>): Nugget {
  const w = o.women_slowdown, m = o.men_slowdown;
  return {
    id: 'holds.gender', page: '/stories/who-holds-pace', denominator: 'demographics', term: '/methodology#sustained-slowdown',
    values: { women: w, men: m }, guard: m > w,
    headline: `At the same finish times, *${pct(w)}* of recorded women’s finishes had a sustained slowdown, against ${pct(m)} of men’s.`,
    fallback: `At the same finish times: recorded women ${pct(w)}, recorded men ${pct(m)}.`,
    figure: { value: `${pct(w)} · ${pct(m)}`, sr: `${spokenPct(w)} of recorded women, ${spokenPct(m)} of recorded men` },
    key: 'of recorded women’s and men’s finishes had a sustained slowdown, at the same finish times',
  };
}

/**
 * /stories/who-holds-pace H1: at the same finish times, recorded women had far fewer sustained slowdowns, said in the
 * measure's own words (round 5: "held their pace" named the group three ways across the site, and a finish without a
 * sustained slowdown may still have slowed). "Far" needs men at least half as many again.
 */
export function holdsTitleFrom(o: Pick<Demographics['overall'], 'women_slowdown' | 'men_slowdown'>): Nugget {
  const w = o.women_slowdown, m = o.men_slowdown;
  return {
    id: 'holds.title', page: '/stories/who-holds-pace', denominator: 'demographics',
    values: { women: w, men: m }, guard: w > 0 && m > 1.5 * w,
    headline: 'Recorded women had *far fewer* sustained slowdowns.',
    fallback: 'Women and men',
    figure: null,
  };
}

/**
 * A gap between two bars, in points, from the unrounded difference (5.552 is "5.6 points apart"), never the difference
 * of the two rounded bars (15.5 − 10.0 = 5.5), so a chart's gap label and its heading's figure always agree.
 */
export const pointsApart = (gap: number) => `${(Math.round(Math.abs(gap) * 10) / 10).toFixed(1)} points apart`;

/** #unmask: the second-20K gap between recorded women and men, pooled and matched on race and finish minute, as a ratio in words. */
export function holdsUnmaskFrom(o: Pick<Demographics['overall'], 'pooled_women_block' | 'pooled_men_block' | 'women_block' | 'men_block'>): Nugget {
  const pooled = o.pooled_men_block - o.pooled_women_block, matched = o.men_block - o.women_block;
  const r = pooled > 0 ? matched / pooled : NaN;
  return {
    id: 'holds.unmask', page: '/stories/who-holds-pace#unmask', denominator: 'demographics',
    values: { pooled_women: o.pooled_women_block, pooled_men: o.pooled_men_block, women: o.women_block, men: o.men_block, pooled_gap: pooled, matched_gap: matched, ratio: r },
    guard: pooled > 0 && matched > 0 && r >= 2,
    // One clause: the two bar groups carry the gaps (pointsApart, from these unrounded values), and the dek says what is
    // compared. The ratio is of second-20K slowing gaps, never of the sustained-slowdown shares the page opens on.
    headline: `Like for like, the gap was *${Math.round(r) === 2 ? 'twice' : `${countWord(Math.round(r))} times`}* as wide.`,
    fallback: `Second 20K against the first, pooled: women ${signed(o.pooled_women_block)}%, men ${signed(o.pooled_men_block)}%. Same race and finish minute: ${signed(o.women_block)}% and ${signed(o.men_block)}%.`,
    figure: null,
  };
}

/**
 * #ghost: in the finish band with the most matched finishes, how far ahead recorded men were at the mat of the widest
 * gap. The band is a finish-time band, so the two finish level by construction; the guard still checks it (under 30 s).
 */
export function holdsGhostFrom(bands: Pick<Demographics['bands'][number], 'label' | 'matched_weight' | 'ghost_s'>[]): Nugget {
  const b = bands.length ? bands.reduce((a, c) => (c.matched_weight > a.matched_weight ? c : a)) : null;
  const gap = b ? Math.max(...b.ghost_s) : NaN;
  const k = b ? b.ghost_s.indexOf(gap) : -1;
  const mats = [5, 10, 15, 20, 25, 30, 35, 40, MARATHON_KM];
  const together = !!b && Math.abs(b.ghost_s[b.ghost_s.length - 1]) < 30;
  return {
    id: 'holds.ghost', page: '/stories/who-holds-pace#ghost', denominator: 'demographics',
    values: { band: b?.label ?? '', gap_s: gap, mat_km: mats[k] ?? NaN }, guard: together && gap >= 60,
    // The selection is the frame and the gap the finding: these finishes share a finish band, so their meeting at the
    // line is true by construction and is never told as a result (round 5: "then gave it all back" read as one). The
    // guard (`together`) keeps the band one whose two groups finished within 30 seconds of each other.
    headline: b ? `Finishing in ${b.label}, recorded men were *${ms(gap)}* ahead at ${matLabel(mats[k])}.` : '',
    fallback: b ? `Finishing in ${b.label}: recorded men and women, mat by mat.` : 'Recorded men and women, mat by mat.',
    figure: null,
  };
}

// ---------- Chapter 08 · Where you run (/stories/courses) ----------

/**
 * The courses reading: how often an edition's own pacing shape named its course, against chance (as a share, so the
 * identification set's course count never shows beside the shape cohort's). The page draws both on its ruler.
 */
export function coursesNamedFrom(id: Pick<Courses['identification'], 'correct' | 'editions_tested' | 'chance' | 'courses'>): Nugget {
  const share = id.editions_tested > 0 ? id.correct / id.editions_tested : NaN;
  return {
    id: 'courses.named', page: '/stories/courses', denominator: 'course',
    values: { correct: id.correct, tested: id.editions_tested, share, chance: id.chance, courses: id.courses }, guard: share > 2 * id.chance,
    headline: `From its pacing shape alone, an edition’s course was named *${pct(share)}* of the time; by chance, about ${pct(id.chance)}.`,
    fallback: `From its pacing shape alone, an edition’s course was named correctly ${pct(share)} of the time.`,
    figure: shareFigure(share), key: `of races traced to their course by pacing shape alone, against ${pct(id.chance)} by chance`,
  };
}

/** #fingerprint: the commonest slowest 5K section across courses with a pacing shape, and on how many courses it was the slowest. */
export function coursesSlowestFrom(courses: Pick<Courses['courses'][number], 'slowest_section' | 'curve'>[]): Nugget {
  const shaped = courses.filter((c) => c.curve?.length && c.slowest_section);
  const tally = new Map<string, number>();
  for (const c of shaped) tally.set(c.slowest_section!, (tally.get(c.slowest_section!) ?? 0) + 1);
  const [section, k] = [...tally.entries()].reduce((a, b) => (b[1] > a[1] ? b : a), ['', 0] as [string, number]);
  return {
    id: 'courses.slowest', page: '/stories/courses#fingerprint', denominator: 'course',
    values: { section, k, n: shaped.length }, guard: shaped.length > 0 && k > shaped.length / 2,
    // The courses it counts (those with a pacing shape) are the beat's dek.
    headline: `The slowest 5K was ${sectionName(section)} on *${k} of ${shaped.length}* courses.`,
    fallback: 'The slowest 5K, course by course.',
    figure: null,
  };
}

/** #steadiness: the evenest type's share of finishes, lowest and highest across courses with 10,000 or more finishes and three or more editions. */
export function coursesSteadyFrom(data: Pick<Archetypes, 'archetypes' | 'courses'>): Nugget {
  const m = evenestType(data.archetypes);
  const big = data.courses.filter((c) => c.finishes >= 10000 && c.editions >= 3);
  const shares = big.map((c) => c.shares[m]);
  const lo = shares.length ? Math.min(...shares) : NaN, hi = shares.length ? Math.max(...shares) : NaN;
  const name = data.archetypes[m]?.name ?? '';
  return {
    id: 'courses.steady', page: '/stories/courses#steadiness', denominator: 'shape',
    values: { type: name, courses: big.length, low: lo, high: hi }, guard: big.length >= 2 && hi >= 1.5 * lo,
    headline: `${name}s ran from *${pct(lo)} to ${pct(hi)}* of finishes, course by course.`,
    fallback: `${name}s, course by course.`,
    figure: null,
  };
}

// ---------- Chapter 09 · The weather (/stories/race-morning) ----------

/** Chapter 09 lead: same-course pairs of editions at least a set gap apart at the start, in which the warmer year had more sustained slowdowns. */
export function weatherPairsFrom(pairs: Pick<Courses['weather']['pairs'], 'hotter_slowed_more' | 'total' | 'min_gap_c'> | undefined): Nugget {
  const n = pairs?.hotter_slowed_more ?? NaN, total = pairs?.total ?? NaN, gap = pairs?.min_gap_c ?? NaN;
  return {
    id: 'weather.pairs', page: '/stories/race-morning', denominator: 'course', term: '/methodology#sustained-slowdown',
    values: { warmer_more: n, total, min_gap_c: gap }, guard: n > total / 2,
    // The figure above it gives the count, so the sentence says what is counted, without repeating it.
    headline: both((u) => `In pairs of editions of the same course at least ${tempGap(gap, u)} apart at the start, the warmer one *usually* had more sustained slowdowns.`),
    fallback: both((u) => `${count(n)} of ${count(total)} same-course pairs at least ${tempGap(gap, u)} apart at the start: the warmer year had more sustained slowdowns.`),
    figure: Number.isFinite(n) ? { value: count(n), unit: `${NBSP}of ${count(total)}`, sr: `${count(n)} of ${count(total)}` } : null,
    key: 'same-course pairs: the warmer year had more sustained slowdowns',
  };
}

/** /stories/race-morning H1: on the warmer of two mornings, the same course slowed more, in most same-course pairs. */
export function weatherTitleFrom(pairs: Pick<Courses['weather']['pairs'], 'hotter_slowed_more' | 'total'> | undefined): Nugget {
  const n = pairs?.hotter_slowed_more ?? NaN, total = pairs?.total ?? NaN;
  return {
    id: 'weather.title', page: '/stories/race-morning', denominator: 'course',
    values: { warmer_more: n, total }, guard: n > total / 2,
    headline: 'On a warmer morning, the same course *slowed more*.',
    fallback: 'Race-morning weather',
    figure: null,
  };
}

/**
 * #curvature: the median finish's change per degree warmer, near the coolest start temperature whose interval is above
 * zero and near the warmest. "Counts for more" needs the warm slope at least one and a half times the cool one.
 */
export function weatherCurveFrom(points: Courses['weather']['curvature']['finish_min_per_c']): Nugget {
  const sure = points.filter((p) => p.ci95[0] > 0);
  const cool = sure.length ? sure.reduce((a, b) => (b.temp < a.temp ? b : a)) : null;
  const warm = points.length ? points.reduce((a, b) => (b.temp > a.temp ? b : a)) : null;
  const ok = !!cool && !!warm && warm.temp > cool.temp && warm.slope >= 1.5 * cool.slope;
  const per = (v: number, u: UnitSystem) => perDegree(v, u).toFixed(1);
  const deg = (u: UnitSystem) => (u === 'mi' ? '°F' : '°C');
  return {
    id: 'weather.curve', page: '/stories/race-morning#curvature', denominator: 'course',
    values: { cool_c: cool?.temp ?? NaN, cool_slope: cool?.slope ?? NaN, warm_c: warm?.temp ?? NaN, warm_slope: warm?.slope ?? NaN }, guard: ok,
    // One claim (the warm end); the beat's dek gives the cool end it is compared with.
    headline: both((u) => `Near ${temp(warm?.temp ?? NaN, u)}, each ${deg(u)} warmer went with *${per(warm?.slope ?? NaN, u)}\u00a0min* more.`),
    fallback: 'The median finish against the start temperature, degree by degree.',
    figure: null,
  };
}

/** #heat: warmer mornings tilt the race: the early sections relatively quicker and the late ones relatively slower. */
export function weatherTiltFrom(sig: Courses['weather']['heat_signature']): Nugget {
  const early = sig.length ? sig.reduce((a, b) => (b.per_10c < a.per_10c ? b : a)) : null;
  const late = sig.length ? sig.reduce((a, b) => (b.per_10c > a.per_10c ? b : a)) : null;
  const ok = !!early && !!late && sig.indexOf(early) < sig.indexOf(late) && early.ci95[1] < 0 && late.ci95[0] > 0;
  return {
    id: 'weather.tilt', page: '/stories/race-morning#heat', denominator: 'course',
    values: { early: early?.section ?? '', early_per_10c: early?.per_10c ?? NaN, late: late?.section ?? '', late_per_10c: late?.per_10c ?? NaN }, guard: ok,
    headline: 'Warm mornings change the shape of the race, *not just the clock*.',
    fallback: 'Section by section, the pace of warmer mornings against cooler ones.',
    figure: null,
  };
}

const finish = () => readInsight<FinishTimes>('finish-times.json');
const archetypes = () => readInsight<Archetypes>('archetypes.json');
const positions = () => readInsight<Positions>('positions.json');
const kick = () => readInsight<Kick>('kick.json');
const demographics = () => readInsight<Demographics>('demographics.json');
const courses = () => readInsight<Courses>('courses.json');

export const STORY_NUGGETS: Record<string, Builder> = {
  'field.median': fieldMedian,
  'field.title': () => fieldTitleFrom(getFinishTimeSummary().groups.all.median),
  'field.middle': fieldMiddle,
  'field.front': () => fieldFrontFrom(courses().years.eras),
  'field.byrace': () => fieldByRaceFrom(courses().courses),
  'replay.first': replayFirst,
  'replay.title': () => replayTitleFrom(replayFirst()),
  'replay.back': replayBack,
  // The page's own edition (the replay.first one, like the replay and #emptying), so the story never switches race.
  'replay.packs': () => { const slug = String(replayFirst().values.slug ?? ''); return replayPacksFrom(readInsight<ReplayIndex>('replay.json').editions.find((e) => e.slug === slug) ?? null); },
  'types.top': () => typesTopFrom(archetypes().archetypes),
  'types.river': () => typesRiverFrom(archetypes()),
  'types.second20k': () => typesSecondFrom(HOME_NUGGETS['home.second20k']()),
  'places.gap': () => placesGapFrom(positions().coin_flip),
  'places.title': () => placesTitleFrom(positions().coin_flip),
  'places.coin': () => placesCoinFrom(positions().coin_flip),
  'places.breakeven': () => placesBreakevenFrom(positions().breakeven_crossing),
  'places.shuffle': () => placesShuffleFrom(positions()),
  'slowdown.onset': slowdownLate,
  'kick.twins': () => kickTwinsFrom(kick().cost.stratified),
  'kick.title': () => kickTitleFrom(kick().cost.stratified),
  'kick.bands': () => kickBandsFrom(kick().cost.bands),
  'kick.warning': () => kickWarningFrom(kick().warning),
  'kick.stay': () => kickStayFrom(kick().recovery.stay),
  'kick.magnet': () => kickMagnetFrom(kick().kick),
  'finish.busiest': () => finishBusiestFrom(finish().histogram),
  'round.top': () => roundTopFrom(finish().marks),
  'round.marks': () => roundMarksFrom(finish().marks),
  'round.quarter': () => roundQuarterFrom(finish().marks),
  'round.rescue': () => roundRescueFrom(finish().bubble),
  'holds.gender': () => holdsGenderFrom(demographics().overall),
  'holds.title': () => holdsTitleFrom(demographics().overall),
  'holds.unmask': () => holdsUnmaskFrom(demographics().overall),
  'holds.ghost': () => holdsGhostFrom(demographics().bands),
  'courses.named': () => coursesNamedFrom(courses().identification),
  'courses.slowest': () => coursesSlowestFrom(courses().courses),
  'courses.steady': () => coursesSteadyFrom(archetypes()),
  'weather.pairs': () => weatherPairsFrom(courses().weather?.pairs),
  'weather.title': () => weatherTitleFrom(courses().weather?.pairs),
  'weather.curve': () => weatherCurveFrom(courses().weather.curvature.finish_min_per_c),
  'weather.tilt': () => weatherTiltFrom(courses().weather.heat_signature),
};
