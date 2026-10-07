import type { CourseGeometry, InsightsManifest, ReplayIndex } from '@/lib/insights';
import { count, hms } from '@/lib/viz/format';
import HeroReplay, { type ReplayChoice } from '../HeroReplay';
import { FieldSpread } from '../MoreCharts';
import { StoryMethods, StorySection } from '../StoryShell';
import { Distance } from '../Units';

export default function ReplayBody({ data, geometry, manifest }: { data: ReplayIndex; geometry: CourseGeometry[]; manifest: InsightsManifest }) {
  const routes = new Map(geometry.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices: ReplayChoice[] = data.editions.map((e) => ({ ...e, version: manifest.files[e.file].sha256, route: routes.get(e.city) ?? null }));
  const ny = data.editions.find((e) => e.city === 'New York') ?? data.editions[0];
  const at3 = ny.snapshots.find((s) => s.clock_s === 10800)!;
  return (
    <>
      <StorySection id="replay" kicker="01 · Press play" title={<>Tens of thousands of runners, <em>one race clock</em>.</>}
        dek={<>Pick a race. Each dot is one recorded finish, moving at its recorded pace through each 5 km section and coloured by how that section compares with the runner&apos;s own 5–20 km pace. Switch to “On the route” to run it on the supplied course map.</>}>
        <div className="night replay-stage"><HeroReplay choices={choices} initial={ny.slug} /></div>
      </StorySection>
      <StorySection id="snapshots" kicker="02 · Snapshots" title={<>At 3:00 on the clock, the field covers <em><Distance km={at3.front10_km - at3.back10_km} /></em>.</>}
        dek={<>In {ny.city === 'New York' ? 'New York City' : ny.city} {ny.year}, when the race clock read 3:00, the runner 10% from the front had reached <Distance km={at3.front10_km} /> and the runner 10% from the back only <Distance km={at3.back10_km} />. {Math.round(at3.finished_share * 100)}% had already finished.</>}>
        <div className="snapshot-grid">
          {data.editions.map((e) => (
            <div key={e.slug} className="viz-card snapshot-card">
              <p className="viz-title">{e.city === 'New York' ? 'New York City' : e.city} {e.year}</p>
              <p className="viz-sub">{count(e.finishes)} eligible finishes · median {hms(e.median_finish_s)}</p>
              <div className="snapshot-rows">
                {e.snapshots.filter((s) => s.clock_s <= 21600).map((s) => (
                  <div key={s.clock_s} className="snapshot-row">
                    <span>{s.clock_s / 3600}:00</span>
                    <span className="snapshot-track">
                      <i style={{ left: `${(s.back10_km / 42.195) * 100}%`, width: `${Math.max(0.5, ((s.front10_km - s.back10_km) / 42.195) * 100)}%` }} />
                      <b style={{ left: `${(s.median_km / 42.195) * 100}%` }} />
                    </span>
                    <span>{Math.round(s.finished_share * 100)}% in</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="viz-note">Each bar runs from the runner 10% from the back to the runner 10% from the front, with finished runners counted at the finish line; the dot marks the median runner. Start is on the left, the finish on the right.</p>
      </StorySection>
      <StorySection id="spread" kicker="03 · Every course" title={<>The field keeps <em>stretching</em>.</>} dek="Pooled across every eligible finish, the gap between faster and slower runners widens in every section.">
        <FieldSpread data={data} />
      </StorySection>
      <StoryMethods manifest={manifest} files={['replay.json', ...data.editions.map((e) => e.file)]} method={data.method}
        caveats={[
          'Start offsets and waves are not recorded, so the replay puts every runner on one shared race clock. Real fields start over many minutes.',
          'Within a 5 km section each dot moves at a constant speed; changes inside a section cannot be seen.',
          'Replays show eligible finishes only: runners who did not finish, or whose records were incomplete, are not drawn.',
          'Route maps are the current supplied course files; historical routes may differ.',
        ]} />
    </>
  );
}
