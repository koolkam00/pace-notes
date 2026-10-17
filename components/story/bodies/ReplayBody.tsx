import type { CourseGeometry, ReplayIndex } from '@/lib/insights';
import { getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { count, hm, matLabel, pct } from '@/lib/nuggets/format';
import { MARATHON_KM } from '@/lib/units';
import HeroReplay from '@/components/story/HeroReplay';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';

const PATH = '/stories/race-replay';
const MINUS = '−';
const signedMin = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(Math.round(v))} min`;

/**
 * Watch a marathon unfold (the redesign spec, section 7.3, under section 00): the moment of the first finish as the
 * reading, then the replay itself (the story's signature: no step-by-step reveal), finishes that passed 10K together
 * spreading out, and how much of the late slowing on course is who's left. The snapshots, the edition strip and the
 * even-pace ghost are cut (the ghost is chapter 03's finding); every edition is picked by the data.
 */
export default function ReplayBody() {
  const data = readInsight<ReplayIndex>('replay.json');
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  const story = STORIES.find((s) => s.slug === 'race-replay')!;
  const first = getNugget('replay.first'), back = getNugget('replay.back'), spread = getNugget('replay.spread'), packs = getNugget('replay.packs'), left = getNugget('replay.left');
  const routes = new Map(geometry.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices = replayChoices(data.editions, getInsightsManifest(), routes);
  const race = `${first.values.city} ${first.values.year}`;

  // Finishes that passed a mat together: the middle 80% of them, mat by mat, around their median.
  const packEdition = data.editions.find((e) => e.slug === packs.values.slug);
  const q = packEdition?.pack?.quantiles ?? [];
  const mats = [packEdition?.pack?.checkpoint_km ?? 10, ...q.map((r) => r.km).filter((km) => km > (packEdition?.pack?.checkpoint_km ?? 10))];
  const rows = mats.map((km) => q.find((r) => r.km === km)!).filter(Boolean);
  const lo = rows.map((r) => (r.p10_s - r.p50_s) / 60), hi = rows.map((r) => (r.p90_s - r.p50_s) / 60);
  const reach = Math.ceil(Math.max(...hi.map(Math.abs), ...lo.map(Math.abs)) / 10) * 10;
  const lastIndex = rows.length - 1;

  // Who's left: the pace on course and the same runners' whole-race pace, each against the field at the start.
  const leftEdition = data.editions.find((e) => e.city === left.values.city && e.year === left.values.year);
  const comp = (leftEdition?.composition ?? []).filter((r) => r.on_course >= 100);
  const start = comp[0]?.current_kmh ?? NaN;
  const now = comp.map((r) => (start / r.current_kmh - 1) * 100);
  const whole = comp.map((r) => (start / r.whole_race_kmh - 1) * 100);
  const hours = comp.map((r) => r.clock_s / 3600);
  const top = Math.ceil(Math.max(...now) / 10) * 10;
  const at = comp.findIndex((r) => r.clock_s === left.values.clock_s);

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={first.figure ? { ...first.figure } : undefined} fallback={!first.guard}
        unitLine={first.figure ? `${race}, at the first finish` : undefined}
        sentence={<Say nugget={back} />} />

      <Beat id="replay" track="chapter-1" label="The replay" title={spread} aliases={['snapshots', 'first']}>
        <div className="night story-replay"><HeroReplay choices={choices} /></div>
      </Beat>

      {rows.length > 1 ? (
        <Beat id="packs" track="chapter-2" label="Together at 10K" title={packs}
          dek={`${packEdition!.city} ${packEdition!.year}: ${count(Number(packs.values.n))} finishes passed ${matLabel(Number(packs.values.checkpoint_km))} together. The band is the middle 80% of them.`}>
          <LineProfile x={mats} xDomain={[mats[0], MARATHON_KM]} yDomain={[-reach, reach]}
            layers={[{ id: 'pack', label: 'The pack', series: [{ id: 'median', values: rows.map(() => 0) }], band: { lo, hi },
              labels: [
                { x: mats[lastIndex], y: hi[lastIndex], text: `${signedMin(hi[lastIndex])}`, tone: 'ink', priority: 3, prefer: 'left' },
                { x: mats[lastIndex], y: lo[lastIndex], text: `${signedMin(lo[lastIndex])}`, tone: 'ink', priority: 2, prefer: 'left' },
              ] }]}
            refs={[{ value: 0, label: 'Their median' }]}
            xTicks={mats.filter((_, i) => i === 0 || i === lastIndex || mats[i] % 10 === 0).map((km) => ({ value: km, label: matLabel(km) }))}
            yTicks={[{ value: reach, label: `${reach} min behind` }, { value: -reach, label: `${reach} min ahead` }]}
            label={`Finishes that passed ${matLabel(mats[0])} together in ${packEdition!.city} ${packEdition!.year}: the middle 80% spread from ${matLabel(mats[0])} to ${Math.round(Number(packs.values.window_min))} minutes apart at the finish.`}
            keys={[{ label: 'The middle 80% of the pack', mark: 'band' }]}
            values={(
              <Values id="rr-pack" caption={`The pack in ${packEdition!.city} ${packEdition!.year}, mat by mat`}
                columns={[{ key: 'm', label: 'Mat' }, { key: 'a', label: 'Front of the middle 80%' }, { key: 'b', label: 'Back of it' }]}
                rows={rows.map((r, i) => [matLabel(r.km), signedMin(lo[i]), signedMin(hi[i])])} />
            )} />
        </Beat>
      ) : null}

      {comp.length > 2 ? (
        <Beat id="emptying" track="chapter-3" label="Who’s left" title={left}
          dek="Their whole-race pace (dashed) slows almost as much: the quicker runners had already finished.">
          <LineProfile x={hours} xDomain={[0, Math.ceil(hours[hours.length - 1])]} yDomain={[0, top]}
            layers={[{ id: 'left', label: 'On course', series: [{ id: 'now', values: now }, { id: 'whole', values: whole, dashed: true }],
              points: at >= 0 ? [{ x: hours[at], y: now[at], kind: 'reading' }] : [] }]}
            xTicks={Array.from({ length: Math.ceil(hours[hours.length - 1]) + 1 }, (_, h) => ({ value: h, label: h ? `${h}:00` : 'Start' }))}
            yTicks={[{ value: top, label: `${top}% slower` }, { value: top / 2, label: `${top / 2}%` }]}
            label={`${race}: the pace of the field still on course, and the whole-race pace of the same runners, each against the field's pace at the start. At ${hm(Number(left.values.clock_s) / 60)}, ${pct(Number(left.values.share))} of the slowing was who was left.`}
            keys={[{ label: 'Pace on course', mark: 'line' }, { label: 'The same runners’ whole-race pace', mark: 'dash' }]}
            values={(
              <Values id="rr-left" caption={`${race}: slower than the field at the start, hour by hour`}
                columns={[{ key: 't', label: 'Race clock' }, { key: 'n', label: 'Pace on course' }, { key: 'w', label: 'Their whole race' }, { key: 'o', label: 'Still on course' }]}
                rows={comp.map((r, i) => [hm(r.clock_s / 60), `${Math.round(now[i])}%`, `${Math.round(whole[i])}%`, count(r.on_course)])} reading={at >= 0 ? at : undefined} />
            )} />
        </Beat>
      ) : null}
    </StoryPage>
  );
}
