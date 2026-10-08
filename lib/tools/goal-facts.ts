/**
 * Sentences for one goal page (/tools/marathon-pace/<goal>), built only from that goal's pace-band data, so each page
 * says something the others do not: how far the median recorded time sat from the calculated even-pace time at 20 and
 * 35 km, which 5 km section's median pace sat furthest from even pace, how the held-pace and sustained-slowdown medians
 * compare, and where the slowdowns began. Observed and descriptive only: no plan, no cause, no forecast.
 *
 * Every number comes from the arguments; the page passes the verified pace-band shard at build time. The gaps use the
 * whole-second even-pace times the page prints, so a sentence always agrees with the two tables beside it.
 */
import { MARATHON_KM, MATS_KM, perUnit } from '@/lib/tools/pace';
import { evenAt, goalLabel } from '@/lib/tools/pace-chart';
import { formatDuration } from '@/lib/tools/time';
import type { UnitSystem } from '@/lib/units';

/** The nine timing points: the eight 5 km mats and the finish. */
export const CHECKPOINTS_KM: readonly number[] = [...MATS_KM, MARATHON_KM];
const FINISH = CHECKPOINTS_KM.length - 1;
const I20 = CHECKPOINTS_KM.indexOf(20);
const I35 = CHECKPOINTS_KM.indexOf(35);

const count = (n: number) => Math.round(n).toLocaleString('en-US');
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** A length of time in words: "12 seconds", "1 second", or m:ss (h:mm:ss) from a minute up. */
export function span(seconds: number): string {
  const s = Math.round(Math.abs(seconds));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  return formatDuration(s);
}

/** Mats by name: "30 km", "20 km and 25 km", "35 km and the finish". */
function mats(indices: number[]): string {
  return list(indices.map((i) => (i === FINISH ? 'the finish' : `${CHECKPOINTS_KM[i]} km`)));
}

/** Sections by name (section i runs from point i − 1 to point i); contiguous sections merge: "between 5 and 15 km". */
export function sections(indices: number[]): string {
  const runs: [number, number][] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && i === last[1] + 1) last[1] = i;
    else runs.push([i, i]);
  }
  return list(runs.map(([a, b]) => {
    const from = a === 0 ? null : CHECKPOINTS_KM[a - 1];
    const to = b === FINISH ? null : CHECKPOINTS_KM[b];
    if (from === null) return `between the start and ${to} km`;
    if (to === null) return `between ${from} km and the finish`;
    return `between ${from} and ${to} km`;
  }));
}

/** Indices whose value equals the extreme of `values` over `indices` (ties kept). */
function extreme(values: number[], indices: number[], pick: (a: number, b: number) => boolean): number[] {
  let best: number[] = [];
  for (const i of indices) {
    if (!best.length || pick(values[i], values[best[0]])) best = [i];
    else if (values[i] === values[best[0]]) best.push(i);
  }
  return best;
}

/** Signed gap in whole seconds between two elapsed times; negative means `a` was ahead (earlier). */
const ahead = (gap: number, at = ' of') => (gap < 0 ? `${span(gap)} ahead${at}` : gap > 0 ? `${span(gap)} behind` : at ? 'level with' : 'level');

/**
 * The median recorded time against the even-pace time for the goal at 20 and 35 km, the mat where the two were furthest
 * apart, and how far under the goal the median finish was. Null when the data has no 20 or 35 km value.
 */
