import { MARATHON_SECTION_ENDS } from './section-labels';

/**
 * The hills reading (chapter 08, /analyses/hills-and-pacing), shared by the page's answer (server) and its explorer
 * (browser): each 5K's pace near a finish time against the same 5K on every course combined, at the same finish time.
 *
 * Late slowing happens on every course (35–40K is the slowest 5K near 4:00 almost everywhere), so a section's pace
 * against its own race's average says little about its hill. The comparison here takes each section's pace against its
 * race's distance-weighted average, minus the same for every course combined: what is left is what that stretch of this
 * course adds or saves against the same stretch elsewhere, in percentage points of pace (near one finish time the
 * averages are close, so a point is about a percent).
 *
 * The reading names a climbing 5K only: one that climbs CLIMB_M or more (the course pages' "biggest climb" floor), after
 * the first 5K, whose pace also carries the start's crowding (a crowded first 5K runs far slower than elsewhere with no
 * climb at all). It says the climb ran slower from GAP whole percent; below that its climbs ran like the same stretches
 * elsewhere.
 */
export const TERRAIN_CLIMB_M = 30;
export const TERRAIN_GAP = 2;

const LENGTHS = MARATHON_SECTION_ENDS.map((end, i) => end - (i ? MARATHON_SECTION_ENDS[i - 1] : 0));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Each section's pace against the distance-weighted average of the nine, in percent. */
export function againstAverage(paces: number[]): number[] {
  if (paces.length !== MARATHON_SECTION_ENDS.length || !paces.every(finite)) return [];
  const mean = paces.reduce((s, p, i) => s + p * LENGTHS[i], 0) / LENGTHS.reduce((s, l) => s + l, 0);
  return paces.map((p) => (p / mean - 1) * 100);
}

/** Each section against the same section on every course combined (percentage points), or [] without both profiles. */
export function againstElsewhere(paces: number[], base: number[]): number[] {
  const own = againstAverage(paces), all = againstAverage(base);
  return own.length && all.length ? own.map((v, i) => v - all[i]) : [];
}

export type TerrainReading = {
  /** The climbing section the reading names (index into the nine), its climb in metres and its pace against elsewhere. */
  i: number; gain: number; vs: number;
  /** Whether it ran slower from TERRAIN_GAP whole percent (else the climbs ran like the same stretches elsewhere). */
  slower: boolean;
};

/** The climbing 5K (after the first) that ran slowest against the same 5K elsewhere; null when no 5K climbs CLIMB_M. */
export function terrainReading(gains: number[], vs: number[]): TerrainReading | null {
  if (gains.length !== MARATHON_SECTION_ENDS.length || vs.length !== gains.length) return null;
  let best = -1;
  gains.forEach((g, i) => { if (i > 0 && finite(g) && g >= TERRAIN_CLIMB_M && finite(vs[i]) && (best < 0 || vs[i] > vs[best])) best = i; });
  return best < 0 ? null : { i: best, gain: gains[best], vs: vs[best], slower: Math.round(vs[best]) >= TERRAIN_GAP };
}

/** A section's pace against elsewhere as its block shows it: whole percent, signed ("+4%", "−2%", "0%"). */
export const signedWhole = (v: number) => { const r = Math.round(v); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`; };

/** Routes genuinely below sea level (polders), whose profile may sit under 0 m. */
const BELOW_SEA_LEVEL = new Set(['Amsterdam', 'Rotterdam']);
/** How long a profile may sit at or below 0 m on any other route before it reads as the water under a bridge, in km. */
const UNDER_WATER_KM = 0.5;

/**
 * A route profile from a terrain model records the water under a bridge, not its deck (New York's Verrazzano reads
 * -1.6 m at 0.6–2.0 km, where runners climb). A route that is not below sea level and sits at or below 0 m for 0.5 km or
 * more has a profile that misstates its climbs: the course pages rank none there, and the hills page draws none.
 */
export function underWater(city: string, elevation: number[], stepKm: number): boolean {
  if (BELOW_SEA_LEVEL.has(city)) return false;
  let run = 0;
  for (const m of elevation) {
    run = m <= 0 ? run + 1 : 0;
    if ((run - 1) * stepKm >= UNDER_WATER_KM) return true;
  }
  return false;
}
