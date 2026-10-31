/**
 * Nuggets for the half-marathon pages (spec 3.7): /half (half finishes in verified results, denominator `half`) and
 * /stories/half-to-full (pairs of half and marathon records linked by name, denominator `linked`). One surface uses
 * one family; where a /half sentence quotes the marathon it says so ("In the marathon, …").
 *
 * Every value is read from the verified half files (lib/half-server.ts) and every example is picked by the data: the
 * flagship's half is the 5-minute band nearest the pooled median half (1:45), its mark the readout mark of that window
 * (4:00). Each builder has a pure `…From(data)` twin, so scripts/nuggets/half.cjs recounts it from the published JSON
 * and proves its fallback on a fixture. Fallbacks never assert a direction. The deks with numbers are built here too
 * (`halfDeks`), so a page types no number.
 */
import type { HalfField, HalfLinked, HalfWindow, HalfWomen } from '@/lib/half-types';
import { readHalf } from '@/lib/half-server';
import { floorHM, readoutMark, windowOverDouble } from '@/lib/tools/half-to-full';
import { count, inWords, pct, ratio, spokenPct, spokenTime } from './format';
import { shareFigure, type Builder } from './build';
import type { Nugget } from './types';

const MIN_CELL = 100;
const MIN_EDITIONS = 3;
const between = (v: number, lo: number, hi: number) => Number.isFinite(v) && v > lo && v < hi;
const clock = (seconds: number) => floorHM(seconds);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/** The share of all verified finishes under `s` seconds, and the recorded women's and men's. */
function underAt(field: HalfField, s: number) {
  return field.under.find((u) => u.s === s) ?? { s, all: NaN, F: NaN, M: NaN };
}

// ---------- /half: half finishes in verified results ----------

/** /half reading: just over half of half finishes came in under 2:00 (verified, and the same in every usable result). */
export function halfFieldFrom(field: HalfField): Nugget {
  const u = underAt(field, 7200);
  const all = field.checks.all_usable.under_7200;
  const floors = field.cohort.finishes >= MIN_CELL && field.cohort.editions >= MIN_EDITIONS;
  const guard = floors && between(all, 0.5, 0.6) && Number.isFinite(u.all);
  const headline = between(u.all, 0.5, 0.6)
    ? 'Just over half of half marathon finishes came in under *2:00*.'
    : `*${pct(u.all)}* of half marathon finishes came in under 2:00.`;
  const p50 = field.quantiles.all.p50;
  return {
    id: 'half.field', page: '/half', denominator: 'half',
    values: { under_7200: u.all, women_under_7200: u.F, men_under_7200: u.M, all_usable_under_7200: all, finishes: field.cohort.finishes,
      editions: field.cohort.editions, median_s: p50, women_median_s: field.quantiles.F.p50, men_median_s: field.quantiles.M.p50 },
    guard,
    headline: guard ? headline : '',
    fallback: 'Half marathon finishes by finish time.',
    figure: Number.isFinite(p50) ? { value: clock(p50), sr: spokenTime(Math.floor(p50 / 60) * 60) } : null,
    key: 'median half finish',
  };
}

/** /half beat 1: 1 in 4 half finishes came in under 1:45 (and the editions-equal share within 3 points). */
export function halfUnderFrom(field: HalfField): Nugget {
  const u = underAt(field, 6300);
  const eq = field.checks.editions_equal.under_6300;
  const guard = field.cohort.finishes >= MIN_CELL && field.cohort.editions >= MIN_EDITIONS && Number.isFinite(u.all) && Math.abs(u.all - eq) <= 0.03;
  const words = inWords(u.all);
  return {
    id: 'half.under', page: '/half#your-time', denominator: 'half',
    values: { under_6300: u.all, women_under_6300: u.F, men_under_6300: u.M, editions_equal_under_6300: eq },
    guard,
    headline: words === '1 in 4' ? '*1 in 4* half finishes came in under 1:45.' : `*${pct(u.all)}* of half finishes came in under 1:45.`,
    fallback: 'Half finishes under 1:45.',
    figure: null,
  };
}

