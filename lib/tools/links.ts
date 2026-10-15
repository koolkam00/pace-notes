/** Deep links into the runner tools and analyses from other pages. Only race times and course slugs go in a link, never names or record ids. */

/** Same rule as slugifyCity in lib/course-data.ts and the tool data builders. */
export const courseSlug = (city: string) => city.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** /tools/pace-band with a goal in whole minutes, as it reads it (goal=H:MM); null outside the 1:30 to 8:00 it takes. */
export function paceBandGoalHref(minutes: number): string | null {
  return Number.isInteger(minutes) && minutes >= 90 && minutes <= 480 ? `/tools/pace-band?goal=${hm(minutes)}` : null;
}

/**
 * The pacing-pattern analysis for finishes near a time in whole minutes, as readAnalysisProfile (lib/analysis-profile.ts)
 * reads it (goal=<minutes>, from GOAL_MIN to GOAL_MAX: 1:30 to 12:00); null outside that range.
 */
export function pacingPatternHref(minutes: number): string | null {
  return Number.isInteger(minutes) && minutes >= 90 && minutes <= 720 ? `/analyses/pacing-pattern?goal=${minutes}` : null;
}

const clock = (seconds: number) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** /tools/split-check with nine cumulative mat times (5–40 km and finish) and the course. */
export function splitCheckHref(cumulativeSeconds: number[], city?: string): string | null {
  if (cumulativeSeconds.length !== 9 || cumulativeSeconds.some((t) => !Number.isFinite(t) || t <= 0)) return null;
  const course = city ? `&course=${courseSlug(city)}` : '';
  return `/tools/split-check?s=${cumulativeSeconds.map(clock).join(',')}${course}`;
}