export function evenPaceGapText(goalMinutes: number, e50: number[]): string | null {
  if (e50.length !== CHECKPOINTS_KM.length || I20 < 0 || I35 < 0) return null;
  const goal = goalMinutes * 60;
  const gaps = CHECKPOINTS_KM.map((km, i) => e50[i] - Math.round(evenAt(goal, MARATHON_KM, km)));
  const g20 = gaps[I20];
  const g35 = gaps[I35];
  let change = '';
  if (g20 !== 0 && Math.sign(g20) === Math.sign(g35)) {
    const d = Math.abs(g35) - Math.abs(g20);
    change = d < 0 ? `, so the gap narrowed by ${span(d)} between the two mats` : d > 0 ? `, so the gap widened by ${span(d)} between the two mats` : ', the same gap as at 20 km';
  }
  const first = `At 20 km the median recorded time was ${ahead(g20)} the calculated even-pace time for ${goalLabel(goalMinutes)}; at 35 km it was ${ahead(g35, '')}${change}.`;
  const matIdx = CHECKPOINTS_KM.map((_, i) => i).filter((i) => i !== FINISH);
  const abs = gaps.map(Math.abs);
  const widest = extreme(abs, matIdx, (a, b) => a > b);
  const finish = goal - e50[FINISH];
  const finishText = finish > 0 ? `${span(finish)} under the goal` : finish < 0 ? `${span(finish)} over the goal` : 'exactly on the goal';
  if (!abs[widest[0]]) return `${first} The median finish was ${finishText}.`;
  const sides = [-1, 1].map((sign) => widest.filter((i) => Math.sign(gaps[i]) === sign)).filter((ix) => ix.length);
  const where = sides.map((ix) => `${mats(ix)} (${ahead(gaps[ix[0]], '')})`).join(' and at ');
  return `${first} The gap was widest at ${where}, and the median finish was ${finishText}.`;
}

/**
 * The 5 km section whose median pace sat furthest from even pace, in the visitor's units, and the furthest section on
 * the other side. Section paces are the published medians of each section's pace, not differences of the mat medians.
 */
export function sectionPaceText(goalMinutes: number, s50: number[], units: UnitSystem): string | null {
  if (s50.length !== CHECKPOINTS_KM.length) return null;
  const even = (goalMinutes * 60) / MARATHON_KM;
  const unitWord = units === 'mi' ? 'mile' : 'km';
  const idx = s50.map((_, i) => i);
  const fast = extreme(s50, idx, (a, b) => a < b).filter((i) => s50[i] < even);
  const slow = extreme(s50, idx, (a, b) => a > b).filter((i) => s50[i] > even);
  const amount = (i: number) => {
    const per = Math.round(Math.abs(perUnit(s50[i] - even, units)));
    return `${per < 60 ? `${per} second${per === 1 ? '' : 's'}` : formatDuration(per)} per ${unitWord} ${s50[i] < even ? 'faster' : 'slower'}`;
  };
  const sides = [fast, slow].filter((ix) => ix.length);
  if (!sides.length) return 'Section by section, the median pace matched even pace to the second.';
  sides.sort((a, b) => Math.abs(s50[b[0]] - even) - Math.abs(s50[a[0]] - even));
  const [main, other] = sides;
  const head = `Section by section, the median pace was furthest from even pace ${sections(main)}, ${amount(main[0])}`;
  if (!other) return `${head}; every section’s median was ${s50[main[0]] < even ? 'faster' : 'slower'} than even pace.`;
  return `${head}; on the ${s50[other[0]] < even ? 'fast' : 'slow'} side it was furthest ${sections(other)}, ${amount(other[0])}.`;
}

/** The sustained-slowdown median against the held-pace median: at 20 km, where they were furthest apart, and at the finish. */
export function groupGapText(held: number[], slow: number[]): string | null {
  if (held.length !== CHECKPOINTS_KM.length || slow.length !== CHECKPOINTS_KM.length || I20 < 0) return null;
  const diff = slow.map((t, i) => t - held[i]);
  const abs = diff.map(Math.abs);
  const widest = extreme(abs, CHECKPOINTS_KM.map((_, i) => i).filter((i) => i !== FINISH), (a, b) => a > b);
  const d20 = diff[I20];
  const at20 = `At 20 km the median time of the finishes with a sustained slowdown was ${ahead(d20)} the median of those that held pace`;
  const apart = abs[widest[0]] ? (widest.length === 1 && widest[0] === I20 ? ', their widest gap at any mat' : `; the two medians were furthest apart at ${mats(widest)} (${span(abs[widest[0]])})`) : '';
  const f = diff[FINISH];
  const end = f < 0 ? `the slowdown group’s median was ${span(f)} faster` : f > 0 ? `the slowdown group’s median was ${span(f)} slower` : 'the two medians were level';
  return `${at20}${apart}, and at the finish ${end}.`;
}

