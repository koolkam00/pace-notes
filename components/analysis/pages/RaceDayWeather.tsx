import Receipt from '@/components/ui/Receipt';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import WeatherAnalysis from '@/components/WeatherAnalysis';
import AnalysisShell, { ExploreBeat } from '../Shell';
import ByUnits from '../ByUnits.client';
import WeatherTabs from '../WeatherTabs.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getWeatherEvidence } from '@/lib/weather-data';
import { getNugget } from '@/lib/nuggets';
import { tempBand } from '@/lib/nuggets/analyses';
import { pct } from '@/lib/nuggets/format';
import type { UnitSystem } from '@/lib/units';

const PATH = '/analyses/race-day-weather';
const cap = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

/**
 * Chapter 09, page 2: three answers in tabs (start temperature, warming through the race, wind at the start), each shown
 * only when its evidence is ready, then Make it yours for start temperatures. #warming and #wind open their tabs, so the
 * old weather pages' redirects land on them.
 */
export default function RaceDayWeather() {
  const definition = analysisBySlug('race-day-weather')!;
  const { summary, answers } = getAnalysisStart();
  const start = getAllFinisherContextStart('weather');
  const evidence = getWeatherEvidence();
  const n = getNugget('weather.start');
  const bands = start.initial.weather.filter((g) => g.n >= 100).sort((a, b) => (a.upper_c ?? Infinity) - (b.upper_c ?? Infinity));
  const low = bands.reduce((a, b) => (b.slowdown_pct < a.slowdown_pct ? b : a), bands[0]);
  const receipt = (u: UnitSystem) => (
    <Receipt kicker="Sustained slowdown by start temperature"
      lines={[bands[0], bands[bands.length - 1]].filter((g, i, all) => g && g !== low && all.indexOf(g) === i).map((g) => ({ label: cap(tempBand(g, u)), key: g === bands[0] ? 'the coolest starts' : 'the warmest starts', value: pct(g.slowdown_pct / 100) }))}
      result={{ label: `${cap(tempBand(low, u))}, the fewest`, value: pct(low.slowdown_pct / 100), sr: `${pct(low.slowdown_pct / 100)} at ${tempBand(low, u)}` }} />
  );
  const ready = (id: 'warming' | 'wind') => evidence.candidates.find((c) => c.id === id && c.status === 'ready');
  const panel = (id: 'warming' | 'wind') => {
    const candidate = ready(id);
    if (!candidate) return null;
    const nugget = getNugget(id === 'warming' ? 'weather.warming' : 'weather.wind');
    return <WeatherAnalysis candidate={candidate} evidence={evidence} sentence={nugget.guard ? nugget.headline : nugget.fallback} />;
  };
  const tabs = [
    { id: 'temperature', label: 'Start temperature', panel: <ByUnits mi={receipt('mi')} km={receipt('km')} /> },
    ...(['warming', 'wind'] as const).flatMap((id) => { const p = panel(id); return p ? [{ id, label: id === 'warming' ? 'Warming' : 'Wind', panel: p }] : []; }),
  ];
  const historyDefinition = { ...definition, dek: 'See how finish times compared with the same runners’ earlier bests in cooler and warmer races.' };
  return (
    <AnalysisShell path={PATH} title={n} titleTerm dek={definition.title} answer={<WeatherTabs tabs={tabs} />}>
      <ExploreBeat track="chapter-1">
        <AllFinisherAnalysis kind="weather" start={start} linkTerm={false}
          history={<AnalysisExplorer definition={historyDefinition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} historyMode />} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
