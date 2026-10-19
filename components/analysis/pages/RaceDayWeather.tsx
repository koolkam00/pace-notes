import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import WeatherAnalysis from '@/components/WeatherAnalysis';
import AnalysisShell, { AnswerCard, ExploreBeat, Say, said } from '../Shell';
import HeroSwap from '../HeroSwap.client';
import { bandColumns } from '../all-finisher-hero';
import ByUnits from '@/components/ui/ByUnits.client';
import WeatherTabs from '../WeatherTabs.client';
import TabTitle from '../TabTitle.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { publishedCourses } from '@/lib/analysis-server';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getWeatherEvidence } from '@/lib/weather-data';
import { getNugget } from '@/lib/nuggets';
import { temp } from '@/lib/nuggets/format';
import { UnitLink as Link } from '@/components/UnitsProvider';
import type { UnitSystem } from '@/lib/units';

const PATH = '/analyses/race-day-weather';

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
  // fewer races is hollow and keyed, never the finding. Drawn by all-finisher-hero.tsx, as a Make it yours selection
  // redraws it on this card (HeroSwap).
  const low = bands.filter((g) => g.edition_n >= 5).reduce<(typeof bands)[number] | undefined>((a, b) => (!a || b.slowdown_pct < a.slowdown_pct ? b : a), undefined);
  const parts = (u: UnitSystem) => bandColumns(start.initial.weather, u, { id: `rdw-bands-${u}` });
  const mi = parts('mi'), km = parts('km');
  const columns = mi && km ? (
    <AnswerCard values={<HeroSwap slot="values"><ByUnits mi={mi.values} km={km.values} /></HeroSwap>}>
      <HeroSwap kicker={<ByUnits mi={mi.kicker} km={km.kicker} />}><ByUnits mi={mi.chart} km={km.chart} /></HeroSwap>
    </AnswerCard>
  ) : null;
  // The term is linked here, under the H1, never in it (a dotted underline in the display face outweighed the accent).
  // Below the steadiest band the share rose again when every colder band (100 finishes or more) had more.
  const colder = low && low.lower_c != null ? bands.filter((g) => g.upper_c != null && g.upper_c <= low.lower_c!) : [];
  const rose = !!low && colder.length > 0 && colder.every((g) => g.slowdown_pct > low.slowdown_pct);
  const term = <Link href={n.term ?? '/methodology#sustained-slowdown'} className="term-link">sustained slowdown</Link>;
  const temperatureDek = n.guard && rose && low?.lower_c != null
    ? <>The coolest start wasn’t the steadiest: below <ByUnits mi={temp(low.lower_c, 'mi')} km={temp(low.lower_c, 'km')} />, the share with a {term} rose again.</>
    : <>Each column is the share of finishes with a {term}.</>;
  const ready = (id: 'warming' | 'wind') => evidence.candidates.find((c) => c.id === id && c.status === 'ready');
  // The base the warming tab's points are on: how much slower the second 20K ran than the first in the median race.
  const changes = evidence.editions.map((e) => e.pace_change_pct).filter(Number.isFinite).sort((a, b) => a - b);
  const typical = changes.length ? (changes[Math.floor((changes.length - 1) / 2)] + changes[Math.ceil((changes.length - 1) / 2)]) / 2 : NaN;
  const nuggets = { warming: getNugget('weather.warming'), wind: getNugget('weather.wind') };
  // Each tab's finding is the page's H1 while that tab is selected (TabTitle), one clause; its setup or base is the dek
  // under it, so the panel carries no second headline.
  const tabs = [
    { id: 'temperature', label: 'Start temperature', title: <Say nugget={n} />, dek: temperatureDek, panel: columns },
    ...(['warming', 'wind'] as const).flatMap((id) => {
      const candidate = ready(id);
      if (!candidate) return [];
      const dek = !nuggets[id].guard ? definition.title
        // The points in the H1 said as the percent a runner knows: the median race's second 20K, and that plus the
        // estimate ("8% slower than the first: 2 points more is about 10%").
        : id === 'warming' ? (Number.isFinite(typical) ? `In the median race the second 20K ran ${Math.round(typical)}% slower than the first: ${Math.round(candidate.effect.estimate)} ${Math.round(candidate.effect.estimate) === 1 ? 'point' : 'points'} more is about ${Math.round(typical + candidate.effect.estimate)}%.` : definition.title)
          : 'The second 20K changed by less than a point either way.';
      return [{ id, label: id === 'warming' ? 'Warming' : 'Wind', title: <Say nugget={nuggets[id]} quiet={id === 'wind'} />, dek, panel: <WeatherAnalysis candidate={candidate} evidence={evidence} /> }];
    }),
  ];
  return (
    <AnalysisShell path={PATH} title={n} heading={<TabTitle titles={tabs.map(({ id, title }) => ({ id, title }))} documentTitles={Object.fromEntries((['warming', 'wind'] as const).filter((id) => ready(id)).map((id) => [id, `${said(nuggets[id])} | Pace Notes`]))} />} dek={<TabTitle titles={tabs.map(({ id, dek }) => ({ id, title: dek }))} />}
      answer={<WeatherTabs tabs={tabs.map(({ id, label, panel }) => ({ id, label, panel }))} />}>
      <ExploreBeat track="chapter-1">
        <AllFinisherAnalysis kind="weather" start={start} linkTerm={false} untouched="none" hero />
      </ExploreBeat>
    </AnalysisShell>
  );
}
