import { Elevation } from '@/components/story/Units';
import ElevationPace from '@/components/viz/ElevationPace';
import { getNugget } from '@/lib/nuggets';
import { profileUnderWater } from '@/lib/nuggets/courses';
import { sectionLabel } from '@/lib/nuggets/format';
import { routeClimb, type CoursePageData } from '@/lib/course-page';
import type { UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS, signedPct } from '@/lib/viz/format';
import ByUnits from '@/components/ui/ByUnits.client';
import { CourseSection, Fact, Said } from './Fact';

const climbText = (m: number, units: UnitSystem) => (units === 'mi' ? `${Math.round(m / 0.3048).toLocaleString('en-US')} ft` : `${Math.round(m).toLocaleString('en-US')} m`);

/**
 * Whether a course shows #elevation: a supplied route whose profile does not read the water under a bridge (New York and
 * Dubai: a profile that misstates the climbs is not drawn, and no climb is printed from it), and something to show on it,
 * the 5K pace blocks or a climb the heading can name (Prague's flat profile with neither only restated the hero's climb).
 */
export function elevationShown(page: CoursePageData): boolean {
  if (!page.geometry || profileUnderWater(page)) return false;
  return page.summary.curve?.length === 9 || getNugget('course.climb', { city: page.city }).guard;
}

/**
 * "#elevation" (only with a supplied route): the route's profile on the one height scale every course page shares, the
 * plot only as tall as this course's relief on it (a flat course is a low profile, never an empty box), with each 5K
 * section's pace against the course's own average under it, the biggest climb washed. Scrub along the course: the
 * readout leads with that section's climb, the number the heading gives, and its pace beside it. Under it the route's
 * two totals, up and down (the sums of the same sections, so the whole never climbs less than a part).
 */
export default function CourseElevation({ page }: { page: CoursePageData }) {
  const { city, display, geometry: g, terrain, summary: s, relief } = page;
  if (!g || !elevationShown(page)) return null;
  const n = getNugget('course.climb', { city });
  // The route's totals are its sections' sums, the same climbs the readout gives one 5K at a time.
  const climb = routeClimb(page);
  // The section the sentence names (the biggest climb, or the most any 5K climbs): washed when it is a climb, and the
  // section the readout opens on either way, so the readout gives the climb the sentence says.
  const from = Number(n.values.section), to = Number(n.values.section_to);
  // Two neighbouring climbs within 10% of each other are named as one stretch ("25–35K: 334 ft"): the chart draws them as
  // one block, its climb their sum and its pace their average (two 5Ks of equal length), so the readout opens on the
  // stretch the heading names, never on half of it.
  const merged = n.guard && Number.isInteger(to) && to === from + 1 ? from : -1;
  const focus = n.guard ? from : undefined;
  const opens = Number.isInteger(from) && from >= 0 ? from : undefined;
  const curve = s.curve?.length === 9 ? s.curve : null;
  const km = g.elevation_m.map((_, i) => Math.min(g.distance_km, i * g.elevation_step_km));
  // The readout leads with the section's climb (the sentence's number); beside it, the section's pace against the
  // course's own average, or without a pacing shape (no blocks), its descent.
  const sectionsFor = (units: UnitSystem) => {
    const all = SECTION_BOUNDS.map(([a, b], i) => ({
      label: sectionLabel(a, b), startKm: a, endKm: b, pct: curve ? curve[i] : 0,
      display: curve ? signedPct(curve[i], 0) : terrain ? climbText(terrain[i].loss_m, units) : '—',
      climb: terrain ? climbText(terrain[i].gain_m, units) : '—',
    }));
    if (merged < 0) return all;
    const [a, b] = [merged, merged + 1];
    const pace = curve ? (curve[a] + curve[b]) / 2 : 0;
    const stretch = {
      label: sectionLabel(SECTION_BOUNDS[a][0], SECTION_BOUNDS[b][1]), startKm: SECTION_BOUNDS[a][0], endKm: SECTION_BOUNDS[b][1], pct: pace,
      display: curve ? signedPct(pace, 0) : terrain ? climbText(terrain[a].loss_m + terrain[b].loss_m, units) : '—',
      climb: terrain ? climbText(terrain[a].gain_m + terrain[b].gain_m, units) : '—',
    };
    return [...all.slice(0, a), stretch, ...all.slice(b + 1)];
  };
  const chart = (units: UnitSystem) => (
    <ElevationPace km={km} metres={g.elevation_m} relief={relief} fit lead="climb" focus={focus} initial={opens} readoutKeys={curve ? ['Climb', 'Pace against its average'] : ['Climb', 'Descent']}
      sections={sectionsFor(units)}
      label={`${display}: elevation on the height scale every course shares, with each 5K section's pace against the course's own average`} height={120} heightMd={190} />
  );
  return (
    <CourseSection id="elevation" track="chapter-3" beat="Elevation" title={<Said nugget={n} />}>
      <div className={curve ? undefined : 'course-elevation-plain'}><ByUnits mi={chart('mi')} km={chart('km')} /></div>
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