/** /half beat 2: the minute before 2:00 held 1.2× the finishes a smooth curve expects (the goal pages' wording). */
export function halfCrowdFrom(field: HalfField): Nugget {
  const m = field.marks.find((x) => x.minutes === 120);
  const guard = !!m && m.ratio >= 1.15 && m.ratio_ci95[0] > 1 && m.minute_before >= MIN_CELL;
  return {
    id: 'half.crowd', page: '/half#crowd', denominator: 'half',
    values: { ratio: m?.ratio ?? NaN, ratio_lo: m?.ratio_ci95[0] ?? NaN, ratio_hi: m?.ratio_ci95[1] ?? NaN,
      minute_before: m?.minute_before ?? NaN, expected_minute_before: m?.expected_minute_before ?? NaN },
    guard,
    headline: m ? `The minute before 2:00 held *${ratio(m.ratio, 1)}* the finishes a smooth curve expects.` : '',
    fallback: 'Finishes in the minute before each round time.',
    figure: null,
  };
}

/** Whether women.json publishes the band medians: at least `min_band_editions` (20) editions qualify (analysis/half_women.py). */
export const womenBandsPublished = (women: HalfWomen) => women.band_editions.length >= women.min_band_editions && women.median_share.length === women.bands.length;

/** /half beat 3: from the band where every median share passes one half (2:15), most half finishes were women's. */
export function halfWomenFrom(women: HalfWomen): Nugget {
  const shares = women.median_share;
  const j = women.bands.findIndex((b) => b.lo_s === women.cross_s);
  const guard = womenBandsPublished(women) && women.cross_s !== null && j > 0 && shares[j - 1] <= 0.5 && shares.slice(j).every((s) => s > 0.5) && women.band_editions.length >= 20;
  return {
    id: 'half.women', page: '/half#women', denominator: 'half',
    values: { cross_s: women.cross_s ?? NaN, editions: women.band_editions.length, before_cross: j > 0 ? shares[j - 1] : NaN,
      at_cross: j >= 0 ? shares[j] : NaN, under_90: shares[0], marathon_cross_s: women.marathon.cross_s },
    guard,
    headline: guard ? `From *${clock(women.cross_s!)}* on, most half finishes were women’s.` : '',
    fallback: 'Women’s share of half finishes, by finish time.',
    figure: null,
  };
}

/** /half beat 4: in every same-city, same-year pair, the half had a larger share of women's finishes. */
export function halfCitiesFrom(women: HalfWomen): Nugget {
  const s = women.same_city.summary, all = women.same_city.all_scope_check;
  const guard = s.half_higher === s.pairs && s.pairs >= 10 && s.cities >= 5 && all.half_higher === all.pairs;
  return {
    id: 'half.cities', page: '/half#two-distances', denominator: 'half',
    values: { pairs: s.pairs, cities: s.cities, half_higher: s.half_higher, half_median: s.half_median, marathon_median: s.marathon_median,
      diff_median_points: s.diff_median_points, all_pairs: all.pairs, all_half_higher: all.half_higher },
    guard,
    headline: 'In the same city and year, the half always had *more women*.',
    fallback: 'Women’s share of half and marathon finishes, same city and year.',
    figure: null,
  };
}

// ---------- /stories/half-to-full: records linked by name ----------

const members = (linked: HalfLinked) => Object.fromEntries(linked.checks.battery.members.map((m) => [m.id, m]));

/**
 * The flagship H1's guard (spec 3.2; analysis/half_linked.py flagship_guard): enough pairs and marathon editions; the
 * pooled minutes over double between 10 and 60; every battery member's multiple within [2.15, 2.25] and, re-expressed
 * at the pooled median half, within 3 minutes of the pooled minutes; the verified-halves and one-pair-per-person minutes
 * within 3 minutes of it; every member's under-double share under 15%.
 */
