/** Deep links into the runner tools from other pages. Only race times and course slugs go in a link, never names or record ids. */

/** Same rule as slugifyCity in lib/course-data.ts and the tool data builders. */
export const courseSlug = (city: string) => city.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

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
