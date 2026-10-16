import { UnitLink as Link } from '@/components/UnitsProvider';
import { ElevationProfile } from '@/components/story/CourseArt';
import { Distance, Elevation, Section } from '@/components/story/Units';
import type { CoursePageData } from '@/lib/course-page';
import { CourseSection, CourseTable, Fact } from './Fact';
import { NetElevation } from './CourseUnits';

const FULL_KM = 42.195;
/** The course chooser's downhill opening: the first 5 km of the supplied route drops more than 25 m net. */
const DOWNHILL_OPENING_M = 25;

/**
 * "Elevation profile": the supplied current route, with its two climb totals each labelled by how it was measured (the
 * smoothed whole-route profile, and the sum of the nine 5 km sections the tools use), and the sections themselves.
 * Only for courses with a supplied route.
 */
export default function CourseElevation({ page }: { page: CoursePageData }) {
  const { geometry: g, context, terrain, city, scopes } = page;
  if (!g) return null;
  const sums = context && context.gain_m !== null && context.loss_m !== null && context.net_m !== null ? { gain: context.gain_m, loss: context.loss_m, net: context.net_m } : null;
  return (
    <CourseSection id="elevation" track="chapter-3" kicker="Elevation" title="Elevation profile"
      dek={<>The supplied route from start to finish, with its climb measured two ways. Current supplied route; context only, not an adjustment.</>}>
      <div className="viz-card course-elevation-card">
        <div className="viz-head"><div><p className="viz-title">{city} supplied route profile</p><p className="viz-sub">Elevation along the supplied route, start to finish</p></div></div>
        <ElevationProfile course={g} height={190} />
      </div>
      <dl className="course-totals">
        <div>
          <dt>Smoothed route profile</dt>
          <dd>Climbs <Fact k="geo.gain" v={g.gain_m}><Elevation metres={g.gain_m} /></Fact>, descends <Fact k="geo.loss" v={g.loss_m}><Elevation metres={g.loss_m} /></Fact></dd>
          <dd className="course-totals-how">Measured along the whole smoothed profile drawn above.</dd>
        </div>
        {sums ? (
          <div>
            <dt>Sum of the 5 km sections</dt>
            <dd>Climbs <Fact k="cg.gain" v={sums.gain}><Elevation metres={sums.gain} /></Fact>, descends <Fact k="cg.loss" v={sums.loss}><Elevation metres={sums.loss} /></Fact>, net <Fact k="cg.net" v={sums.net}><NetElevation metres={sums.net} /></Fact></dd>
            <dd className="course-totals-how">The nine sections’ climbs and descents added up, as the tools count them. The source applies its own ascent and descent thresholds per section, so this total differs from the profile’s.</dd>
          </div>
        ) : null}
      </dl>
      {terrain ? (
        <CourseTable id="elevation-caption" caption="Climb, descent and net change in each 5 km section of the supplied route">
          <thead><tr><th scope="col">Section</th><th scope="col">Climb</th><th scope="col">Descent</th><th scope="col">Net</th></tr></thead>
          <tbody>
            {terrain.map((t, i) => (
              <tr key={i}>
                <th scope="row"><Section i={i} /></th>
                <td><Fact k={`t.gain@${i}`} v={t.gain_m}><Elevation metres={t.gain_m} /></Fact></td>
                <td><Fact k={`t.loss@${i}`} v={t.loss_m}><Elevation metres={t.loss_m} /></Fact></td>
                <td><Fact k={`t.net@${i}`} v={t.net_m}><NetElevation metres={t.net_m} /></Fact></td>
              </tr>
            ))}
          </tbody>
        </CourseTable>
      ) : null}
      {terrain ? <p className="course-note">Each 5 km section of the supplied current route, as the tools and the race reports use it.</p> : null}
      {context?.downhill_opening ? <p className="course-note">A downhill opening: the first 5 km of the supplied route drops more than <Elevation metres={DOWNHILL_OPENING_M} /> net, the course chooser’s mark.</p> : null}
      {g.distance_km < FULL_KM ? <p className="course-note">The supplied profile covers <Fact k="geo.distance2" v={g.distance_km}><Distance km={g.distance_km} digits={2} /></Fact>, a little short of the full marathon distance.</p> : null}
      <p className="course-note">{context?.terrain_note ?? 'Supplied current route profile; historical routes may differ.'} Whether earlier editions ran this exact route is not known, and no time on this page is adjusted for elevation.
        {scopes.hills ? <> <Link href={`/analyses/hills-and-pacing?race=${encodeURIComponent(city)}`}>Hills and pacing on this route</Link>.</> : null}</p>
    </CourseSection>
  );
}
