/**
 * The pace band's observed groups (tools/pace-band.json and its shards), shared by the pace band and the race planner:
 * the index and shard paths, the cell for one whole-minute goal, and the goal and pace wording both print.
 */
import type { PaceBandGroup } from '@/lib/tools/data';
import { MARATHON_KM, MATS_KM, perUnit } from '@/lib/tools/pace';
import { formatDuration, formatHM } from '@/lib/tools/time';
import type { UnitSystem } from '@/lib/units';

export const PACE_BAND_INDEX = 'tools/pace-band.json';
/** One shard per course slug (or `all`) and recorded gender (`all`, `men`, `women`), listed with its SHA-256 in the index. */
export const paceBandShardPath = (course: string, gender: string) => `tools/pace-band/${course}/${gender}.json`;
/** The nine official timing points: the 5–40 km mats and the finish. */
export const CHECKPOINTS = [...MATS_KM, MARATHON_KM];

/** One goal's group: the finishes from G − 5:00 to G − 0:01, with mat medians (and quartiles where published). */
export interface PaceBandCell { n: number; ed: number; e50: number[]; s50: number[]; e25?: number[]; e75?: number[]; s25?: number[]; s75?: number[]; sd?: number; onset?: number[] }

/** The group's cell for a whole-minute goal, or null when the goal is not published (fewer than 100 finishes). */
export function cellOf(group: PaceBandGroup | undefined, minute: number): PaceBandCell | null {
  if (!group) return null;
  const i = group.g.indexOf(minute);
  if (i < 0) return null;
  return {
    n: group.n[i], ed: group.ed[i], e50: group.e50[i], s50: group.s50[i],
    e25: group.e25?.[i], e75: group.e75?.[i], s25: group.s25?.[i], s75: group.s75?.[i], sd: group.sd?.[i], onset: group.onset?.[i],
  };
}

/** A goal as the tools write it: 3:30 for whole minutes, 3:30:30 with seconds. */
export const fmtGoal = (s: number) => (Math.round(s) % 60 === 0 ? formatHM(s) : formatDuration(s, true));
/** A pace with its unit: 8:01/mi. */
export const fmtPace = (sPerKm: number, units: UnitSystem) => `${formatDuration(perUnit(sPerKm, units))}/${units}`;
