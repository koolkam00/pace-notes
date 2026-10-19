/**
 * The runner pages' nugget (WP6; the redesign spec, sections 2.2 and 5). /runners has no reading of its own: it is
 * reached from the navigation, holds no data value until a visitor finds a race, and is never recorded. /report has
 * none either. So runner.yours has no figure (a card or a contents row never sets a word in figure type); its sentence
 * and key count the mats from the runner manifest's checkpoints rather than typing them. Chapter 10's lead is the split
 * check's finding (splitcheck.share). Server only; scripts/nuggets/runners.cjs recounts it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MARATHON_KM, matLabel } from '@/lib/units';
import { countWord } from './format';
import type { Builder } from './build';
import type { Nugget } from './types';

/** The nugget from the manifest's checkpoint distances (km): the guard holds when they run in order to the finish. */
export function runnerYoursFrom(points: number[]): Nugget {
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
    figure: null,
    key: guard ? `${word} mats, one race` : 'mat by mat, one race',
  };
}

type Manifest = { points_km: number[] };

export const RUNNER_NUGGETS: Record<string, Builder> = {
  'runner.yours': () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json'), 'utf8')) as Manifest;
    return runnerYoursFrom(Array.isArray(manifest.points_km) ? manifest.points_km : []);
  },
};
