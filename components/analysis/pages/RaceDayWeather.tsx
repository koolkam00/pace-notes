import Values from '@/components/ui/Values';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import WeatherAnalysis from '@/components/WeatherAnalysis';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import Columns from '../Columns';
import ByUnits from '../ByUnits.client';
import WeatherTabs from '../WeatherTabs.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getWeatherEvidence } from '@/lib/weather-data';
import { getNugget } from '@/lib/nuggets';
import { tempBand } from '@/lib/nuggets/analyses';
import { count, pct } from '@/lib/nuggets/format';
import { bandShort } from '@/lib/all-finisher-context';
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
  // The fewest sustained slowdowns among bands with five or more races (the H1's band) is the signal column; a band with
  // fewer races is hollow and keyed, never the finding.
  const steady = bands.filter((g) => g.edition_n >= 5);
  const low = steady.reduce<(typeof bands)[number] | undefined>((a, b) => (!a || b.slowdown_pct < a.slowdown_pct ? b : a), undefined);
  const top = Math.ceil(Math.max(...bands.map((g) => g.slowdown_pct)) / 10) * 10 + 5;
  const columns = (u: UnitSystem) => (
    <AnswerCard kicker={`Sustained slowdown by start temperature, ${u === 'mi' ? '°F' : '°C'}`}>
      <Columns items={bands.map((g) => ({ id: g.id, label: bandShort(g, u, false), value: g.slowdown_pct, display: pct(g.slowdown_pct / 100), tone: g.edition_n < 5 ? 'hollow' : g === low ? 'signal' : 'ink' }))}
        max={top} keys={bands.some((g) => g.edition_n < 5) ? [{ label: 'Fewer than five races', mark: 'hollow' }] : undefined}
        label={`Sustained slowdown by start temperature, from ${bands.map((g) => `${tempBand(g, u)} ${pct(g.slowdown_pct / 100)}`).join(', ')}${low ? `; the fewest at ${tempBand(low, u)}` : ''}`}
        values={<Values id={`rdw-bands-${u}`} caption="Sustained slowdown by start temperature" columns={[{ key: 't', label: 'At the start', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'r', label: 'Races' }, { key: 'n', label: 'Finishes' }]}
          rows={bands.map((g) => [cap(tempBand(g, u)), pct(g.slowdown_pct / 100), g.edition_n, count(g.n)])} reading={low ? bands.indexOf(low) : undefined} />} />
    </AnswerCard>
  );
  const ready = (id: 'warming' | 'wind') => evidence.candidates.find((c) => c.id === id && c.status === 'ready');
  const panel = (id: 'warming' | 'wind') => {
    const candidate = ready(id);
    if (!candidate) return null;
    const nugget = getNugget(id === 'warming' ? 'weather.warming' : 'weather.wind');
    return <WeatherAnalysis candidate={candidate} evidence={evidence} sentence={nugget.guard ? nugget.headline : nugget.fallback} />;
  };
  const tabs = [
    { id: 'temperature', label: 'Start temperature', panel: <ByUnits mi={columns('mi')} km={columns('km')} /> },
    ...(['warming', 'wind'] as const).flatMap((id) => { const p = panel(id); return p ? [{ id, label: id === 'warming' ? 'Warming' : 'Wind', panel: p }] : []; }),
  ];
  const historyDefinition = { ...definition, dek: 'See how finish times compared with the same runners’ earlier bests in cooler and warmer races.' };
  return (
    <AnalysisShell path={PATH} title={n} titleTerm dek={definition.title} answer={<WeatherTabs tabs={tabs} />}>
      <ExploreBeat track="chapter-1">
        <AllFinisherAnalysis kind="weather" start={start} linkTerm={false} untouched="none"
          history={<AnalysisExplorer definition={historyDefinition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} historyMode />} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
