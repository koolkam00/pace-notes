import WeatherMatch from '@/components/tools/WeatherMatch';
import { ToolEnd, ToolHeader } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { WeatherMatch as WeatherMatchData } from '@/lib/tools/data';

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

export default function WeatherMatchPage() {
  const { sha } = load();

  return (
    <div className="tool-page">
      <ToolHeader slug="weather-match" />
      <WeatherMatch sha={sha} how="/methodology#tools-weather-match" />
      <ToolEnd path="/tools/weather-match" how="/methodology#tools-weather-match" numbers />
    </div>
  );
}
