/**
 * The replay's geometry, shared by the server poster (ReplayPoster), the frame and the canvas (RaceReplay), so the
 * poster drawn at build and the first canvas frame line up exactly. Pure functions of plain numbers.
 *
 * The field view draws "rank lanes": x is the distance covered, from the start to a dashed finish line on the right;
 * y is the runner's finish rank, fastest at the top. Mid-race the field is a needle that tilts as the race unfolds, so
 * even a still frame reads.
 */

export const MARATHON = 42.195;
const KM = [0, 5, 10, 15, 20, 25, 30, 35, 40, MARATHON];

export interface ReplayEdition {
  city: string;
  year: number;
  finishes: number;
  sample: number;
  /** Each row: nine cumulative elapsed seconds (5K … finish), then a gender code (0 men, 1 women, 2 other or not recorded). */
  rows: number[][];
  /** The route as a polyline in a unit box, with the cumulative distance (km) at each vertex. */
  route?: { points: [number, number][]; km: number[] } | null;
}

/** The plot box inside the canvas, as fractions: room on the right for the finish line and the finished runners. */
export const FIELD_BOX = { left: 0.02, right: 0.06, top: 0.06, bottom: 0.06 } as const;

export const fieldX = (km: number) => FIELD_BOX.left + (1 - FIELD_BOX.left - FIELD_BOX.right) * (Math.min(km, MARATHON) / MARATHON);
export const fieldY = (rankFraction: number) => FIELD_BOX.top + (1 - FIELD_BOX.top - FIELD_BOX.bottom) * rankFraction;

export type Position = { km: number; finished: boolean; slowdownPace: boolean };

/**
 * Where a runner is at race-clock second `t`: distance covered (linear between mats), whether they have finished, and
 * whether they are after 20K in a section run at least 25% slower than their own 5–20K pace (sustained-slowdown pace).
 */
export function positionAt(row: number[], t: number): Position {
  const finish = row[8];
  if (t >= finish) return { km: MARATHON, finished: true, slowdownPace: false };
  if (t <= 0) return { km: 0, finished: false, slowdownPace: false };
  let j = 0;
  while (j < 8 && row[j] <= t) j += 1;
  const start = j === 0 ? 0 : row[j - 1];
  const end = row[j];
  const f = (t - start) / Math.max(1, end - start);
  const km = KM[j] + f * (KM[j + 1] - KM[j]);
  const baseline = (row[3] - row[0]) / 15;
  const pace = (end - start) / (KM[j + 1] - KM[j]);
  return { km, finished: false, slowdownPace: j >= 4 && baseline > 0 && pace / baseline - 1 >= 0.25 };
}

/** Rows sorted by finish time (rank 0 = first to finish). */
export function byFinish(rows: number[][]): number[][] {
  return [...rows].sort((a, b) => a[8] - b[8]);
}

/** The field's shape at second `t` as `points` quantiles of rank: [rank fraction, km] pairs, for the poster. */
export function ribbonAt(sorted: number[][], t: number, points = 40): [number, number][] {
  const n = sorted.length;
  if (!n) return [];
  return Array.from({ length: points }, (_, q) => {
    const f = points === 1 ? 0 : q / (points - 1);
    const row = sorted[Math.round(f * (n - 1))];
    return [Number(f.toFixed(4)), Number(positionAt(row, t).km.toFixed(3))] as [number, number];
  });
}

/** Shares of the sample finished and at sustained-slowdown pace at second `t`. */
export function sharesAt(rows: number[][], t: number): { finished: number; slowdownPace: number } {
  let finished = 0, slow = 0;
  for (const row of rows) {
    const p = positionAt(row, t);
    if (p.finished) finished += 1;
    else if (p.slowdownPace) slow += 1;
  }
  const n = rows.length || 1;
  return { finished: finished / n, slowdownPace: slow / n };
}

/** h:mm:ss on the race clock. */
/**
 * The route view's width-to-height ratio: the route's own box with the canvas's margins (it fills 90% of the width or
 * 88% of the height), so an east–west course gets a short frame and a north–south one a tall frame. CSS clamps the
 * height (160 to 520 px).
 */
export function routeAspect(points: [number, number][] | undefined | null): number {
  if (!points || points.length < 2) return 1;
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
  if (!(bw > 0) || !(bh > 0)) return 1;
  return Math.round(((bw / 0.9) / (bh / 0.88)) * 1000) / 1000;
}

export function raceClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** A HUD share: "<1%" for a share above zero that rounds to it, else whole percent. */
export function hudShare(share: number): string {
  if (share > 0 && share < 0.005) return '<1%';
  return `${Math.round(share * 100)}%`;
}

/** What the poster needs, computed at build from the sample rows (about 1 KB). */
export type ReplayPosterData = {
  flag_s: number;
  last_s: number;
  ribbon: [number, number][];
  finished: number;
  slowdownPace: number;
};
