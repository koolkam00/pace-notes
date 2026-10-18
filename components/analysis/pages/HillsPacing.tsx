import ElevationPace from '@/components/viz/ElevationPace';
import Values from '@/components/ui/Values';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ByUnits from '../ByUnits.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisAnswers, getCityData, getTerrainDefault, terrainSections } from '@/lib/analysis-server';
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
const signedPct = (p: number) => { const r = Math.round(p); return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}%`; };

/**
 * Chapter 08, page 3 (the redesign spec, section 7.10): the course the data picks, drawn on the height scale every course
 * shares, its biggest climb washed and the needle on it, each 5K's pace against the finishes' own average under it. Then
 * Make it yours: until the visitor picks another course or time it is the selection row alone, since the answer above
 * already draws this course.
 */
export default function HillsPacing() {
  const definition = analysisBySlug('hills-and-pacing')!;
  const summary = getPersonalSummary()!;
  const { city } = getTerrainDefault();
  const start = { ...EXAMPLE_PROFILE, city };
  const n = getNugget('terrain.climb');
  const sections = terrainSections(getCityData(city));
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  // The explorer draws every course on one height scale: 0 to the largest relief in the release, rounded up to 50 m
  // (spec section 3.6). The answer is about one course's climbs, so it uses that course's own relief (rounded up to
  // 25 m, at least 50 m) and labels the top of it.
  const relief = Math.ceil(Math.max(...geometry.map((g) => g.max_m - g.min_m)) / 50) * 50;
  const step = geometry[0]?.elevation_step_km ?? 0.5;
  const elevations = Object.fromEntries(geometry.filter((g) => g.elevation_step_km === step && summary.cities.some((c) => c.city === g.city)).map((g) => [g.city, g.elevation_m.map((m) => Math.round(m * 10) / 10)]));
  const v = n.values as { climb_i: number; slow_i: number; climb_m: number; total_m: number; goal_min: number };
  // The supplied route's profile where there is one, else the section nets joined end to end.
  const route = elevations[city] as number[] | undefined;
  let h = 0;
  const km = route ? route.map((_, i) => Math.min(42.195, i * step)) : [0, ...MARATHON_SECTION_ENDS];
  const metres = route ?? [0, ...(sections ?? []).map((s) => (h += Number.isFinite(s.net) ? s.net : 0))];
  const own = Math.max(50, Math.ceil((Math.max(...metres) - Math.min(...metres)) / 25) * 25);
  const chart = (u: UnitSystem) => sections ? (
    <ElevationPace km={km} metres={metres} relief={own} reliefLabel={elevation(own, u)} focus={v.climb_i} readoutKeys={['Climb', 'Pace against its average']}
      sections={sections.map((s, i) => ({ label: sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, s.end), startKm: i ? MARATHON_SECTION_ENDS[i - 1] : 0, endKm: s.end, pct: s.pct, display: signedPct(s.pct), climb: Number.isFinite(s.gain) ? `+${elevation(s.gain, u)}` : '—' }))}
      label={`${courseName(city)}'s elevation, its top line ${elevation(own, u)} above its lowest point, with each 5K's pace against the finishes' own average; the biggest climb, ${sectionLabel(v.climb_i ? MARATHON_SECTION_ENDS[v.climb_i - 1] : 0, MARATHON_SECTION_ENDS[v.climb_i])}, is washed`}
      values={<Values id={`hills-answer-${u}`} caption={`${courseName(city)} by section: the climb and the pace against its own average`} columns={[{ key: 's', label: 'Section' }, { key: 'c', label: 'Climb' }, { key: 'p', label: 'Pace against its average' }]}
        rows={sections.map((s, i) => [sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, s.end), Number.isFinite(s.gain) ? `+${elevation(s.gain, u)}` : '—', signedPct(s.pct)])} reading={v.climb_i} />} />
  ) : null;
  const answer = sections ? (
    <AnswerCard kicker={`${courseName(city)}, finishes near ${hm(v.goal_min)}`} foot={<ByUnits mi={`${elevation(v.total_m, 'mi')} of climb, start to finish`} km={`${elevation(v.total_m, 'km')} of climb, start to finish`} />}>
      <ByUnits mi={chart('mi')} km={chart('km')} />
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={getAnalysisAnswers(start).find((a) => a.id === definition.id)!} start={start} terrain={{ elevations, step, relief }} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
