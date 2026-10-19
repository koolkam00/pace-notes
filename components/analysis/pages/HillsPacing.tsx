import ElevationPace from '@/components/viz/ElevationPace';
import Values from '@/components/ui/Values';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import ByUnits from '@/components/ui/ByUnits.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisAnswers, getCityData, getTerrainDefault, terrainBaselines, terrainHidden, terrainProfiles, terrainSections } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getPersonalSummary } from '@/lib/personalized-data';
import { signedWhole } from '@/lib/terrain-reading';
import { readInsight } from '@/lib/insights-server';
import type { CourseGeometry } from '@/lib/insights';
import { getNugget } from '@/lib/nuggets';
import { courseName } from '@/lib/nuggets/analyses';
import { hm, sectionLabel } from '@/lib/nuggets/format';
import { MARATHON_SECTION_ENDS } from '@/lib/section-labels';
import { elevationValue, type UnitSystem } from '@/lib/units';

const PATH = '/analyses/hills-and-pacing';
const elevation = (m: number, u: UnitSystem) => `${Math.round(elevationValue(m, u)).toLocaleString('en-US')} ${u === 'mi' ? 'ft' : 'm'}`;

/**
 * Chapter 08, page 3 (the redesign spec, section 7.10): the course the data picks (getTerrainDefault: the climbing 5K
 * that ran slowest against the same 5K on every course combined), drawn on its own height scale (its top line labelled),
 * that climb washed and the needle on it, each 5K's pace against the same 5K elsewhere under it. A course whose profile
 * reads the water under a bridge is never drawn here. Then Make it yours: until the visitor picks another course or
 * time it is the selection row alone, since the answer above already draws this course.
 */
export default function HillsPacing() {
  const definition = analysisBySlug('hills-and-pacing')!;
  const summary = getPersonalSummary()!;
  const { city } = getTerrainDefault();
  const start = { ...EXAMPLE_PROFILE, city };
  const n = getNugget('terrain.climb');
  const sections = terrainSections(getCityData(city));
  const elevations = terrainProfiles();
  const step = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses[0]?.elevation_step_km ?? 0.5;
  const v = n.values as { climb_i: number; goal_min: number };
  // The supplied route's profile (the default is always a drawn route).
  const route = elevations[city] as number[] | undefined;
  let h = 0;
  const km = route ? route.map((_, i) => Math.min(42.195, i * step)) : [0, ...MARATHON_SECTION_ENDS];
  const metres = route ?? [0, ...(sections ?? []).map((s) => (h += Number.isFinite(s.net) ? s.net : 0))];
  // Its own relief (rounded up to 25 m, at least 50 m), the top line labelled with its height above the lowest point, in
  // words: a bare "164 ft" read as the course's altitude.
  const own = Math.max(50, Math.ceil((Math.max(...metres) - Math.min(...metres)) / 25) * 25);
  const scale = (u: UnitSystem) => `${elevation(own, u)} above the low point`;
  const label = (i: number) => sectionLabel(i ? MARATHON_SECTION_ENDS[i - 1] : 0, MARATHON_SECTION_ENDS[i]);
  const climb = (g: number, u: UnitSystem) => (Number.isFinite(g) ? `+${elevation(g, u)}` : '—');
  const net = (d: number, u: UnitSystem) => (!Number.isFinite(d) ? '—' : Math.round(Math.abs(elevationValue(d, u))) === 0 ? '0' : `${d > 0 ? '+' : '−'}${elevation(Math.abs(d), u)}`);
  const chart = (u: UnitSystem) => sections ? (
    <ElevationPace km={km} metres={metres} relief={own} reliefLabel={scale(u)} focus={v.climb_i} readoutKeys={['Climbing', 'Against every course']}
      sections={sections.map((s, i) => ({ label: label(i), startKm: i ? MARATHON_SECTION_ENDS[i - 1] : 0, endKm: s.end, pct: s.vs, display: signedWhole(s.vs), climb: climb(s.gain, u) }))}
      label={`${courseName(city)}'s elevation, its top line ${elevation(own, u)} above its lowest point, with each 5K's pace near ${hm(v.goal_min)} against the same 5K on every course combined; ${label(v.climb_i)}, its climb, is washed`}
      // Climbing is the gain only (Boston's downhill first 5K still climbs 83 ft), so the net change sits beside it.
      values={<Values id={`hills-answer-${u}`} caption={`${courseName(city)} by section: the climbing, the net change, and the pace near ${hm(v.goal_min)} against the same 5K on every course combined`} columns={[{ key: 's', label: 'Section' }, { key: 'c', label: 'Climbing' }, { key: 'n', label: 'Net' }, { key: 'p', label: 'Against elsewhere' }]}
        rows={sections.map((s, i) => [label(i), climb(s.gain, u), net(s.net, u), signedWhole(s.vs)])} reading={v.climb_i} />} />
  ) : null;
  const answer = sections ? (
    // The course and the time, kept on one line each ("near\u00a04:00"); the climb is in the readout.
    <AnswerCard kicker={`${courseName(city)}, finishes near\u00a0${hm(v.goal_min)}`}>
      <ByUnits mi={chart('mi')} km={chart('km')} />
    </AnswerCard>
  ) : null;
  return (
    // The blocks' unit said once (on a phone they drop their % signs): each 5K's pace, in %, against the same 5K elsewhere.
    <AnalysisShell path={PATH} title={n} dek={`Each 5K’s pace near ${hm(v.goal_min)}, in % against the same 5K on every course combined.`} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={getAnalysisAnswers(start).find((a) => a.id === definition.id)!} start={start} terrain={{ elevations, step, baselines: terrainBaselines(), hidden: terrainHidden() }} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