export function flagshipGuard(linked: HalfLinked): boolean {
  const b = linked.checks.battery, m = members(linked), pooled = m.pooled;
  if (!pooled || !m.verified_halves || !m.one_per_person) return false;
  const extra = pooled.extra_p50_s, half = b.pooled_half_p50_s, all = Object.values(m);
  return linked.set.pairs >= MIN_CELL && linked.set.marathon_editions >= MIN_EDITIONS && extra >= 600 && extra <= 3600
    && all.every((x) => x.multiple_p50 >= 2.15 && x.multiple_p50 <= 2.25)
    && all.every((x) => Math.abs((x.multiple_p50 - 2) * half - extra) <= 180)
    && Math.abs(extra - m.verified_halves.extra_p50_s) <= 180 && Math.abs(extra - m.one_per_person.extra_p50_s) <= 180
    && all.every((x) => x.under_double < 0.15);
}

/** The neutral key of the flagship's figure while it states no reading: what the count counts. */
export const HALF_PAIRS_KEY = 'pairs of a half and the marathon after it';

/**
 * Story H1 (chapter 11's lead): after a half, the typical marathon took double it plus 21 minutes; figure 8%.
 *
 * The figure, which the chapter 11 row, the next cards and the /half night card repeat, states a reading only under a
 * guard of its own: the share under double while its check holds (spec 3.2), else the minutes over double while the H1's
 * guard holds (the spec's fallback, the H1's own reading), else the count of pairs, which states none. Since the stamp
 * correction (October 30, 2026) both checks fail on the verified-halves member (+16.3 minutes and 14.0% under double,
 * against +20.9 and 7.7% pooled), so the story and every place that repeats its figure show the 23,929 pairs: the minutes
 * the H1's guard rejected never stand in its place (review, October 30, 2026).
 */
export function halfExtraFrom(linked: HalfLinked): Nugget {
  const m = members(linked), pooled = m.pooled;
  const extra = linked.overall.extra_s.p50;
  const minutes = Math.round(extra / 60);
  const under = linked.overall.under_double_plus_min['0'];
  const pairs = linked.set.pairs;
  const guard = flagshipGuard(linked) && pooled?.extra_p50_s === extra;
  const figureOk = !!pooled && Object.values(m).every((x) => x.under_double < 0.15) && !!m.verified_halves && Math.abs(under - m.verified_halves.under_double) <= 0.03;
  const asMinutes = !figureOk && guard;
  const figure = figureOk ? shareFigure(under)
    : asMinutes ? { value: `+${minutes}`, unit: '\u00a0min', sr: `plus ${minutes} minutes` }
      // Always drawn with its key ("pairs of a half and …"), so the spoken figure is the number alone.
      : { value: count(pairs), sr: count(pairs) };
  return {
    id: 'half.extra', page: '/stories/half-to-full', denominator: 'linked',
    values: { extra_s: extra, extra_min: minutes, under_double: under, pairs, marathon_editions: linked.set.marathon_editions,
      multiple_p50: linked.overall.ratio_p50, pooled_half_s: linked.checks.battery.pooled_half_p50_s, figure_is_share: figureOk ? 1 : 0,
      figure_is_minutes: asMinutes ? 1 : 0 },
    guard,
    headline: `After a half, the typical marathon took double it plus *${minutes} minutes*.`,
    fallback: 'The marathon after a half, against double the half.',
    figure,
    key: figureOk ? 'of marathons came in under double the half marathon before them' : asMinutes ? 'over double the half marathon, typical' : HALF_PAIRS_KEY,
  };
}

/** The flagship's half (the 5-minute band nearest the pooled median half) and its window for a group, or null. */
export function flagshipWindow(linked: HalfLinked, group: 'all' | 'F' | 'M' = 'all'): HalfWindow | null {
  const h = Math.round(linked.checks.battery.pooled_half_p50_s / 300) * 300;
  return linked.windows[group].find((w) => w.h === h) ?? null;
}

