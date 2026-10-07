import type { CourseGeometry, InsightsManifest, ReplayIndex } from '@/lib/insights';
import { count, hms } from '@/lib/viz/format';
import HeroReplay, { type ReplayChoice } from '../HeroReplay';
import { FieldSpread } from '../MoreCharts';
import { ClockPack, EmptyingCourse, EvenGhost, FirstFinish, StretchStrip } from '../ClockStory';
import { StoryMethods, StorySection } from '../StoryShell';
import { Distance } from '../Units';

export default function ReplayBody({ data, geometry, manifest }: { data: ReplayIndex; geometry: CourseGeometry[]; manifest: InsightsManifest }) {
  const routes = new Map(geometry.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices: ReplayChoice[] = data.editions.map((e) => ({ ...e, version: manifest.files[e.file].sha256, route: routes.get(e.city) ?? null }));
  const ny = data.editions.find((e) => e.city === 'New York') ?? data.editions[0];
  const at3 = ny.snapshots.find((s) => s.clock_s === 10800)!;
  const london = data.editions.find((e) => e.city === 'London');
  const name = (e: { city: string; year: number }) => `${e.city === 'New York' ? 'New York City' : e.city} ${e.year}`;
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
      {london?.moments ? (
        <StorySection id="first" kicker="03 · The first finish" title={<>When the front is home, <em>half the field</em> has not reached 20 km.</>}
          dek={<>The fastest eligible finish in {name(london)} came at {hms(london.moments.first_finish_s)} on the clock. At that moment {count(london.moments.not_past_20_at_first)} of {count(london.finishes)} eligible
            finishes ({Math.round((london.moments.not_past_20_at_first / london.finishes) * 100)}%) had not yet reached the 20 km mat, and the back of the field was <Distance km={42.195 - london.moments.back_km_at_first} /> behind the front.</>}>
          <FirstFinish editions={data.editions} initial={london.slug} />
        </StorySection>
      ) : null}
      {london?.ghosts ? (() => {
        const g = london.ghosts.find((x) => x.target_s === 16200);
        return g ? (
          <StorySection id="ghost" kicker="04 · Even pace" title={<>Run it even and you <em>start behind</em>.</>}
            dek={<>A ghost running a perfectly even {hms(g.target_s).slice(0, -3)} in {name(london)} is behind {Math.round(g.ahead[0] * 100)}% of the eligible field at 5 km on the clock and behind {Math.round(g.ahead[8] * 100)}% at the finish:
              it moves past {count(g.net_passes)} finishes without ever speeding up. Real runners who finished near {hms(g.target_s).slice(0, -3)} typically reached 20 km in {g.typical_20km_s ? hms(g.typical_20km_s) : '—'}, against the ghost&apos;s {hms(g.even_20km_s)}.</>}>
            <EvenGhost editions={data.editions} initial={london.slug} />
          </StorySection>
        ) : null;
      })() : null}
      {ny?.composition ? (() => {
        const five = ny.composition.find((r) => r.clock_s === 18000);
        return five?.composition_share != null ? (
          <StorySection id="emptying" kicker="05 · Late in the day" title={<>The course isn&apos;t slowing down. <em>It&apos;s emptying.</em></>}
            dek={<>At 5:00 on the clock in {name(ny)}, {count(five.on_course)} eligible finishes were still out on the course, moving far slower than the field did early on. About {Math.round(five.composition_share * 100)}% of that drop is simply who is left: slower runners were always going to be the ones still out there.</>}>
            <EmptyingCourse editions={data.editions} initial={ny.slug} />
          </StorySection>
        ) : null;
      })() : null}
      {london?.pack ? (
        <StorySection id="packs" kicker="06 · Clock packs" title={<>Pass 10 km together, finish <em>{Math.round(london.pack.finish_window_min)} minutes apart</em>.</>}
          dek={<>In {name(london)}, {count(london.pack.n)} finishes passed 10 km within the same 30 seconds of race time. The middle 80% of them finished {london.pack.finish_window_min.toFixed(0)} minutes apart.</>}>
          <ClockPack editions={data.editions} initial={london.slug} />
        </StorySection>
      ) : null}
      <StorySection id="spread" kicker="07 · Every course" title={<>The field keeps <em>stretching</em>.</>} dek={data.stretch ? `In every one of ${data.stretch.editions.length} race editions with at least 1,000 eligible finishes, the field is relatively wider over 20–40 km than over 0–20 km.` : 'Pooled across every eligible finish, the gap between faster and slower runners widens in every section.'}>
        {data.stretch ? <StretchStrip stretch={data.stretch} /> : null}
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
