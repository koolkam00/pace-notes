/**
 * The pacing-type classifier, as archetypes.json publishes it (the six types' centroids, the clip range and weights of
 * each section), as one pure function: the type finder on /stories/pacing-types runs it in the browser on the reader's
 * own times, and the page runs it at build on its example, so the beat's heading gives the example's reading from the
 * same rule (round 5: the heading was a question the beat then answered).
 */
const SECTION_KM = [5, 5, 5, 5, 5, 5, 5, 5, 2.195];

/** A checkpoint time, h:mm:ss or mm:ss; dots or commas between the groups are read as colons. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  const m = t.replace(/[.,]/g, ':').match(/^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export type Classifier = { clip_lo: number[]; clip_hi: number[]; weights: number[]; centroids: number[][] };

/**
 * Nine cumulative mat times (seconds) to each section's pace against the race's own average (percent) and the nearest
 * type (its index), or null when the times cannot be a marathon (out of order, a finish outside 1:30–12:00, or a
 * section faster than 2:00 or slower than 20:00 per km).
 */
export function classifyTimes(times: (number | null)[], c: Classifier): { rel: number[]; best: number } | null {
  if (times.length !== 9 || times.some((t) => t === null)) return null;
  const t = times as number[];
  if (t.some((v, i) => i > 0 && v <= t[i - 1])) return null;
  const finish = t[8];
  if (finish < 5400 || finish > 43200) return null;
  if (t.some((v, i) => { const pace = (v - (i ? t[i - 1] : 0)) / SECTION_KM[i]; return pace < 120 || pace > 1200; })) return null;
  const avg = finish / 42.195;
  const rel = t.map((v, i) => 100 * (((v - (i ? t[i - 1] : 0)) / SECTION_KM[i]) / avg - 1));
  const xv = rel.map((v, i) => Math.min(c.clip_hi[i], Math.max(c.clip_lo[i], v)) * c.weights[i]);
  const dist = c.centroids.map((cent) => cent.reduce((s, cv, i) => s + (xv[i] - cv) ** 2, 0));
  return { rel, best: dist.indexOf(Math.min(...dist)) };
}