/** Story beat 1: after a 1:45 half, 67% of marathons came in under 4:00 (and the verified-only and editions-equal checks agree). */
export function halfRangeFrom(linked: HalfLinked): Nugget {
  const w = flagshipWindow(linked);
  const mark = w ? readoutMark(w) : null;
  const share = mark ? mark[1] : NaN;
  const c = linked.checks;
  // The builder's checks are at the 1:45 window and the 4:00 mark: the reading must be at the same place.
  const checked = !!w && !!mark && w.h === 6300 && mark[0] === 14400;
  const guard = checked && w!.n >= MIN_CELL && w!.e >= MIN_EDITIONS && Math.abs(share - c.verified.w105_under_14400) <= 0.05
    && Math.abs(share - c.editions_equal.w105_under_14400) <= 0.05 && between(share, 0.5, 0.9);
  return {
    id: 'half.range', page: '/stories/half-to-full#after', denominator: 'linked',
    values: { h: w?.h ?? NaN, mark_s: mark?.[0] ?? NaN, share, n: w?.n ?? NaN, e: w?.e ?? NaN, median_s: w?.q[9] ?? NaN,
      verified_share: c.verified.w105_under_14400, editions_equal_share: c.editions_equal.w105_under_14400 },
    guard,
    headline: w && mark ? `After a ${clock(w.h)} half, *${pct(share)}* of marathons came in under ${clock(mark[0])}.` : '',
    fallback: 'Marathons after a half, half time by half time.',
    figure: null,
  };
}

/** Story beat 2: after the same half, recorded women's marathons had far fewer sustained slowdowns (within strata). */
export function halfSexesFrom(linked: HalfLinked): Nugget {
  const s = linked.sexes, v = linked.checks.verified.sexes;
  const guard = s.strata >= 20 && s.women_lower >= 0.9 * s.strata && s.diff_points >= 10 && v.women_lower >= 0.9 * v.strata;
  return {
    id: 'half.sexes', page: '/stories/half-to-full#women-men', denominator: 'linked',
    values: { strata: s.strata, women_lower: s.women_lower, women_std: s.women_std, men_std: s.men_std, diff_points: s.diff_points,
      verified_strata: v.strata, verified_women_lower: v.women_lower },
    guard,
    headline: 'After the same half, recorded women’s marathons had *far fewer* sustained slowdowns.',
    fallback: 'Sustained slowdowns in recorded women’s and men’s marathons after the same half.',
    figure: null,
    term: '/methodology#sustained-slowdown',
  };
}

/** The guess's answer: about 1 in 10 recorded women's marathons after the flagship's half had a sustained slowdown. */
export function halfSexesGuessFrom(linked: HalfLinked): Nugget {
  const f = flagshipWindow(linked, 'F'), m = flagshipWindow(linked, 'M');
  const guard = !!f && !!m && f.n >= MIN_CELL && m.n >= MIN_CELL;
  const words = f ? inWords(f.sus) : '';
  return {
    id: 'half.sexesGuess', page: '/stories/half-to-full#women-men', denominator: 'linked',
    values: { h: f?.h ?? NaN, women_share: f?.sus ?? NaN, men_share: m?.sus ?? NaN, women_n: f?.n ?? NaN, men_n: m?.n ?? NaN,
      women_slowdowns: f ? Math.round(f.sus * f.n) : NaN, men_slowdowns: m ? Math.round(m.sus * m.n) : NaN,
      men_of_100: m ? Math.round(m.sus * 100) : NaN },
    guard,
    headline: f ? (/^1 in /.test(words) ? `About *${words}* did.` : `*${pct(f.sus)}* did.`) : '',
    fallback: 'Recorded women’s and men’s marathons after the same half.',
    figure: f ? { value: pct(f.sus).replace('%', ''), unit: '%', sr: spokenPct(f.sus) } : null,
  };
}

