import { Elevation } from '@/components/story/Units';
import ElevationPace from '@/components/viz/ElevationPace';
import { getNugget } from '@/lib/nuggets';
import { profileUnderWater } from '@/lib/nuggets/courses';
import { sectionLabel } from '@/lib/nuggets/format';
import { routeClimb, type CoursePageData } from '@/lib/course-page';
import { getCityData, terrainSections } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { hm } from '@/lib/nuggets/format';
import { signedWhole, terrainReading } from '@/lib/terrain-reading';
import type { UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS } from '@/lib/viz/format';
import ByUnits from '@/components/ui/ByUnits.client';
import { CourseSection, Fact, Said } from './Fact';

const climbText = (m: number, units: UnitSystem) => (units === 'mi' ? `${Math.round(m / 0.3048).toLocaleString('en-US')} ft` : `${Math.round(m).toLocaleString('en-US')} m`);

/**
 * Whether a course shows #elevation: a supplied route whose profile does not read the water under a bridge (New York and
 * Dubai: a profile that misstates the climbs is not drawn, and no climb is printed from it), with a climb the heading can
 * name (course.climb: a 5K that climbs 30 m or more). On a flat course the beat would only say no 5K climbs much and
 * invite reading the late fade every course has as a hill (critic round 4); the hero already gives the route's climb,
 * and "All numbers" each 5K's.
 */
export function elevationShown(page: CoursePageData): boolean {
  if (!page.geometry || profileUnderWater(page)) return false;
  return getNugget('course.climb', { city: page.city }).guard;
}

/** Each 5K's pace near the example finish against the same 5K on every course combined (the hills page's reading), or null. */
function againstEvery(city: string) {
  try {
    return terrainSections(getCityData(city));
  } catch {
    return null;
  }
}

/**
 * "#elevation" (only for a route with a climb): the route's profile on the one height scale every course page shares,
 * the plot only as tall as this course's relief on it, with nine 5K blocks under it, never merged: each 5K's pace near
 * 4:00 against the same 5K on every course combined, the hills page's reading (lib/terrain-reading.ts), so the course
 * page and /analyses/hills-and-pacing tell one story and the late fade every course has is not read as this course's
 * hill. The climb the heading names is washed (two neighbouring climbs named as one stretch wash both), and the readout
 * opens on its 5K: the one the hills reading names where it is in the stretch, else the bigger climb. Scrub along the
 * course: the readout leads with the section's climb and gives its pace against every course beside it. Under it the
 * route's two totals, up and down (the sums of the same sections, so the whole never climbs less than a part).
 */
export default function CourseElevation({ page }: { page: CoursePageData }) {
  const { city, display, geometry: g, terrain, relief } = page;
  if (!g || !elevationShown(page)) return null;
  const n = getNugget('course.climb', { city });
  // The route's totals are its sections' sums, the same climbs the readout gives one 5K at a time.
  const climb = routeClimb(page);
  const from = Number(n.values.section), to = Number(n.values.section_to);
  const every = againstEvery(city);
  const vs = every?.map((x) => x.vs) ?? null;
  const reading = every ? terrainReading(every.map((x) => x.gain), every.map((x) => x.vs)) : null;
  // The 5K the readout opens on: the hills reading's, inside the washed stretch; else the stretch's bigger climb.
  const bigger = terrain && to > from && terrain[to].gain_m > terrain[from].gain_m ? to : from;
  const opens = reading && reading.i >= from && reading.i <= to ? reading.i : bigger;
  const km = g.elevation_m.map((_, i) => Math.min(g.distance_km, i * g.elevation_step_km));
  const goal = hm(EXAMPLE_PROFILE.goal);
  const sectionsFor = (units: UnitSystem) => SECTION_BOUNDS.map(([a, b], i) => ({
    label: sectionLabel(a, b), startKm: a, endKm: b, pct: vs ? vs[i] : 0,
    display: vs ? signedWhole(vs[i]) : terrain ? climbText(terrain[i].loss_m, units) : '—',
    climb: terrain ? climbText(terrain[i].gain_m, units) : '—',
  }));
  const chart = (units: UnitSystem) => (
    <ElevationPace km={km} metres={g.elevation_m} relief={relief} fit lead="climb" focus={from} focusTo={to} initial={opens}
      readoutKeys={vs ? ['Climbing', `Against every course near ${goal}`] : ['Climbing', 'Descent']}
      sections={sectionsFor(units)}
      label={`${display}: elevation on the height scale every course shares${vs ? `, with each 5K's pace near ${goal} against the same 5K on every course` : ''}`} height={120} heightMd={190} />
  );
  return (
    <CourseSection id="elevation" track="chapter-3" beat="Elevation" title={<Said nugget={n} />}>
      <div className={vs ? undefined : 'course-elevation-plain'}><ByUnits mi={chart('mi')} km={chart('km')} /></div>
      {climb ? (
        <dl className="course-totals">
          <div>
            <dt>Whole route</dt>
            <dd>Climbs <Fact k={`${climb.key}.gain`} v={climb.gain_m}><Elevation metres={climb.gain_m} /></Fact>, descends <Fact k={`${climb.key}.loss`} v={climb.loss_m}><Elevation metres={climb.loss_m} /></Fact></dd>
          </div>
        </dl>
      ) : null}
    </CourseSection>
  );
}
