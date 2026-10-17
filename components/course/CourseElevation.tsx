import { UnitLink as Link } from '@/components/UnitsProvider';
import { ElevationProfile } from '@/components/story/CourseArt';
import { Elevation, Section } from '@/components/story/Units';
import type { CoursePageData } from '@/lib/course-page';
import { CourseSection, CourseTable, Fact } from './Fact';
import { NetElevation } from './CourseUnits';

/**
 * "Elevation profile": the route and its climb, as two totals where the course chooser publishes the section sum (not
 * Prague, all of whose editions it screens out), then the nine 5 km sections. Only for courses with a route.
 */
export default function CourseElevation({ page }: { page: CoursePageData }) {
  const { geometry: g, context, terrain, city, race, scopes } = page;
  if (!g) return null;
  const sums = context && context.gain_m !== null && context.loss_m !== null && context.net_m !== null ? { gain: context.gain_m, loss: context.loss_m, net: context.net_m } : null;
  return (
    <CourseSection id="elevation" track="chapter-3" kicker="Elevation" title="Elevation profile"
      dek={<>Where the {race} climbs and descends, from start to finish.</>}>
      <div className="viz-card course-elevation-card">
        <div className="viz-head"><div><p className="viz-title">{city} elevation profile</p><p className="viz-sub">Start to finish</p></div></div>
        <ElevationProfile course={g} height={190} />
      </div>
      <dl className="course-totals">
        <div>
          <dt>Whole route</dt>
          <dd>Climbs <Fact k="geo.gain" v={g.gain_m}><Elevation metres={g.gain_m} /></Fact>, descends <Fact k="geo.loss" v={g.loss_m}><Elevation metres={g.loss_m} /></Fact></dd>
        </div>
        {sums ? (
          <div>
            <dt>Sum of the 5 km sections</dt>
            <dd>Climbs <Fact k="cg.gain" v={sums.gain}><Elevation metres={sums.gain} /></Fact>, descends <Fact k="cg.loss" v={sums.loss}><Elevation metres={sums.loss} /></Fact>, net <Fact k="cg.net" v={sums.net}><NetElevation metres={sums.net} /></Fact></dd>
          </div>
        ) : null}
      </dl>
      {terrain ? (
        <CourseTable id="elevation-caption" caption="Climb, descent and net change in each 5 km section">
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
      {context?.downhill_opening ? <p className="course-note">The course opens downhill{terrain ? <>: <Fact k="t.net@0" v={terrain[0].net_m}><NetElevation metres={terrain[0].net_m} /></Fact> net over <Section i={0} /></> : null}.</p> : null}
      {scopes.hills ? <p className="course-note"><Link href={`/analyses/hills-and-pacing?race=${encodeURIComponent(city)}`}>Hills and pacing on this route</Link>: the section paces of finishes near a time beside this profile.</p> : null}
    </CourseSection>
  );
}