// ---------- The deks with numbers (pages print these, never their own figures) ----------

export type HalfDeks = {
  /** /half reading's unit line: "the median half finish; recorded women’s 2:08, men’s 1:52". */
  fieldUnit: string;
  /**
   * /half beat 1's dek, how to use the needle: "Slide from 1:15 to 3:00, 5 minutes at a time." The needle stops on the
   * published marks only, so the dek names their step ("Slide to any time" promised a 1:52 the needle cannot reach;
   * review, October 30, 2026).
   */
  slide: string;
  /** /half beat 1 with the shares: "Recorded women’s: 9%. Men’s: 35%. Slide from 1:15 to 3:00, 5 minutes at a time." */
  under: string;
  /**
   * /half beat 2: the minute before 2:00 in finishes against the curve, and, while it holds the most finishes over the
   * curve of the five, that it does, so the beat says why 2:00 is its subject ("16,949 finishes came in at 1:59, where
   * the smooth curve expects about 14,000: the most extra finishes before any round time."); then, while its
   * guard holds, the other marks. Where 1:30's column stands taller than 2:00's the dek says so with both decimals, as
   * the columns print them ("The minute before 1:30 stood a little taller against its curve, 1.24×; …"), else "held
   * 1.2× too" (review, October 30, 2026: since the stamp correction 1:30 is the taller column, unexplained). Null
   * without a 2:00 mark.
   */
  crowd: string | null;
  /** The marks beat 2's dek names besides 2:00, in minutes ([90] while its guard holds): the chart draws them a step up. */
  crowdNamed: number[];
  /**
   * /half beat 3, while its heading holds: "Under 1:30, 7% were. In the marathon, women’s finishes are the majority only
   * from 5:15." Under the plain heading (half.women fails) the comparison with the marathon is a direction the heading
   * withdrew, so the dek is null; so it is while women.json publishes no band medians (fewer than 20 editions).
   */
  women: string | null;
  /**
   * /half beat 4, while its heading holds: "Women’s share of finishes was typically 38% in the half and 24% in the
   * marathon." Two medians across the pairs, worded as two (no one city and year has that pair; the typical gap within a
   * pair is the methodology's). Null under the plain heading (half.cities fails): two medians side by side state the
   * direction the heading withdrew (review, October 30, 2026).
   */
  cities: string | null;
  /**
   * Story beat 1, the spec's dek: the typical marathon after the flagship's half, then how to use the needle ("The
   * typical one took 3:54. Slide from a 1:10 half to a 2:45 half, 5 minutes at a time."): the sentence a runner of that
   * half wants first. Under the plain heading (half.range fails) "the typical one" names no half, so the dek is how to
   * use the needle alone. The needle stops on the 5-minute windows only, so the dek names the step.
   */
  range: string | null;
  /**
   * The story's hero dek, under any H1: what the page pairs and for whom, then where to look, as a sentence that states
   * no reading ("Each half here is paired with the marathon 3 to 16 weeks after it, for records linked by name. Find
   * your half below."). The weeks are set B's window. Under the plain H1 the old verbless dek, written to qualify the
   * reading H1, told a first-time reader nothing (review, October 30, 2026).
   */
  hero: string;
  /**
   * The story's reading, under the ruler: the minutes over double 15 minutes quicker than the flagship's half, then the
   * span of the 5-minute windows from 15 minutes slower on ("Fewer minutes over double after a quicker half: +17 after
   * a 1:30 half, +23 to +30 from 2:00 to 2:45."), so the H1's 21 reads as a typical value that moves with
   * the half, next to the H1 it explains, and says where it stops rising (round 4 review, October 30, 2026: "more after
   * a slower one" promised a rise the windows from 2:00 to 2:45 do not show). Each value is the readout's own
   * (windowOverDouble), so the needle finds it there. The span is stated only while it stays within 4 minutes of its first window's value and
   * above the quicker half's; otherwise the two halves alone ("+17 after a 1:30 half, +27 after a 2:00."), and null
   * when the quicker half's is not the lower.
   */
  scale: string | null;
  /** The guess: "After a 1:45 half, 30 of 100 recorded men’s marathons had a sustained slowdown. How many of 100 recorded women’s?" */
  guess: string | null;
  /**
   * After the guess's reveal: the same comparison 15 minutes either side ("After a 1:30 half: 7% of recorded women’s,
   * against 17% of men’s. After a 2:00 half: 22% against 44%."), only while recorded women's share is the lower at both.
   * Null otherwise.
   */
  guessMore: string | null;
};

