/**
 * The runner pages' nugget (WP6; the redesign spec, sections 2.2 and 5). /runners' reading is the one its dek states:
 * how often a finish had a sustained slowdown (the study's rate over every eligible finish), said as the dek says it
 * ("about 3 in 10"), so the card into the page promises the number it opens on and a runner knows what a search will
 * tell them about their race. Its sentence counts the mats from the runner manifest's checkpoints rather than typing
 * them. /report has no reading of its own. Server only; scripts/nuggets/runners.cjs recounts it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MARATHON_KM, matLabel } from '@/lib/units';
import { approxWords, countWord, pct, spokenPct } from './format';
import { getStudyEvidence } from '@/lib/research-data';
import type { Builder } from './build';
import type { Nugget } from './types';

/**
 * The nugget from the manifest's checkpoint distances (km) and the share of eligible finishes with a sustained slowdown:
 * the guard holds when the mats run in order to the finish. The figure is the share in tenths when the dek's words are
 * "about N in 10" ("3 in 10"), otherwise the percentage; none without a share.
 */
export function runnerYoursFrom(points: number[], rate: number = NaN): Nugget {
  const mats = points.length;
  const last = mats ? points[mats - 1] : 0;
  const ordered = points.every((p, i) => Number.isFinite(p) && p > (i ? points[i - 1] : 0));
  const guard = mats > 1 && ordered && Math.abs(last - MARATHON_KM) < 1e-9;
  const word = countWord(mats);
  return {
    id: 'runner.yours', page: '/runners', denominator: 'none',
    values: { mats, first_km: mats ? points[0] : 0, finish_km: last },
    guard,
    headline: guard ? `A past race, read at its *${word}* mats from ${matLabel(points[0])} to the finish.` : '',
    fallback: 'A past race, read mat by mat.',
    figure: runnerFigure(rate),
    key: runnerFigure(rate) ? `${/^about \d in 10$/.test(approxWords(rate)) ? '' : 'of '}finishes had a sustained slowdown` : (guard ? `${word} mats, one race` : 'mat by mat, one race'),
    term: '/methodology#sustained-slowdown',
  };
}

/** "3 in 10" when the share is about three tenths (as the dek says it), else "30%"; null without a share. */
function runnerFigure(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return null;
  const words = approxWords(rate);
  const tenths = /^about (\d) in 10$/.exec(words);
  return tenths ? { value: `${tenths[1]} in 10`, sr: `about ${tenths[1]} in 10 finishes` } : { value: pct(rate).replace('%', ''), unit: '%', sr: spokenPct(rate) };
}

type Manifest = { points_km: number[] };

export const RUNNER_NUGGETS: Record<string, Builder> = {
  'runner.yours': () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json'), 'utf8')) as Manifest;
    const rate = (getStudyEvidence()?.rate ?? NaN) / 100;
    return runnerYoursFrom(Array.isArray(manifest.points_km) ? manifest.points_km : [], rate);
  },
};
