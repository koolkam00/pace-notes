import WeatherMatch from '@/components/tools/WeatherMatch';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex, PaceBandShard, WeatherMatch as WeatherMatchData } from '@/lib/tools/data';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import './weather-match.css';

export const metadata = {
  title: 'Marathon weather match: past races at your forecast temperature | Pace Notes',
  description: 'Type your race-morning forecast and pace. See the past marathons that started at a similar temperature, how finishes at your 5–20 km pace held up there beside cooler mornings, and what published heat research and rules of thumb suggest.',
};

const FILE = 'tools/weather-match.json';

function load(): { sha: string | null; data: WeatherMatchData | null } {
  try {
    const sha = getInsightsManifest().files[FILE]?.sha256 ?? null;
    return { sha, data: sha ? readInsight<WeatherMatchData>(FILE) : null };
  } catch {
    return { sha: null, data: null };
  }
}

/**
 * The courses the pace band publishes, each with the whole-minute goals that have an observed window there
 * (100 or more finishes in the five minutes under the goal), as [first, last] runs. A course whose shard cannot be
 * read maps to null: it is still linked, and the pace band explains. Null when the pace band is not in this build,
 * so links go to the all-course band. Read at build time, so the client never loads the pace-band files.
 */
function paceBandCourses(): Record<string, [number, number][] | null> | null {
  try {
    const manifest = getInsightsManifest();
    if (!manifest.files['tools/pace-band.json']) return null;
    const out: Record<string, [number, number][] | null> = {};
    for (const { slug } of readInsight<PaceBandIndex>('tools/pace-band.json').scopes) {
      if (slug === 'all') continue;
      try {
        const goals = [...(readInsight<PaceBandShard>(`tools/pace-band/${slug}/all.json`).groups.all?.g ?? [])].sort((a, b) => a - b);
        const runs: [number, number][] = [];
        for (const g of goals) {
          const last = runs[runs.length - 1];
          if (last && g === last[1] + 1) last[1] = g;
          else runs.push([g, g]);
        }
        out[slug] = runs;
      } catch {
        out[slug] = null;
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** "Madrid 2013–2018; New York 2006–2007": years grouped by city, consecutive runs collapsed. */
function editionList(rows: { city: string; year: number }[]): string {
  const byCity = new Map<string, number[]>();
  for (const r of rows) byCity.set(r.city, [...(byCity.get(r.city) ?? []), r.year]);
  return [...byCity.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([city, years]) => {
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

const f = (c: number) => Math.round((c * 9) / 5 + 32);

export default function WeatherMatchPage() {
  const { sha, data } = load();
  const paceBand = paceBandCourses();
  const warm = data ? [...data.editions].filter((e) => e.temp_c >= 20).sort((a, b) => b.temp_c - a.temp_c) : [];
  const offsets = data?.screens?.start_offset ?? [];
  const grid = data?.screens?.grid ?? [];
  const duplicates = data?.duplicate_edition_screen ?? [];
  const noWeather = data?.excluded ?? [];
  const maxC = data ? Math.max(...data.rows.map((r) => r.c)) : 0;

  return (
    <div className="container tool-page">
      <ToolHeader slug="weather-match" />
      <WeatherMatch sha={sha} paceBand={paceBand} />
      <ToolMethod sources={[
        SLOWDOWN_CITATION,
        { label: 'Ely, Cheuvront, Roberts & Montain (2007). Impact of weather on marathon-running performance. Med Sci Sports Exerc 39:487–493', url: 'https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/' },
        { label: 'Mantzios et al. (2022). Effects of weather parameters on endurance running performance: discipline-specific analysis of 1258 races. Med Sci Sports Exerc 54:153–161', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8677617/' },
        { label: 'Knechtle et al. (2019). The role of weather conditions on running performance in the Boston Marathon from 1972 to 2018. PLoS One 14:e0212797', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6407773' },
        { label: 'Stull (2011). Wet-bulb temperature from relative humidity and air temperature. J Appl Meteorol Climatol 50:2267–2269 (formula as documented by NCAR)', url: 'https://www.ncl.ucar.edu/Document/Functions/Contributed/wetbulb_stull.shtml' },
        { label: 'Armstrong et al. (1996). American College of Sports Medicine position stand: heat and cold illnesses during distance running. Med Sci Sports Exerc 28(12):i–x (source of the WBGT race-risk categories)', url: 'https://pubmed.ncbi.nlm.nih.gov/8970149/' },
        { label: 'Roberts et al. (2023). ACSM expert consensus statement on exertional heat illness: recognition, management, and return to activity. Curr Sports Med Rep 22:134–149 (updates the 2021 statement, Curr Sports Med Rep 20:470–484)', url: 'https://doi.org/10.1249/JSR.0000000000001058' },
        { label: 'Brimicombe et al. (2023). Wet bulb globe temperature: indicating extreme heat risk on a global grid. GeoHealth', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9941479' },
        { label: 'Mark Hadley’s temperature + dew point table (rule of thumb), as reproduced by Triple Threat Life', url: 'https://triplethreatlife.substack.com/p/how-to-adjust-run-pace-in-the-heat' },
        { label: 'RunnersConnect dew-point bands (rule of thumb)', url: 'https://runnersconnect.net/dew-point-effect-running/' },
      ]}>
        <p><strong>What is matched.</strong> Your start temperature is rounded to the nearest whole °C, and the window is that centre ±2 °C (±3.6 °F), or ±3 °C (±5.4 °F) if you widen it. A past edition (one year of one race) matches when its start temperature lies in the window and it has at least 20 finishes whose 5–20 km pace, (20 km time − 5 km time) ÷ 15, falls in your 15 s/km pace band. A goal time is turned into its even pace and used as the 5–20 km pace: that is an assumption, and the page says so. The 5–20 km pace is what each finish actually ran that day, not a goal or a measure of ability: on a warmer morning runners may already have started slower, so the same band can hold different runners on warm and cool mornings. A window and band are published only with at least 3 editions and 100 finishes; otherwise the page says why instead of guessing. The page shows how many editions started in the window and how many of them had 20 or more finishes at your pace.</p>
        <p><strong>What is shown.</strong> The share of finishes with a sustained slowdown, the median time after 20 km beyond the 5–20 km pace ((finish − 20 km time) − 22.195 × the 5–20 km pace per km), the median pace from 30 km to the finish against the 5–20 km pace, and each 5 km section’s median pace against the 5–20 km pace. Each is worked out per edition and then averaged with every edition counted equally, because each edition is one weather observation; the finish count beside them is the pooled total, a different denominator. Finish-time percentiles pool all the finishes and only describe who was in the field.</p>
        <p><strong>Sustained slowdown.</strong> {SLOWDOWN_DEFINITION} The definition follows the published slowdown method cited below. Shares are observed shares of complete finishes, never anyone’s chance.</p>
        <p><strong>The reference column.</strong> The same pace band in editions that started at 8–12 °C (46.4–53.6 °F). The two columns sit side by side and are never subtracted: the editions differ in course, field, year and route as well as weather, so the difference is not a heat effect and no heat-adjusted time is calculated from Pace Notes data. For course, age and gender cuts by temperature band, see <Link href="/analyses/race-day-weather">how warm and cool races compare</Link>; for the temperature rise during the race, see <Link href="/analyses/warming-and-pacing">what happens when the race gets warmer</Link>.</p>
        <p><strong>The weather.</strong> Each edition has one supplied, modelled observation for the hour of its scheduled start at one point in the city. It is not anyone’s personal exposure: wave starts, sun, shade and wind on the course are unknown. Dew point is shown as context only. The Pace Notes humidity association was withheld as inconclusive, which does not show that humidity has no effect. Historical weather is not a forecast; the page fetches nothing and uses only the forecast you type.</p>
        {data ? (
          <p><strong>Warm data is sparse.</strong> Of {data.editions.length} editions with weather in this tool, {warm.length} started at 20 °C (68 °F) or warmer: {warm.map((e) => `${e.city} ${e.year} (${e.temp_c.toFixed(1)} °C, ${f(e.temp_c)} °F)`).join(', ')}. Windows centred above about 21 °C rest largely on these few editions, and no window is centred above {maxC} °C ({f(maxC)} °F).</p>
        ) : null}
        <p><strong>Who is not here.</strong> Only complete finishes with all nine 5 km checkpoints are counted, so runners who stopped are not in the data. Counts are finishes, not people.{' '}
          {data ? <>Left out: editions without a valid weather row ({editionList(noWeather)}); editions whose first split is inflated by start delays ({editionList(offsets)}); editions whose mat grid looks shifted ({editionList(grid)}); and duplicated fields ({editionList(duplicates)}).</> : null}
        </p>
        <p><strong>Published research panel.</strong> Relative humidity uses the Magnus form (Alduchov &amp; Eskridge 1996); wet-bulb uses Stull (2011), valid for 5–99% humidity and −20 to 50 °C; shade WBGT ≈ 0.7 × wet-bulb + 0.3 × air temperature, with the race-risk categories of the 1996 ACSM position stand on distance running shown as flags (green below 18, low risk; yellow 18–23, moderate; red 23–28, high; black above 28 °C WBGT, very high, where it recommends postponing or cancelling). The current ACSM consensus (Roberts et al. 2023) uses region-specific thresholds instead. Ely et al. (2007) is shown as the extra over its coolest WBGT band; Mantzios et al. (2022) as 0.2% (elite marathon finalists) to 0.4% (all endurance events) per °C WBGT above 15 °C; Hadley’s table and the RunnersConnect bands as published. Hadley and RunnersConnect are rules of thumb, not studies. Each method stays a separate range, and minutes are the published percentage multiplied by your goal. None of these figures is fitted to Pace Notes data, combined with it, or passed to any other tool.</p>
      </ToolMethod>
      <ToolNext current="weather-match" />
    </div>
  );
}
