import SplitCheck, { type OpeningBand } from '@/components/tools/SplitCheck';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getFastStartStart } from '@/lib/fast-start-server';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex } from '@/lib/tools/data';
import './split-check.css';

export const metadata = {
  title: 'Marathon split check: section paces, sustained slowdown and pacing type | Pace Notes',
  description: 'Type or paste your nine 5 km mat times. See every section’s pace against your own 5–20 km pace, whether you had a sustained slowdown, your opening, your pacing type, and how you compare with finishes at your time.',
};

const INDEX = 'tools/pace-band.json';
const ARCHETYPES = 'archetypes.json';

/** The six opening groups of the starting-pace analysis (definitions only), and its course names for deep links. */
function openingGroups(): { bands: OpeningBand[]; cities: string[] } {
  try {
    const start = getFastStartStart('all');
    const bands = (start.bands as unknown as OpeningBand[]).filter((b) => typeof b.id === 'string' && typeof b.label === 'string'
      && (b.lower === null || typeof b.lower === 'number') && (b.upper === null || typeof b.upper === 'number'));
    return bands.length === start.bands.length
      ? { bands: bands.map(({ id, label, lower, upper, lower_inclusive, upper_inclusive }) => ({ id, label, lower, upper, lower_inclusive: Boolean(lower_inclusive), upper_inclusive: Boolean(upper_inclusive) })), cities: start.cities }
      : { bands: [], cities: [] };
  } catch {
    return { bands: [], cities: [] };
  }
}

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

export default function SplitCheckPage() {
  const manifest = getInsightsManifest();
  const indexSha = manifest.files[INDEX]?.sha256 ?? null;
  const archetypesSha = manifest.files[ARCHETYPES]?.sha256 ?? null;
  const index = indexSha ? readInsight<PaceBandIndex>(INDEX) : null;
  const { bands, cities } = openingGroups();
  const duplicates = index?.duplicate_edition_screen ?? [];
  const offsets = index?.screens?.start_offset ?? [];
  const grid = index?.screens?.grid ?? [];

  return (
    <div className="container tool-page">
      <ToolHeader slug="split-check" />
      <SplitCheck indexSha={indexSha} archetypesSha={archetypesSha} openingBands={bands} openingCities={cities} />
      <ToolMethod sources={[
        { label: 'Smyth B (2021). PLOS ONE 16(5): e0251513, the published definition of a sustained slowdown used here. doi:10.1371/journal.pone.0251513', url: 'https://doi.org/10.1371/journal.pone.0251513' },
      ]}>
        <p><strong>Your sections are arithmetic.</strong> Each section’s pace is its time divided by its length: eight 5 km sections between the official timing mats, then the final 2.195 km. Your reference is your own 5–20 km pace, (20 km time − 5 km time) ÷ 15. Every percentage is a section’s pace divided by that reference, minus one, so +27% means 27% slower. Your opening is the first 5 km against the same reference, placed in one of the six opening groups used by the <Link href="/analyses/starting-pace">starting-pace analysis</Link>. Only the mats you type are used: no halfway or mile splits are derived, and a missing mat is never filled in.</p>
        <p><strong>Sustained slowdown follows a published definition.</strong> A race has one when a 5 km section after 20 km (20–25, 25–30, 30–35 or 35–40 km) is at least 25% slower than the 5–20 km pace, with contiguous slow sections totalling at least 5 km (Smyth 2021). Every qualifying section here is a full 5 km, so one is enough; the final 2.195 km can extend a run but cannot qualify on its own. The onset is the first qualifying section. This is the same rule Pace Notes applies to every finish in its data. It describes the shape of a race; it does not explain it.</p>
        <p><strong>Your pacing type comes from Pace Notes data.</strong> Each section’s pace is compared with your own average pace for the whole race, as a percentage. Those nine numbers are clipped to the published range, the short final section is down-weighted by √(2.195 ÷ 5), and you get the nearest of six centroids fitted to complete Pace Notes finishes, the same classifier as in <Link href="/stories/pacing-types">six ways to run the same race</Link>. The type is a descriptive cluster label, not a grade, and the shares are observed shares of complete finishes.</p>
        <p><strong>The comparison is Pace Notes data.</strong> For a finish F, the window runs from G − 5:00 to G − 0:01 with G = ⌊F ÷ 60⌋ + 3 minutes, so it holds your time with at least two minutes on each side. It contains every screened complete finish in that window on the chosen course (or all courses) and recorded gender, each with all nine official checkpoint times, split into those with a sustained slowdown and those that held pace. The table shows each group’s median elapsed time at every mat, and your time minus that median. Groups with fewer than 100 finishes are never shown; when neither group reaches 100, the median of all finishes in the window is shown instead. Editions are pooled, so a course’s group mixes years, fields and weather; the number of editions is always given. Because the groups are selected by how their races ended, the differences describe those races and are not evidence that pacing one way causes a different finish. Runners who stopped are not in the data, counts are finishes rather than people, and weather and elevation do not enter any number.</p>
        <p><strong>Your times stay with you.</strong> Everything is calculated in your browser. The nine times sit in the page address (the <code>s</code> parameter) only so the link you copy reproduces the page. The data files are requested by course and recorded gender alone, without the page address; analytics never record the times; and links from this page pass on only the site’s domain. Opening a link that holds times sends that address to the site’s host, as any page request does. Eligibility follows the rules used across Pace Notes: times must increase, every section must work out between 2 and 20 minutes per km, and the finish must be between 1:30:00 and 12:00:00.</p>
        {index ? (
          <p><strong>Screened editions.</strong> The comparison draws on {index.cohort_n.toLocaleString('en-US')} screened finishes from {index.editions} editions.
            {duplicates.length ? <> Left out as duplicated fields: {duplicates.map((d) => `${d.city} ${d.year} (a copy of ${d.duplicate_of})`).join(', ')}.</> : null}
            {offsets.length ? <> Left out because start delays inflate the first split: {editionList(offsets)}.</> : null}
            {grid.length ? <> Left out because the mat grid was shifted: {grid.map((g) => `${g.city} ${g.year}`).join(', ')}.</> : null}
          </p>
        ) : <p>The comparison data is not part of this build, so only your own sections, the slowdown reading, your opening and your pacing type are shown.</p>}
      </ToolMethod>
      <ToolNext current="split-check" />
    </div>
  );
}