/** Where the sustained slowdowns began: the most common onset section, with its count and observed share. */
export function onsetText(onset: number[], onsetKm: number[]): string | null {
  if (!onset.length || onset.length !== onsetKm.length) return null;
  const total = onset.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const top = extreme(onset, onset.map((_, i) => i), (a, b) => a > b);
  const names = list(top.map((i) => `${onsetKm[i]} to ${onsetKm[i] + 5} km`));
  const share = `${((onset[top[0]] / total) * 100).toFixed(1)}%`;
  if (top.length > 1) return `The sustained slowdown most often began in the ${names} sections: ${count(onset[top[0]])} of the ${count(total)} finishes with one in each (${share} each).`;
  return `The sustained slowdown most often began in the ${names} section: ${count(onset[top[0]])} of the ${count(total)} finishes with one (${share}).`;
}

/** "all 179 race editions" or "177 of the 179 race editions". */
export function editionsText(editions: number, total: number | null): string {
  if (total === null || !(total >= editions)) return `${count(editions)} race editions`;
  return editions === total ? `all ${count(total)} race editions` : `${count(editions)} of the ${count(total)} race editions`;
}

/** One goal page's window, for comparing a page with the other goal pages. */
export interface GoalPeer { goal: number; n: number; sd: number | null }

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const NUMBER = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n: number) => NUMBER[n] ?? count(n);

/**
 * Where a value sits among a few others, counted from the nearer end: "the most", "the second most", "the third most",
 * "the second fewest", "the fewest" for five values ("joint" when tied). Null when it cannot be ranked.
 */
export function rankAmong(value: number, values: number[], high: string, low: string): string | null {
  if (values.length < 3 || values.length >= ORDINAL.length || !values.includes(value)) return null;
  const above = values.filter((v) => v > value).length;
  const below = values.filter((v) => v < value).length;
  const joint = values.length - above - below > 1 ? 'joint ' : '';
  if (above <= below) return above === 0 ? `the ${joint}${high}` : `the ${joint}${ORDINAL[above + 1]} ${high}`;
  return below === 0 ? `the ${joint}${low}` : `the ${joint}${ORDINAL[below + 1]} ${low}`;
}

/** "This goal's window holds the second fewest finishes of the five goal pages." */
export function windowRankText(goalMinutes: number, peers: GoalPeer[]): string | null {
  const me = peers.find((p) => p.goal === goalMinutes);
  const rank = me ? rankAmong(me.n, peers.map((p) => p.n), 'most', 'fewest') : null;
  return rank ? `This goal’s window holds ${rank} finishes of the ${numberWord(peers.length)} goal pages.` : null;
}

/** This goal's sustained-slowdown share among the goal pages, with the lowest and highest shares and their goals. */
export function slowdownRankText(goalMinutes: number, peers: GoalPeer[]): string | null {
  const shares = peers.filter((p): p is GoalPeer & { sd: number } => p.sd !== null);
  const me = shares.find((p) => p.goal === goalMinutes);
  if (!me || shares.length !== peers.length) return null;
  const rank = rankAmong(me.sd, shares.map((p) => p.sd), 'highest', 'lowest');
  if (!rank) return null;
  const sorted = [...shares].sort((a, b) => a.sd - b.sd || a.goal - b.goal);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const share = (v: number) => `${(v * 100).toFixed(1)}%`;
  return `Of the ${numberWord(peers.length)} goal pages, that share is ${rank}; it runs from ${share(lo.sd)} at ${goalLabel(lo.goal)} to ${share(hi.sd)} at ${goalLabel(hi.goal)}.`;
}