export function halfDeksFrom(field: HalfField, women: HalfWomen, linked: HalfLinked): HalfDeks {
  const u = underAt(field, 6300);
  const marks = Object.fromEntries(field.marks.map((m) => [m.minutes, m]));
  const others = [105, 135, 150].map((k) => marks[k]?.ratio ?? NaN);
  const crowdOk = !!marks[90] && marks[90].ratio_ci95[0] > 1.1 && others.every((r) => r < 1.1);
  const two = marks[120];
  const s = women.same_city.summary;
  const w = flagshipWindow(linked), f = flagshipWindow(linked, 'F'), m = flagshipWindow(linked, 'M');
  const all = linked.windows.all;
  const first = field.under[0].s, last = field.under[field.under.length - 1].s;
  // The halves 15 minutes either side of the flagship's (1:30 and 2:00), in each group.
  const at = (group: 'all' | 'F' | 'M', h: number) => linked.windows[group].find((x) => x.h === h) ?? null;
  const side = w ? [w.h - 900, w.h + 900] : [];
  const [qa, qb] = side.map((h) => at('all', h));
  const minutesOver = (x: HalfWindow) => windowOverDouble(x);
  // The 5-minute windows from the slower half on, the readout's scrub points, and their span.
  const slower = qb ? all.filter((x) => x.h % 300 === 0 && x.h >= qb.h) : [];
  const after = slower.map(minutesOver);
  const spanLo = Math.min(...after), spanHi = Math.max(...after);
  const level = !!qb && after.length >= 3 && after.every((x) => Math.abs(x - minutesOver(qb)) <= 4) && !!qa && minutesOver(qa) < spanLo;
  // The needle's stops: the story's 5-minute windows (the scrubber's points), /half's published marks.
  const stops = all.filter((x) => x.h % 300 === 0);
  const slide = stops.length ? `Slide from a ${clock(stops[0].h)} half to a ${clock(stops[stops.length - 1].h)} half, 5 minutes at a time.` : '';
  const step = field.under.length > 1 ? (field.under[1].s - field.under[0].s) / 60 : NaN;
  const fieldSlide = `Slide from ${clock(first)} to ${clock(last)}, ${step} minutes at a time.`;
  const pairs = side.map((h) => [at('F', h), at('M', h)] as const);
  const lower = pairs.length === 2 && pairs.every(([pf, pm]) => !!pf && !!pm && pf.sus < pm.sus);
  // Beat 2: whether 2:00 holds the most finishes over the curve of the five marks, and whether 1:30's column, as the
  // chart prints it, stands taller than 2:00's.
  const excess = (m: HalfField['marks'][number]) => m.minute_before - m.expected_minute_before;
  const most = !!two && field.marks.every((m) => m === two || excess(m) < excess(two));
  const taller = !!two && !!marks[90] && Number(marks[90].ratio.toFixed(2)) > Number(two.ratio.toFixed(2));
  const [fromWeeks, toWeeks] = linked.set.window_days.map((d) => d / 7);
  const span = Number.isInteger(fromWeeks) && Number.isInteger(toWeeks) ? `${fromWeeks} to ${toWeeks} weeks` : `${linked.set.window_days[0]} to ${linked.set.window_days[1]} days`;
  return {
    fieldUnit: `the median half finish; recorded women’s ${clock(field.quantiles.F.p50)}, men’s ${clock(field.quantiles.M.p50)}`,
    slide: fieldSlide,
    under: `Recorded women’s: ${pct(u.F)}. Men’s: ${pct(u.M)}. ${fieldSlide}`,
    crowd: two ? `${count(two.minute_before)} finishes came in at ${clock(two.minutes * 60 - 60)}, where the smooth curve expects about ${count(Math.round(two.expected_minute_before / 100) * 100)}${most ? ': the most extra finishes before any round time' : ''}.${crowdOk
      ? (taller
        ? ` The minute before 1:30 stood a little taller against its curve, ${ratio(marks[90].ratio, 2)}; before 1:45, 2:15 and 2:30, about ${ratio(median(others), 2)}.`
        : ` The minute before 1:30 held ${ratio(marks[90].ratio, 1)} too; before 1:45, 2:15 and 2:30, about ${ratio(median(others), 2)}.`)
      : ''}` : null,
    crowdNamed: crowdOk ? [90] : [],
    women: halfWomenFrom(women).guard ? `Under 1:30, ${pct(women.median_share[0])} were. In the marathon, women’s finishes are the majority only from ${clock(women.marathon.cross_s)}.` : null,
    cities: halfCitiesFrom(women).guard ? `Women’s share of finishes was typically ${pct(s.half_median)} in the half and ${pct(s.marathon_median)} in the marathon.` : null,
    range: w && slide ? (halfRangeFrom(linked).guard ? `The typical one took ${clock(w.q[9])}. ${slide}` : slide) : null,
    hero: `Each half here is paired with the marathon ${span} after it, for records linked by name. Find your half below.`,
    scale: qa && qb && minutesOver(qa) < minutesOver(qb)
      ? `Fewer minutes over double after a quicker half: +${minutesOver(qa)} after a ${clock(qa.h)} half, ${level
        ? `${spanLo === spanHi ? `+${spanLo}` : `+${spanLo} to +${spanHi}`} from ${clock(qb.h)} to\u00a0${clock(slower[slower.length - 1].h)}`
        : `+${minutesOver(qb)} after a ${clock(qb.h)}`}.`
      : null,
    guess: f && m ? `After a ${clock(m.h)} half, ${Math.round(m.sus * 100)} of 100 recorded men’s marathons had a sustained slowdown. How many of 100 recorded women’s?` : null,
    guessMore: f && m && lower ? pairs.map(([pf, pm], k) => (k === 0
      ? `After a ${clock(pf!.h)} half: ${pct(pf!.sus)} of recorded women’s, against ${pct(pm!.sus)} of men’s.`
      : `After a ${clock(pf!.h)} half: ${pct(pf!.sus)} against ${pct(pm!.sus)}.`)).join(' ') : null,
  };
}

/** The deks from the verified files. */
export function halfDeks(): HalfDeks {
  return halfDeksFrom(readHalf('field.json'), readHalf('women.json'), readHalf('linked.json'));
}

export const HALF_NUGGETS: Record<string, Builder> = {
  'half.field': () => halfFieldFrom(readHalf('field.json')),
  'half.under': () => halfUnderFrom(readHalf('field.json')),
  'half.crowd': () => halfCrowdFrom(readHalf('field.json')),
  'half.women': () => halfWomenFrom(readHalf('women.json')),
  'half.cities': () => halfCitiesFrom(readHalf('women.json')),
  'half.extra': () => halfExtraFrom(readHalf('linked.json')),
  'half.range': () => halfRangeFrom(readHalf('linked.json')),
  'half.sexes': () => halfSexesFrom(readHalf('linked.json')),
  'half.sexesGuess': () => halfSexesGuessFrom(readHalf('linked.json')),
};
