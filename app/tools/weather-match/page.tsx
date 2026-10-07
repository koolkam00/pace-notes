import WeatherMatch from '@/components/tools/WeatherMatch';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { WeatherMatch as WeatherMatchData } from '@/lib/tools/data';
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
  const warm = data ? [...data.editions].filter((e) => e.temp_c >= 20).sort((a, b) => b.temp_c - a.temp_c) : [];
  const offsets = data?.screens?.start_offset ?? [];
  const grid = data?.screens?.grid ?? [];
  const duplicates = data?.duplicate_edition_screen ?? [];
  const noWeather = data?.excluded ?? [];
  const maxC = data ? Math.max(...data.rows.map((r) => r.c)) : 0;

  return (
    <div className="container tool-page">
      <ToolHeader slug="weather-match" />
      <WeatherMatch sha={sha} />
      <ToolMethod sources={[
        { label: 'Published slowdown method (2021), doi:10.1371/journal.pone.0251513', url: 'https://doi.org/10.1371/journal.pone.0251513' },
        { label: 'Ely, Cheuvront, Roberts & Montain (2007). Impact of weather on marathon-running performance. Med Sci Sports Exerc 39:487–493', url: 'https://experts.umn.edu/en/publications/impact-of-weather-on-marathon-running-performance/' },
        { label: 'Mantzios et al. (2022). Effects of weather parameters on endurance running performance: discipline-specific analysis of 1258 races. Med Sci Sports Exerc 54:153–161', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8677617/' },
        { label: 'Knechtle et al. (2019). The role of weather conditions on running performance in the Boston Marathon from 1972 to 2018. PLoS One 14:e0212797', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6407773' },
        { label: 'Stull (2011). Wet-bulb temperature from relative humidity and air temperature. J Appl Meteorol Climatol 50:2267–2269 (formula as documented by NCAR)', url: 'https://www.ncl.ucar.edu/Document/Functions/Contributed/wetbulb_stull.shtml' },
        { label: 'ACSM expert consensus statement on exertional heat illness: recognition, management and return to activity (2023)', url: 'https://experts.umn.edu/en/publications/acsm-expert-consensus-statement-on-exertional-heat-illness-recogn/' },
        { label: 'Brimicombe et al. (2023). Wet bulb globe temperature: indicating extreme heat risk on a global grid. GeoHealth', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9941479' },
        { label: 'Mark Hadley’s temperature + dew point table (rule of thumb), as reproduced by Triple Threat Life', url: 'https://triplethreatlife.substack.com/p/how-to-adjust-run-pace-in-the-heat' },
        { label: 'RunnersConnect dew-point bands (rule of thumb)', url: 'https://runnersconnect.net/dew-point-effect-running/' },
      ]}>
        <p><strong>What is matched.</strong> Your start temperature is rounded to the nearest whole °C, and the window is that centre ±2 °C (±3.6 °F), or ±3 °C (±5.4 °F) if you widen it. A past race matches when its start temperature lies in the window and it has at least 20 finishes whose 5–20 km pace, (20 km time − 5 km time) ÷ 15, falls in your 15 s/km pace band. A goal time is turned into its even pace and used as the 5–20 km pace: that is an assumption, and the page says so. A window and band are published only with at least 3 races and 100 finishes; otherwise the page says why instead of guessing.</p>
        <p><strong>What is shown.</strong> The share of finishes with a sustained slowdown, the median time after 20 km beyond the 5–20 km pace ((finish − 20 km time) − 22.195 × the 5–20 km pace per km), the median pace from 30 km to the finish against the 5–20 km pace, and each 5 km section’s median pace against the 5–20 km pace. Each is worked out per race and then averaged with every race counted equally, because each race is one weather observation. Finish-time percentiles pool all the finishes and only describe who was in the field.</p>
        <p><strong>Sustained slowdown.</strong> A 5 km section after 20 km run at least 25% slower than the runner’s own 5–20 km pace, with contiguous slowed sections totalling at least 5 km. The definition follows the published slowdown method cited below. Shares are observed shares of complete finishes, never anyone’s chance.</p>
        <p><strong>The reference column.</strong> The same pace band in races that started at 8–12 °C (46.4–53.6 °F). The two columns sit side by side and are never subtracted: the races differ in course, field, year and route as well as weather, so the difference is not a heat effect and no heat-adjusted time is calculated from Pace Notes data. For course, age and gender cuts by temperature band, see <Link href="/analyses/race-day-weather">how warm and cool races compare</Link>; for the temperature rise during the race, see <Link href="/analyses/warming-and-pacing">what happens when the race gets warmer</Link>.</p>
        <p><strong>The weather.</strong> Each race has one supplied, modelled observation for the hour of its scheduled start at one point in the city. It is not anyone’s personal exposure: wave starts, sun, shade and wind on the course are unknown. Dew point is shown as context only. The Pace Notes humidity association was withheld as inconclusive, which does not show that humidity has no effect. Historical weather is not a forecast; the page fetches nothing and uses only the forecast you type.</p>
        {data ? (
          <p><strong>Warm data is sparse.</strong> Of {data.editions.length} races with weather in this tool, {warm.length} started at 20 °C (68 °F) or warmer: {warm.map((e) => `${e.city} ${e.year} (${e.temp_c.toFixed(1)} °C, ${f(e.temp_c)} °F)`).join(', ')}. Windows centred above about 21 °C rest largely on these few races, and no window is centred above {maxC} °C ({f(maxC)} °F).</p>
        ) : null}
        <p><strong>Who is not here.</strong> Only complete finishes with all nine 5 km checkpoints are counted, so runners who stopped are not in the data. Counts are finishes, not people.{' '}
          {data ? <>Left out: races without a valid weather row ({editionList(noWeather)}); races whose first split is inflated by start delays ({editionList(offsets)}); races whose mat grid looks shifted ({editionList(grid)}); and duplicated fields ({editionList(duplicates)}).</> : null}
        </p>
        <p><strong>Published research panel.</strong> Relative humidity uses the Magnus form (Alduchov &amp; Eskridge 1996); wet-bulb uses Stull (2011), valid for 5–99% humidity and −20 to 50 °C; shade WBGT ≈ 0.7 × wet-bulb + 0.3 × air temperature, with the ACSM race flags (green below 18, yellow 18–23, red 23–28, black above 28 °C WBGT). Ely et al. (2007) is shown as the extra over its coolest WBGT band; Mantzios et al. (2022) as 0.2% (elite marathon finalists) to 0.4% (all endurance events) per °C WBGT above 15 °C; Hadley’s table and the RunnersConnect bands as published. Hadley and RunnersConnect are rules of thumb, not studies. Each method stays a separate range, and minutes are the published percentage multiplied by your goal. None of these figures is fitted to Pace Notes data, combined with it, or passed to any other tool.</p>
      </ToolMethod>
      <ToolNext current="weather-match" />
    </div>
  );
}
