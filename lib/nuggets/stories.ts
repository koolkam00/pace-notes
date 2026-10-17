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
import { approxWords, count, countWord, distance, hm, inWords, matLabel, ms, pct, perDegree, sectionLabel, spokenPct, spokenTime, temp, tempGap } from './format';
import { capitalize, shareFigure, type Builder } from './build';
import type { Nugget, UnitsAware } from './types';

const MINUS = '−';
/** A signed number with the minus sign: −5.8, +2.2. */
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(digits)}`;
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

/** /finish-times #field: the middle half of all finishes, the 25th to the 75th percentile (nearest rank, whole minutes). */
export function fieldMiddleFrom(q: { p25: number | null; median: number | null; p75: number | null }): Nugget {
  const { p25, median, p75 } = q;
  const ok = p25 !== null && median !== null && p75 !== null && p25 < median && median < p75;
  return {
    id: 'field.middle', page: '/finish-times#field', denominator: 'story',
    values: { p25: p25 ?? NaN, median: median ?? NaN, p75: p75 ?? NaN },
    guard: ok,
    headline: ok ? `Half of all finishes landed between *${hm(p25!)} and ${hm(p75!)}*.` : '',
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
    headline: `${span}, the front of the field got *${countWord(minutes)} minutes faster*. The back didn’t clearly move.`,
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
    headline: ok ? `Median finish, race by race: *${hm(lo!.median_s / 60)} to ${hm(hi!.median_s / 60)}*.` : '',
    fallback: 'Median finish, race by race.',
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
    headline: 'When the first runner finished, *nearly half* the field hadn’t reached 20K.',
    fallback: 'Watch a marathon unfold',
    figure: null,
  };
}

/** The reading's sentence: how far the back of the field had come at that moment, in the replay.first edition. */
export function replayBackFrom(edition: Pick<ReplayEditionMeta, 'city' | 'year' | 'moments'> | null): Nugget {
  const km = edition?.moments?.back_km_at_first ?? NaN;
  const ok = Number.isFinite(km) && km > 0 && km < MARATHON_KM / 2;
  return {
    id: 'replay.back', page: '/stories/race-replay', denominator: 'positions',
    values: { back_km: km, city: edition?.city ?? '', year: edition?.year ?? NaN }, guard: ok,
    headline: both((u) => `At that moment, the back of the field had covered just *${distance(km, u)}*.`),
    fallback: Number.isFinite(km) ? both((u) => `At that moment, the back of the field had covered ${distance(km, u)}.`) : 'The whole field, on one race clock.',
    figure: null,
  };
}

function replayBack(): Nugget {
  const { editions } = readInsight<ReplayIndex>('replay.json');
  const slug = String(replayFirst().values.slug ?? '');
  return replayBackFrom(editions.find((e) => e.slug === slug) ?? null);
}

/** #replay: in how many editions the field spread out more over 20–40K than over 0–20K. "All" needs every one. */
export function replaySpreadFrom(stretch: Pick<NonNullable<ReplayIndex['stretch']>, 'wider_after_20' | 'editions'> | null | undefined): Nugget {
  const n = stretch?.editions.length ?? 0, k = stretch?.wider_after_20 ?? 0;
  return {
    id: 'replay.spread', page: '/stories/race-replay#replay', denominator: 'positions',
    values: { wider: k, editions: n }, guard: n > 0 && k === n,
    headline: `In all ${count(n)} race editions, the field spread out *more after 20K* than before it.`,
    fallback: n ? `In ${count(k)} of ${count(n)} race editions, the field spread out more after 20K than before it.` : 'The whole field, on one race clock.',
    figure: null,
  };
}

/** #packs: finishes that passed the same mat together, and how far apart the middle 80% of them finished (the edition with the widest spread). */
export function replayPacksFrom(editions: Pick<ReplayEditionMeta, 'slug' | 'city' | 'year' | 'pack'>[]): Nugget {
  const packed = editions.filter((e) => e.pack && e.pack.n >= 100);
  if (!packed.length) return { id: 'replay.packs', page: '/stories/race-replay#packs', denominator: 'positions', values: {}, guard: false, headline: '', fallback: 'Finishes that passed a mat together, mile by mile after it.', figure: null };
  const e = packed.reduce((a, b) => (b.pack!.finish_window_min > a.pack!.finish_window_min ? b : a));
  const minutes = Math.round(e.pack!.finish_window_min);
  return {
    id: 'replay.packs', page: '/stories/race-replay#packs', denominator: 'positions',
    values: { slug: e.slug, city: e.city, year: e.year, n: e.pack!.n, checkpoint_km: e.pack!.checkpoint_km, window_min: e.pack!.finish_window_min },
    guard: minutes >= 10,
    headline: `Same ${matLabel(e.pack!.checkpoint_km)} split, *${minutes} minutes* apart at the finish.`,
    fallback: `Through ${matLabel(e.pack!.checkpoint_km)} together; the middle 80% finished ${minutes} minutes apart.`,
    figure: null,
  };
}

/**
 * #emptying: late in the race (the race-clock reading nearest the edition's median finish), the share of the drop in
 * the field's speed on course that reflects who is still out there. "Mostly" needs a majority.
 */
export function replayLeftFrom(edition: Pick<ReplayEditionMeta, 'city' | 'year' | 'median_finish_s' | 'composition'> | null): Nugget {
  const rows = (edition?.composition ?? []).filter((r) => typeof r.composition_share === 'number');
  const at = rows.length && edition ? rows.reduce((a, b) => (Math.abs(b.clock_s - edition.median_finish_s) < Math.abs(a.clock_s - edition.median_finish_s) ? b : a)) : null;
  const share = at?.composition_share ?? NaN;
  return {
    id: 'replay.left', page: '/stories/race-replay#emptying', denominator: 'positions',
    values: { city: edition?.city ?? '', year: edition?.year ?? NaN, clock_s: at?.clock_s ?? NaN, share, on_course: at?.on_course ?? NaN },
    guard: share > 0.5 && share < 1,
    headline: 'Late in the race, the slower pace on course is mostly *who’s left*.',
    fallback: Number.isFinite(share) ? `Late in the race, ${pct(share)} of the slower pace on course reflects who’s left.` : 'The pace on course, hour by hour.',
    figure: null,
  };
}

function replayLeft(): Nugget {
  const { editions } = readInsight<ReplayIndex>('replay.json');
  const slug = String(replayFirst().values.slug ?? '');
  return replayLeftFrom(editions.find((e) => e.slug === slug) ?? null);
}

// ---------- Chapter 03 · The shape of a race (/stories/pacing-types) ----------

/** A figure from inWords: "1 in 25" → 1 with the unit "in 25"; "4%" → 4 with "%". */
function oneIn(words: string): { value: string; unit?: string } {
  const m = /^(1) (in \d+)$/.exec(words) ?? /^([\d.]+)(%)$/.exec(words);
  return m ? { value: m[1], unit: m[2] } : { value: words };
}

/** Chapter 03 lead and the pacing-types reading: the share of finishes whose second 20K was faster than their first. */
export function shapeSecond20kFrom(row: { count: number; total: number } | null): Nugget {
  const share = row && row.total > 0 && row.count >= 0 && row.count <= row.total ? row.count / row.total : NaN;
  const known = Number.isFinite(share) && share > 0 && share < 1;
  return {
    id: 'shape.second20k', page: '/stories/pacing-types', denominator: 'eligible',
    values: { share, n: row?.count ?? NaN, total: row?.total ?? NaN }, guard: known && share < 0.5,
    headline: `Only *${inWords(share, 'finishes')}* ran their second 20K faster than their first.`,
    fallback: known ? `*${inWords(share, 'finishes')}* ran their second 20K faster than their first.` : 'The second 20K against the first, finish by finish.',
    // "1 in 25" as a big 1 with "in 25" beside it, so the figure keeps its width beside the sentence.
    figure: known ? { ...oneIn(inWords(share)), sr: inWords(share, 'finishes') } : null,
    key: 'ran their second 20K faster than their first',
  };
}

function shapeSecond20k(): Nugget {
  const row = table('ext_pacing_shapes', 'patterns.csv').find((r) => r.label === 'Faster second 20 km');
  const n = Number(row?.count), total = Number(row?.n_value);
  return shapeSecond20kFrom(row && Number.isFinite(n) && Number.isFinite(total) ? { count: n, total } : null);
}

/** The evenest pacing type: the lowest median pace variation. */
export const evenestType = (types: Pick<Archetypes['archetypes'][number], 'median_cv'>[]) => types.reduce((best, t, i) => (t.median_cv < types[best].median_cv ? i : best), 0);

/** /stories/pacing-types on the contents: the share of finishes in the evenest type. */
export function typesMetronomeFrom(types: Pick<Archetypes['archetypes'][number], 'name' | 'share' | 'median_cv'>[]): Nugget {
  const i = types.length ? evenestType(types) : -1;
  const t = types[i];
  return {
    id: 'types.metronome', page: '/stories/pacing-types', denominator: 'shape',
    values: { types: types.length, name: t?.name ?? '', share: t?.share ?? NaN, median_cv: t?.median_cv ?? NaN }, guard: types.length >= 2,
    headline: t ? `The evenest of the ${countWord(types.length)} shapes, the ${t.name}, was *${pct(t.share)}* of finishes.` : '',
    fallback: 'The shapes of a marathon, finish by finish.',
    figure: t ? shareFigure(t.share) : null, key: t ? `ran as the ${t.name}, the evenest type` : undefined,
  };
}

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
    headline: `Even pacing fades with the clock: ${name}s were *${pct(a)}* of ${first?.label} finishes and ${pct(b)} of ${last?.label}.`,
    fallback: `${name}s: ${pct(a)} of ${first?.label} finishes, ${pct(b)} of ${last?.label}.`,
    figure: null,
  };
}

/**
 * #gender: the type with the largest gap between recorded men's and women's shares at the same finish times (the
 * standardized shares), as a ratio in words. "N times as often" needs a ratio of two or more.
 */
export function typesGenderFrom(data: Pick<Archetypes, 'archetypes' | 'gender'>): Nugget {
  const w = data.gender.women.standardized_shares, m = data.gender.men.standardized_shares;
  const c = data.archetypes.reduce((best, _, i) => (w[i] > 0 && m[i] / w[i] > m[best] / w[best] ? i : best), 0);
  const r = m[c] / w[c];
  const name = data.archetypes[c]?.name ?? '';
  return {
    id: 'types.gender', page: '/stories/pacing-types#gender', denominator: 'shape',
    values: { type: name, women: w[c], men: m[c], ratio: r }, guard: r >= 2,
    headline: `At the same finish times, recorded men’s finishes were ${name}s *${countWord(Math.round(r))} times* as often as women’s.`,
    fallback: `${name}s at the same finish times: ${pct(w[c], 1)} of recorded women’s finishes, ${pct(m[c], 1)} of men’s.`,
    figure: null,
  };
}

// ---------- Chapter 04 · Pass or be passed (/stories/places) ----------

/** The coin-flip row of a mat nearest a gap (seconds), or undefined. */
const nearestGap = (rows: { gap_lo_s: number; share: number }[] | undefined, s: number) =>
  rows?.length ? rows.reduce((a, b) => (Math.abs(b.gap_lo_s - s) < Math.abs(a.gap_lo_s - s) ? b : a)) : undefined;

/**
 * The places reading: trailing by about a minute at 30K, how often a finish still crossed first, and the same gap from
 * 40K. Rows are the 30-second gap bands nearest 60 seconds, found in the data. "Still" needs the 30K share above the 40K one.
 */
export function placesGapFrom(coin: Positions['coin_flip']): Nugget {
  const a = nearestGap(coin['30'], 60), b = nearestGap(coin['40'], 60);
  const step = coin['30'] && coin['30'].length > 1 ? coin['30'][1].gap_lo_s - coin['30'][0].gap_lo_s : 30;
  if (!a || !b) return { id: 'places.gap', page: '/stories/places', denominator: 'positions', values: {}, guard: false, headline: '', fallback: 'Places after 30K, gap by gap.', figure: null };
  const gap = `${a.gap_lo_s}–${a.gap_lo_s + step} seconds`;
  return {
    id: 'places.gap', page: '/stories/places', denominator: 'positions',
    values: { gap_lo_s: a.gap_lo_s, step_s: step, at30: a.share, at40: b.share }, guard: a.share > b.share,
    headline: `Trailing by ${gap} at 30K, a finish still *crossed first* ${pct(a.share)} of the time. From 40K, ${pct(b.share)}.`,
    fallback: `Trailing by ${gap}: ${pct(a.share)} crossed first from 30K, ${pct(b.share)} from 40K.`,
    figure: shareFigure(a.share), key: `of finishes ${a.gap_lo_s}–${a.gap_lo_s + step} s back at 30K still crossed first`,
  };
}

/** #gap: "close to a coin flip" needs at least 0.40 at 30K; "at 40K it isn't" needs under 0.30 there. */
export function placesCoinFrom(coin: Positions['coin_flip']): Nugget {
  const a = nearestGap(coin['30'], 60), b = nearestGap(coin['40'], 60);
  return {
    id: 'places.coin', page: '/stories/places#gap', denominator: 'positions',
    values: { at30: a?.share ?? NaN, at40: b?.share ?? NaN }, guard: !!a && !!b && a.share >= 0.4 && b.share < 0.3,
    headline: 'A minute back at 30K is *close to a coin flip*. At 40K it isn’t.',
    fallback: 'A minute back: how often the trailing finish crossed first, from 30K and from 40K.',
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
    headline: `Running 30–40K up to about *${Math.round(x)}% slower* than their own 5–20K pace, finishes still tended to gain places.`,
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
    headline: `${pct(p.gained_share)} moved up after 30K, yet big drops outnumbered big gains *${Math.round(r)} to 1*.`,
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
    headline: `${capitalize(approxWords(share))} sustained slowdowns began at *30K or later*.`,
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
    headline: `Same pace to 20K, *${minutes} minutes* apart at the finish.`,
    fallback: 'Same pace to 20K, apart at the finish.',
    figure: Number.isFinite(minutes) ? { value: String(minutes), unit: 'min', sr: `${minutes} minutes` } : null,
    key: 'later at the finish, after a sustained slowdown',
  };
}

/** The final-kick reading's sentence: who the comparison holds level, and the typical gap. */
export function kickLaterFrom(cost: Kick['cost']['stratified']): Nugget {
  const minutes = Math.round(cost.median_gap_s / 60);
  return {
    id: 'kick.later', page: '/stories/final-kick', denominator: 'kick', term: '/methodology#sustained-slowdown',
    values: { median_gap_s: cost.median_gap_s }, guard: cost.median_gap_s > 600,
    headline: `Same race, same recorded gender, same 5–20K pace: finishes with a sustained slowdown came in a typical *${minutes} minutes* later.`,
    fallback: 'Same race, same recorded gender, same 5–20K pace: finish times with and without a sustained slowdown.',
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
    headline: `At every pace through 20K, a sustained slowdown went with *${Math.round(lo / 60)} to ${Math.round(hi / 60)} minutes* more at the finish.`,
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
    headline: `Already ${last?.label.toLowerCase()} at ${section}: *${pct(last?.later ?? NaN)}* went on to a sustained slowdown. Faster than early pace: ${pct(first?.later ?? NaN)}.`,
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
    headline: s ? `No second wind: of finishes at sustained-slowdown pace over ${sectionName(s.source)}, *${pct(s.stay)}* stayed that slow over ${sectionName(s.target)}.` : '',
    fallback: s ? `Of finishes at sustained-slowdown pace over ${sectionName(s.source)}, ${pct(s.stay)} stayed that slow over ${sectionName(s.target)}.` : 'Sustained-slowdown pace, section to section.',
    figure: null,
  };
}

/** #magnet: the share that ran the last 2.2K faster than 35–40K, and how few with a sustained slowdown got back to their early pace. */
export function kickMagnetFrom(k: Pick<Kick['kick'], 'share' | 'slowdown_final_below_baseline'>): Nugget {
  const last = MARATHON_KM - 40;
  const ok = k.share > 0.5 && k.slowdown_final_below_baseline < 0.1;
  return {
    id: 'kick.magnet', page: '/stories/final-kick#magnet', denominator: 'kick',
    values: { share: k.share, back: k.slowdown_final_below_baseline }, guard: ok,
    headline: both((u) => `Even so, ${pct(k.share)} of finishes sped up over the last ${distance(last, u)}. Of those with a sustained slowdown, only *${pct(k.slowdown_final_below_baseline, 1)}* got back to their early pace.`),
    fallback: both((u) => `${pct(k.share)} of finishes sped up over the last ${distance(last, u)}; ${pct(k.slowdown_final_below_baseline, 1)} of those with a sustained slowdown got back to their early pace.`),
    figure: null,
  };
}

// ---------- Chapter 06 · The finish line (/stories/round-numbers) ----------

/** Chapter 06 lead: the busiest finishing minute (all finishes). The busiest is the argmax, so the guard is that it exists. */
export function finishBusiestFrom(histogram: FinishTimes['histogram']): Nugget {
  const peak = histogram.length ? histogram.reduce((a, b) => (b.all > a.all ? b : a)) : null;
  return {
    id: 'finish.busiest', page: '/stories/round-numbers', denominator: 'story',
    values: { minute: peak?.minute ?? NaN, n: peak?.all ?? NaN }, guard: !!peak && peak.all > 0,
    headline: peak ? `Every finish, minute by minute: the busiest was *${hm(peak.minute)}*, with ${count(peak.all)} finishes.` : '',
    fallback: 'Every finish, minute by minute.',
    figure: peak ? { value: hm(peak.minute), sr: spokenTime(peak.minute * 60) } : null, key: 'the busiest finishing minute',
  };
}

/** The round-numbers reading: the minute before the round mark that stands tallest against the smooth curve. */
export function roundTopFrom(marks: FinishTimes['marks']): Nugget {
  const top = marks.length ? marks.reduce((a, b) => (b.ratio > a.ratio ? b : a)) : null;
  if (!top) return { id: 'round.top', page: '/stories/round-numbers', denominator: 'story', values: {}, guard: false, headline: '', fallback: 'Finish times, minute by minute.', figure: null };
  const before = hm(top.minutes - 1);
  return {
    id: 'round.top', page: '/stories/round-numbers', denominator: 'story',
    values: { mark: top.mark, minutes: top.minutes, ratio: top.ratio, n: top.minute_before, expected: top.expected_minute_before }, guard: top.ratio > 1.1,
    headline: `Between ${before}:00 and ${before}:59, ${count(top.minute_before)} finishes landed: *${top.ratio.toFixed(2)} times* what a smooth curve expects.`,
    fallback: `Between ${before}:00 and ${before}:59, ${count(top.minute_before)} finishes landed.`,
    figure: { value: top.ratio.toFixed(2), unit: '×', sr: `${top.ratio.toFixed(2)} times` }, key: `the smooth curve, in the minute before ${top.mark}`,
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
    headline: 'The minute before every hour and half-hour stands above the curve. *Quarter-hours* mostly don’t.',
    fallback: 'The minute before each round mark, against the curve.',
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
    key: 'sustained slowdown, women · men, at the same finish times',
  };
}

/** #unmask: the second-20K gap between recorded women and men, pooled and matched on race and finish minute, as a ratio in words. */
export function holdsUnmaskFrom(o: Pick<Demographics['overall'], 'pooled_women_block' | 'pooled_men_block' | 'women_block' | 'men_block'>): Nugget {
  const pooled = o.pooled_men_block - o.pooled_women_block, matched = o.men_block - o.women_block;
  const r = pooled > 0 ? matched / pooled : NaN;
  return {
    id: 'holds.unmask', page: '/stories/who-holds-pace#unmask', denominator: 'demographics',
    values: { pooled_women: o.pooled_women_block, pooled_men: o.pooled_men_block, women: o.women_block, men: o.men_block, ratio: r },
    guard: pooled > 0 && matched > 0 && r >= 2,
    headline: `Compared within the same race and finish minute, the gap is *${countWord(Math.round(r))} times* as big.`,
    fallback: `Second 20K against the first, pooled: women ${signed(o.pooled_women_block)}%, men ${signed(o.pooled_men_block)}%. Same race and finish minute: ${signed(o.women_block)}% and ${signed(o.men_block)}%.`,
    figure: null,
  };
}

/** #ghost: in the finish band with the most matched finishes, how far ahead recorded men were at the mat of the widest gap. */
export function holdsGhostFrom(bands: Pick<Demographics['bands'][number], 'label' | 'matched_weight' | 'ghost_s'>[]): Nugget {
  const b = bands.length ? bands.reduce((a, c) => (c.matched_weight > a.matched_weight ? c : a)) : null;
  const gap = b ? Math.max(...b.ghost_s) : NaN;
  const k = b ? b.ghost_s.indexOf(gap) : -1;
  const mats = [5, 10, 15, 20, 25, 30, 35, 40, MARATHON_KM];
  const together = !!b && Math.abs(b.ghost_s[b.ghost_s.length - 1]) < 30;
  return {
    id: 'holds.ghost', page: '/stories/who-holds-pace#ghost', denominator: 'demographics',
    values: { band: b?.label ?? '', gap_s: gap, mat_km: mats[k] ?? NaN }, guard: together && gap >= 60,
    headline: b ? `Finishing in ${b.label}, recorded men reached ${matLabel(mats[k])} *${ms(gap)}* ahead of recorded women, and they finished together.` : '',
    fallback: b ? `Finishing in ${b.label}: recorded men and women, mat by mat.` : 'Recorded men and women, mat by mat.',
    figure: null,
  };
}

/** #bands: in how many finish bands men's finishes had more sustained slowdowns than women's. "Every" needs all of them. */
export function holdsBandsFrom(bands: Pick<Demographics['bands'][number], 'lo_min' | 'women_n' | 'men_n' | 'women_slowdown' | 'men_slowdown'>[]): Nugget {
  const rows = bands.filter((b) => b.women_n >= 100 && b.men_n >= 100);
  const more = rows.filter((b) => b.men_slowdown > b.women_slowdown).length;
  const width = rows.length > 1 ? rows[1].lo_min - rows[0].lo_min : 10;
  const from = rows[0]?.lo_min ?? NaN, to = (rows[rows.length - 1]?.lo_min ?? NaN) + width;
  return {
    id: 'holds.bands', page: '/stories/who-holds-pace#bands', denominator: 'demographics',
    values: { bands: rows.length, men_more: more, from_min: from, to_min: to }, guard: rows.length >= 2 && more === rows.length,
    headline: `From ${hm(from)} to ${hm(to)}, men’s finishes had more sustained slowdowns *at every finish time*.`,
    fallback: `Men’s finishes had more sustained slowdowns in ${count(more)} of ${count(rows.length)} finish-time bands.`,
    figure: null,
  };
}

// ---------- Chapter 08 · Where you run (/stories/courses) ----------

/** The courses reading: how often an edition's own pacing shape named its course, against chance. */
export function coursesNamedFrom(id: Pick<Courses['identification'], 'correct' | 'editions_tested' | 'chance' | 'courses'>): Nugget {
  const share = id.editions_tested > 0 ? id.correct / id.editions_tested : NaN;
  const k = id.chance > 0 ? Math.round(1 / id.chance) : NaN;
  return {
    id: 'courses.named', page: '/stories/courses', denominator: 'course',
    values: { correct: id.correct, tested: id.editions_tested, share, chance: id.chance, courses: id.courses }, guard: share > 2 * id.chance,
    headline: `From its pacing shape alone, an edition’s course was named correctly *${pct(share)}* of the time. By chance: 1 in ${k}.`,
    fallback: `From its pacing shape alone, an edition’s course was named correctly ${pct(share)} of the time.`,
    figure: shareFigure(share), key: 'of editions named from their pacing shape alone',
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
    headline: `On *${k} of ${shaped.length}* courses, the slowest 5K was ${sectionName(section)}.`,
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
    headline: both((u) => `In *${count(n)} of ${count(total)}* pairs of editions of the same course at least ${tempGap(gap, u)} apart at the start, the warmer one had more sustained slowdowns.`),
    fallback: both((u) => `${count(n)} of ${count(total)} same-course pairs at least ${tempGap(gap, u)} apart at the start: the warmer year had more sustained slowdowns.`),
    figure: Number.isFinite(n) ? { value: count(n), unit: `of ${count(total)}`, sr: `${count(n)} of ${count(total)}` } : null,
    key: 'same-course pairs: the warmer year had more sustained slowdowns',
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
    headline: both((u) => `Near ${temp(cool?.temp ?? NaN, u)}, each ${deg(u)} warmer went with ${per(cool?.slope ?? NaN, u)} min more at the finish. Near ${temp(warm?.temp ?? NaN, u)}, *${per(warm?.slope ?? NaN, u)} min*.`),
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
  'field.middle': fieldMiddle,
  'field.front': () => fieldFrontFrom(courses().years.eras),
  'field.byrace': () => fieldByRaceFrom(courses().courses),
  'replay.first': replayFirst,
  'replay.title': () => replayTitleFrom(replayFirst()),
  'replay.back': replayBack,
  'replay.spread': () => replaySpreadFrom(readInsight<ReplayIndex>('replay.json').stretch),
  'replay.packs': () => replayPacksFrom(readInsight<ReplayIndex>('replay.json').editions),
  'replay.left': replayLeft,
  'shape.second20k': shapeSecond20k,
  'types.metronome': () => typesMetronomeFrom(archetypes().archetypes),
  'types.river': () => typesRiverFrom(archetypes()),
  'types.gender': () => typesGenderFrom(archetypes()),
  'places.gap': () => placesGapFrom(positions().coin_flip),
  'places.coin': () => placesCoinFrom(positions().coin_flip),
  'places.breakeven': () => placesBreakevenFrom(positions().breakeven_crossing),
  'places.shuffle': () => placesShuffleFrom(positions()),
  'slowdown.onset': slowdownLate,
  'kick.twins': () => kickTwinsFrom(kick().cost.stratified),
  'kick.later': () => kickLaterFrom(kick().cost.stratified),
  'kick.bands': () => kickBandsFrom(kick().cost.bands),
  'kick.warning': () => kickWarningFrom(kick().warning),
  'kick.stay': () => kickStayFrom(kick().recovery.stay),
  'kick.magnet': () => kickMagnetFrom(kick().kick),
  'finish.busiest': () => finishBusiestFrom(finish().histogram),
  'round.top': () => roundTopFrom(finish().marks),
  'round.marks': () => roundMarksFrom(finish().marks),
  'round.rescue': () => roundRescueFrom(finish().bubble),
  'holds.gender': () => holdsGenderFrom(demographics().overall),
  'holds.unmask': () => holdsUnmaskFrom(demographics().overall),
  'holds.ghost': () => holdsGhostFrom(demographics().bands),
  'holds.bands': () => holdsBandsFrom(demographics().bands),
  'courses.named': () => coursesNamedFrom(courses().identification),
  'courses.slowest': () => coursesSlowestFrom(courses().courses),
  'courses.steady': () => coursesSteadyFrom(archetypes()),
  'weather.pairs': () => weatherPairsFrom(courses().weather?.pairs),
  'weather.curve': () => weatherCurveFrom(courses().weather.curvature.finish_min_per_c),
  'weather.tilt': () => weatherTiltFrom(courses().weather.heat_signature),
};
