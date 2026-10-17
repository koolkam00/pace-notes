import Receipt from '@/components/ui/Receipt';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import ByUnits from '../ByUnits.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisAnswers, getCityData, getTerrainContrast, getTerrainDefault, terrainSections } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getPersonalSummary } from '@/lib/personalized-data';
import { readInsight } from '@/lib/insights-server';
import type { CourseGeometry } from '@/lib/insights';
import { getNugget } from '@/lib/nuggets';
import { courseName } from '@/lib/nuggets/analyses';
import { hm, sectionLabel } from '@/lib/nuggets/format';
import { MARATHON_SECTION_ENDS } from '@/lib/section-labels';
import { elevationValue, type UnitSystem } from '@/lib/units';

const PATH = '/analyses/hills-and-pacing';
const elevation = (m: number, u: UnitSystem) => `${Math.round(elevationValue(m, u)).toLocaleString('en-US')} ${u === 'mi' ? 'ft' : 'm'}`;
const section = (i: number) => sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, MARATHON_SECTION_ENDS[i]);

/** Chapter 08, page 3: the course the data picks, its biggest climb and its slowest 5K, then Make it yours. */
export default function HillsPacing() {
  const definition = analysisBySlug('hills-and-pacing')!;
  const summary = getPersonalSummary()!;
  const { city } = getTerrainDefault();
  // Make it yours opens on a second course, so it adds an example rather than repeating the answer above it.
  const start = { ...EXAMPLE_PROFILE, city: getTerrainContrast() };
  const n = getNugget('terrain.climb');
  const sections = terrainSections(getCityData(city));
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  // One height scale for every course: 0 to the largest relief in the release, rounded up to 50 m (spec section 3.6).
  const relief = Math.ceil(Math.max(...geometry.map((g) => g.max_m - g.min_m)) / 50) * 50;
  const step = geometry[0]?.elevation_step_km ?? 0.5;
  const elevations = Object.fromEntries(geometry.filter((g) => g.elevation_step_km === step && summary.cities.some((c) => c.city === g.city)).map((g) => [g.city, g.elevation_m.map((m) => Math.round(m * 10) / 10)]));
  const v = n.values as { climb_i: number; slow_i: number; climb_m: number; slow_pct: number; total_m: number; goal_min: number };
  const pctText = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(Math.round(p))}%`;
  const receipt = (u: UnitSystem) => (
    <Receipt kicker={`${courseName(city)}, finishes near ${hm(v.goal_min)}`}
      lines={[
        { label: `Climb, ${section(v.climb_i)}`, value: `+${elevation(v.climb_m, u)}` },
        { label: `Pace, ${section(v.climb_i)}`, key: 'against the finishes’ own average', value: pctText(sections?.[v.climb_i]?.pct ?? v.slow_pct) },
        { label: 'Climb, start to finish', value: elevation(v.total_m, u) },
      ]}
      result={{ label: n.guard ? 'The biggest climb and the slowest 5K' : 'The biggest climb', value: section(v.climb_i), sr: section(v.climb_i), fallback: n.guard ? undefined : `Biggest climb ${section(v.climb_i)}; slowest 5K ${section(v.slow_i)}` }} />
  );
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={sections ? <ByUnits mi={receipt('mi')} km={receipt('km')} /> : null}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={getAnalysisAnswers(start).find((a) => a.id === definition.id)!} start={start} terrain={{ elevations, step, relief }} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
