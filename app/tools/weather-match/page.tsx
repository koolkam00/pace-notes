import WeatherMatch from '@/components/tools/WeatherMatch';
import { ToolHeader, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex, PaceBandShard, WeatherMatch as WeatherMatchData } from '@/lib/tools/data';
import './weather-match.css';

export const metadata = pageMetadata({
  title: 'Marathon Weather: Races at Your Forecast Temperature',
  description: 'Enter your race-morning forecast and pace. See past marathons that started at a similar temperature and how finishes at that pace held up there.',
  path: '/tools/weather-match',
});

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

export default function WeatherMatchPage() {
  const { sha } = load();
  const paceBand = paceBandCourses();

  return (
    <div className="container tool-page">
      <ToolHeader slug="weather-match" />
      <WeatherMatch sha={sha} paceBand={paceBand} />
      <ToolNext current="weather-match" />
    </div>
  );
}
