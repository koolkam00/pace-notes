import { Elevation } from '@/components/story/Units';
import ElevationPace from '@/components/viz/ElevationPace';
import { getNugget } from '@/lib/nuggets';
import { sectionLabel } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import type { UnitSystem } from '@/lib/units';
import { SECTION_BOUNDS, signedPct } from '@/lib/viz/format';
import ByUnits from './ByUnits.client';
import { CourseSection, Fact, Said } from './Fact';

const climbText = (m: number, units: UnitSystem) => (units === 'mi' ? `${Math.round(m / 0.3048).toLocaleString('en-US')} ft` : `${Math.round(m).toLocaleString('en-US')} m`);

/**
 * "#elevation" (only with a supplied route): the route's profile on the one height scale every course page shares, with
 * each 5K section's pace against the course's own average under it, the biggest climb washed. Scrub along the course:
 * the readout gives one climb, that section's. Under it the route's two totals, up and down.
 */
export default function CourseElevation({ page }: { page: CoursePageData }) {
  const { city, display, geometry: g, terrain, summary: s, relief } = page;
  if (!g) return null;
  const n = getNugget('course.climb', { city });
  const focus = n.guard ? Number(n.values.section) : undefined;
  const curve = s.curve?.length === 9 ? s.curve : null;
  const km = g.elevation_m.map((_, i) => Math.min(g.distance_km, i * g.elevation_step_km));
  const chart = (units: UnitSystem) => (
    <ElevationPace km={km} metres={g.elevation_m} relief={relief} focus={focus} readoutKeys={['Climb', 'Pace against its average']}
      sections={SECTION_BOUNDS.map(([a, b], i) => ({
        label: sectionLabel(a, b), startKm: a, endKm: b, pct: curve ? curve[i] : 0, display: curve ? signedPct(curve[i], 0) : '—',
        climb: terrain ? climbText(terrain[i].gain_m, units) : '—',
      }))}
      label={`${display}: elevation on the height scale every course shares, with each 5K section's pace against the course's own average`} height={120} heightMd={190} />
  );
  return (
    <CourseSection id="elevation" track="chapter-3" beat="Elevation" title={<Said nugget={n} />}>
      <ByUnits mi={chart('mi')} km={chart('km')} />
      <dl className="course-totals">
        <div>
          <dt>Whole route</dt>
          <dd>Climbs <Fact k="geo.gain" v={g.gain_m}><Elevation metres={g.gain_m} /></Fact>, descends <Fact k="geo.loss" v={g.loss_m}><Elevation metres={g.loss_m} /></Fact></dd>
        </div>
      </dl>
    </CourseSection>
  );
}
