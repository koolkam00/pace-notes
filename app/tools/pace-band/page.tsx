import PaceBand, { type RouteProfile } from '@/components/tools/PaceBand';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import type { CourseGeometry } from '@/lib/insights';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex } from '@/lib/tools/data';
import './pace-band.css';

export const metadata = {
  title: 'Marathon pace band: printable wristband and real mat-by-mat splits | Pace Notes',
  description: 'A printable even-pace marathon wristband for any goal, every mile, kilometre or 5 km mat, next to what finishes that actually hit that goal on your course ran at each mat, split by whether they held pace or had a sustained slowdown.',
};

const INDEX = 'tools/pace-band.json';

// The shared index type carries the screens and duplicate-edition list.
type ScreenedIndex = PaceBandIndex;

/** "Madrid 2013–2018, New York 2006–2007": years grouped by city, consecutive runs collapsed. */
function editionList(rows: { city: string; year: number }[]): string {
  const byCity = new Map<string, number[]>();
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r.year]);
  return [...byCity.entries()].map(([city, years]) => {
    const sorted = [...new Set(years)].sort((a, b) => a - b);
    const runs: string[] = [];
    let start = sorted[0];
    for (let i = 1; i <= sorted.length; i += 1) {
      if (sorted[i] !== sorted[i - 1] + 1) {
        runs.push(start === sorted[i - 1] ? String(start) : `${start}–${sorted[i - 1]}`);
        start = sorted[i];
      }
    }
    return `${city} ${runs.join(', ')}`;
  }).join('; ');
}

export default function PaceBandPage() {
  const manifest = getInsightsManifest();
  const indexSha = manifest.files[INDEX]?.sha256 ?? null;
  const index = indexSha ? readInsight<ScreenedIndex>(INDEX) : null;

  // Supplied route elevation for the optional printed back strip. Context only: never used in a calculation.
  const geometry = manifest.files['course-geometry.json'] ? readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses : [];
  const profiles: RouteProfile[] = [];
  for (const scope of index?.scopes ?? []) {
    const course = scope.city ? geometry.find((c) => c.city === scope.city) : undefined;
    if (!course || !course.elevation_m?.length) continue;
    profiles.push({
      slug: scope.slug, city: course.city, race: course.race, km: course.distance_km, step: course.elevation_step_km,
      m: course.elevation_m.map((v) => Math.round(v * 10) / 10), min: course.min_m, max: course.max_m, gain: course.gain_m, loss: course.loss_m,
    });
  }

  const duplicates = index?.duplicate_edition_screen ?? [];
  const offsets = index?.screens?.start_offset ?? [];
  const grid = index?.screens?.grid ?? [];

  return (
    <div className="container tool-page">
      <ToolHeader slug="pace-band" />
      <PaceBand indexSha={indexSha} profiles={profiles} />
      <ToolMethod sources={[
        { label: 'Smyth B (2021). PLOS ONE 16(5): e0251513, the published definition of a sustained slowdown used here. doi:10.1371/journal.pone.0251513', url: 'https://doi.org/10.1371/journal.pone.0251513' },
        { label: 'Deaner RO, Carter RE, Joyner MJ, Hunter SK (2015). Men are more likely than women to slow in the marathon. Medicine & Science in Sports & Exercise 47(3): 607–616.', url: 'https://epublications.marquette.edu/exsci_fac/61' },
      ]}>
        <p><strong>The band is arithmetic.</strong> Even pace is the goal divided by 42.195 km. The elapsed time at any point is that pace times the distance; mile rows use 1.609344 km per mile and halfway is 21.0975 km. Times are rounded to whole seconds once, at display. The watch option divides the goal pace by 1 plus the overrun you choose: it is your own assumption about how long your watch reads, not a typical error, and the band’s times still refer to the course markers. Few marathoners actually run evenly: in a large published analysis of US marathons, men ran the second half 15.6% slower than the first on average and women 11.7% (Deaner and colleagues, 2015). That is why the band sits beside what real finishes ran.</p>
        <p><strong>The observed columns are Pace Notes data.</strong> For a whole-minute goal G, the window holds every screened finish from G − 5:00 to G − 0:01 on the chosen course (or all courses) and recorded gender, each with all nine official 5 km checkpoint times. Each group shows the median and, where published, the 25th and 75th percentiles of the elapsed time at the 5–40 km mats and the finish, and of the pace in each section. The difference from even pace is the median minus the even-pace time for your goal. Editions are pooled, so a course’s groups mix different years, weather and fields; the number of editions is always shown. A goal with seconds uses the nearest whole minute for the observed window.</p>
        <p><strong>Held pace and sustained slowdown.</strong> A finish has a sustained slowdown when a recorded 5 km section after 20 km is at least 25% slower than its own 5–20 km pace, with contiguous slow sections totalling at least 5 km (the published definition in Smyth 2021). Every other finish in the window held pace. The groups are selected by how the race ended, so comparing them describes what those races looked like; it does not show that running the first half faster or slower causes a different finish. The percentiles are observed variation between finishes, not uncertainty in an estimate, and none of the observed columns is a recommended or optimal plan.</p>
        <p><strong>What is not here.</strong> Only complete finishes are recorded, so runners who stopped are missing from every group. Counts are finishes, not people: one runner can appear in several editions. There are no observed halfway or mile splits, because the source records only the 5 km mats; 20 km is labelled 20 km, not halfway. Groups with fewer than 100 finishes are never published. Weather and elevation do not enter any number. The optional elevation strip for the back of a printed band is the supplied current route, whose historical validity is unknown and which may be missing bridge decks.</p>
        {index ? (
          <p><strong>Screened editions.</strong> The window draws on {index.cohort_n.toLocaleString('en-US')} screened finishes from {index.editions ?? index.scopes.find((sc) => sc.slug === 'all')?.editions} editions.
            {duplicates.length ? <> Left out as duplicated fields: {duplicates.map((d) => `${d.city} ${d.year} (a copy of ${d.duplicate_of})`).join(', ')}.</> : null}
            {offsets.length ? <> Left out because start delays inflate the first split: {editionList(offsets)}.</> : null}
            {grid.length ? <> Left out because the mat grid was shifted: {grid.map((g) => `${g.city} ${g.year}`).join(', ')}.</> : null}
          </p>
        ) : null}
      </ToolMethod>
      <ToolNext current="pace-band" />
    </div>
  );
}
