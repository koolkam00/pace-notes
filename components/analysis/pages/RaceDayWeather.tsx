import Values from '@/components/ui/Values';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import WeatherAnalysis from '@/components/WeatherAnalysis';
import AnalysisShell, { AnswerCard, ExploreBeat, Say } from '../Shell';
import Columns from '@/components/viz/Columns';
import ByUnits from '@/components/ui/ByUnits.client';
import WeatherTabs from '../WeatherTabs.client';
import TabTitle from '../TabTitle.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { publishedCourses } from '@/lib/analysis-server';
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
  const raw = getAllFinisherContextStart('weather');
  const start = { ...raw, cities: publishedCourses(raw.cities) };
  const evidence = getWeatherEvidence();
  const n = getNugget('weather.start');
  const bands = start.initial.weather.filter((g) => g.n >= 100).sort((a, b) => (a.upper_c ?? Infinity) - (b.upper_c ?? Infinity));
  // The fewest sustained slowdowns among bands with five or more races (the H1's band) is the signal column; a band with
  // fewer races is hollow and keyed, never the finding.
  const steady = bands.filter((g) => g.edition_n >= 5);
  const low = steady.reduce<(typeof bands)[number] | undefined>((a, b) => (!a || b.slowdown_pct < a.slowdown_pct ? b : a), undefined);
  const top = Math.ceil(Math.max(...bands.map((g) => g.slowdown_pct)) / 10) * 10 + 5;
  const columns = (u: UnitSystem) => (
    <AnswerCard kicker={`By start temperature, ${u === 'mi' ? '°F' : '°C'}`}>
      <Columns items={bands.map((g) => ({ id: g.id, label: bandShort(g, u, false), value: g.slowdown_pct, display: pct(g.slowdown_pct / 100), tone: g.edition_n < 5 ? 'hollow' : g === low ? 'signal' : 'ink' }))}
        max={top} keys={bands.some((g) => g.edition_n < 5) ? [{ label: 'Fewer than five races', mark: 'hollow' }] : undefined}
        label={`Sustained slowdown by start temperature, from ${bands.map((g) => `${tempBand(g, u)} ${pct(g.slowdown_pct / 100)}`).join(', ')}${low ? `; the fewest at ${tempBand(low, u)}` : ''}`}
        values={<Values id={`rdw-bands-${u}`} caption="Sustained slowdown by start temperature" columns={[{ key: 't', label: 'At the start', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'r', label: 'Races' }, { key: 'n', label: 'Finishes' }]}
          rows={bands.map((g) => [cap(tempBand(g, u)), pct(g.slowdown_pct / 100), g.edition_n, count(g.n)])} reading={low ? bands.indexOf(low) : undefined} />} />
    </AnswerCard>
  );
  const ready = (id: 'warming' | 'wind') => evidence.candidates.find((c) => c.id === id && c.status === 'ready');
  // The base the warming tab's points are on: how much slower the second 20K ran than the first in the median race.
  const changes = evidence.editions.map((e) => e.pace_change_pct).filter(Number.isFinite).sort((a, b) => a - b);
  const typical = changes.length ? (changes[Math.floor((changes.length - 1) / 2)] + changes[Math.ceil((changes.length - 1) / 2)]) / 2 : NaN;
  const nuggets = { warming: getNugget('weather.warming'), wind: getNugget('weather.wind') };
  // Each tab's finding is the page's H1 while that tab is selected (TabTitle), one clause; its setup or base is the dek
  // under it, so the panel carries no second headline.
  const tabs = [
    { id: 'temperature', label: 'Start temperature', title: <Say nugget={n} term />, dek: n.guard ? 'The coolest start wasn’t the steadiest.' : definition.title, panel: <ByUnits mi={columns('mi')} km={columns('km')} /> },
    ...(['warming', 'wind'] as const).flatMap((id) => {
      const candidate = ready(id);
      if (!candidate) return [];
      const dek = !nuggets[id].guard ? definition.title
        : id === 'warming' ? (Number.isFinite(typical) ? `In the median race the second 20K ran ${Math.round(typical)}% slower than the first.` : definition.title)
          : 'The second 20K changed by less than a point either way.';
      return [{ id, label: id === 'warming' ? 'Warming' : 'Wind', title: <Say nugget={nuggets[id]} quiet={id === 'wind'} />, dek, panel: <WeatherAnalysis candidate={candidate} evidence={evidence} /> }];
    }),
  ];
  return (
    <AnalysisShell path={PATH} title={n} heading={<TabTitle titles={tabs.map(({ id, title }) => ({ id, title }))} />} dek={<TabTitle titles={tabs.map(({ id, dek }) => ({ id, title: dek }))} />}
      answer={<WeatherTabs tabs={tabs.map(({ id, label, panel }) => ({ id, label, panel }))} />}>
      <ExploreBeat track="chapter-1">
        <AllFinisherAnalysis kind="weather" start={start} linkTerm={false} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
