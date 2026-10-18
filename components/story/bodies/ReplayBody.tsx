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
/** Minutes ahead (−) or behind (+) with one decimal; a value that rounds to zero is "0 min", never "−0.0". */
const signedMin = (v: number) => (Math.abs(v) < 0.05 ? '0 min' : `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(1)} min`);

/**
 * Watch a marathon unfold (the redesign spec, section 7.3, under section 00): the moment of the first finish as the
 * reading, then the replay itself (the story's signature: no step-by-step reveal), finishes that passed 10K together
 * spreading out, and, hour by hour, the share of the field's slowing on course that was who was left. The snapshots,
 * the edition strip and the even-pace ghost are cut (the ghost is chapter 03's finding); every edition is picked by the
 * data.
 */
export default function ReplayBody() {
  const data = readInsight<ReplayIndex>('replay.json');
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  const story = STORIES.find((s) => s.slug === 'race-replay')!;
  const first = getNugget('replay.first'), back = getNugget('replay.back'), spread = getNugget('replay.spread'), packs = getNugget('replay.packs'), left = getNugget('replay.left');
  const routes = new Map(geometry.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices = replayChoices(data.editions, getInsightsManifest(), routes);
  const race = `${first.values.city} ${first.values.year}`;

  // Finishes that passed a mat together: the middle 80% of them, mat by mat, around their median, ahead up and behind
  // down, as the replay above draws its field (first to finish at the top).
  const packEdition = data.editions.find((e) => e.slug === packs.values.slug);
  const q = packEdition?.pack?.quantiles ?? [];
  const mats = [packEdition?.pack?.checkpoint_km ?? 10, ...q.map((r) => r.km).filter((km) => km > (packEdition?.pack?.checkpoint_km ?? 10))];
  const rows = mats.map((km) => q.find((r) => r.km === km)!).filter(Boolean);
  // Minutes ahead of the pack's median (behind is negative): the band from its back (p90) to its front (p10).
  const lo = rows.map((r) => (r.p50_s - r.p90_s) / 60), hi = rows.map((r) => (r.p50_s - r.p10_s) / 60);
  const reach = Math.ceil(Math.max(...hi.map(Math.abs), ...lo.map(Math.abs)) / 10) * 10;
  const lastIndex = rows.length - 1;

  // Who's left: hour by hour, the share of the drop in the field's pace on course that came from who was still out
  // there (their own whole-race pace dropping too) rather than from runners slowing.
  const leftEdition = data.editions.find((e) => e.city === left.values.city && e.year === left.values.year);
  const leftRace = leftEdition ? `${leftEdition.city} ${leftEdition.year}` : race;
  const comp = (leftEdition?.composition ?? []).filter((r) => r.on_course >= 100 && typeof r.composition_share === 'number');
  const start = (leftEdition?.composition ?? [])[0]?.current_kmh ?? NaN;
  const share = comp.map((r) => r.composition_share! * 100);
  const hours = comp.map((r) => r.clock_s / 3600);
  const h0 = Math.floor(hours[0] ?? 0), h1 = Math.ceil(hours[hours.length - 1] ?? 1);
  const at = comp.findIndex((r) => r.clock_s === left.values.clock_s);

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={first.figure ? { ...first.figure } : undefined} fallback={!first.guard}
        unitLine={first.figure ? `${race}, at the first finish` : undefined}
        sentence={<Say nugget={back} />} />

      {/* The H2 says what the replay shows; the count of editions behind it is the one plain sentence under it. The H1
          already states the flag frame's moment, so the replay does not repeat it, and the one control is the race. */}
      <Beat id="replay" track="chapter-1" label="The replay" aliases={['snapshots', 'first']}
        title={spread.guard ? <>After 20K, the field <em>spreads out</em>.</> : <>The race, finish by finish.</>}
        dek={spread.guard ? `It did in all ${count(Number(spread.values.editions))} race editions.` : undefined}>
        <div className="night story-replay"><HeroReplay choices={choices} layout={false} moment={false} /></div>
      </Beat>

      {rows.length > 1 ? (
        <Beat id="packs" track="chapter-2" className="rr-packs" label={`Together at ${matLabel(Number(packs.values.checkpoint_km) || mats[0])}`} title={packs}
          dek={`${packEdition!.city} ${packEdition!.year}: ${count(Number(packs.values.n))} finishes passed ${matLabel(Number(packs.values.checkpoint_km))} together.`}>
          <LineProfile x={mats} xDomain={[mats[0], MARATHON_KM]} yDomain={[-reach, reach]}
            layers={[{ id: 'pack', label: 'The pack', series: [{ id: 'median', values: rows.map(() => 0) }], band: { lo, hi },
              // The band's whole width at the finish, the number the H2 names, rather than two separately rounded ends.
              labels: [{ x: mats[lastIndex], y: lo[lastIndex], text: `${Math.round(Number(packs.values.window_min))} min apart`, tone: 'ink', priority: 3, prefer: 'left' }] }]}
            refs={[{ value: 0, label: 'Their median' }]}
            xTicks={mats.filter((_, i) => i === 0 || i === lastIndex || mats[i] % 10 === 0).map((km) => ({ value: km, label: matLabel(km) }))}
            // The scale reads on the left, at 10K, where the pack is still one line; the finish end carries the width.
            yTicks={[{ value: reach, label: `${reach} min ahead` }, { value: -reach, label: `${reach} min behind` }]} gridSide="left"
            label={`Finishes that passed ${matLabel(mats[0])} together in ${packEdition!.city} ${packEdition!.year}: the middle 80% spread from ${matLabel(mats[0])} to ${Math.round(Number(packs.values.window_min))} minutes apart at the finish.`}
            keys={[{ label: 'The middle 80% of the pack', mark: 'band' }]}
            values={(
              <Values id="rr-pack" caption={`The pack in ${packEdition!.city} ${packEdition!.year}, mat by mat, against its median`}
                columns={[{ key: 'm', label: 'Mat' }, { key: 's', label: 'Middle 80% apart' }, { key: 'a', label: 'Its front' }, { key: 'b', label: 'Its back' }]}
                rows={rows.map((r, i) => [matLabel(r.km), `${Math.round(hi[i] - lo[i])} min`, signedMin(-hi[i]), signedMin(-lo[i])])} reading={lastIndex} />
            )} />
        </Beat>
      ) : null}

      {comp.length > 2 ? (
        <Beat id="emptying" track="chapter-3" label="Who’s left" title={left}
          dek={`${leftRace}, hour by hour: how much of the slower pace on course was who was still out there, rather than runners slowing.`}>
          <LineProfile x={hours} xDomain={[h0, h1]} yDomain={[0, 100]}
            layers={[{ id: 'left', label: 'Who’s left', series: [{ id: 'share', values: share }],
              points: at >= 0 ? [{ x: hours[at], y: share[at], kind: 'reading' }] : [],
              labels: at >= 0 ? [{ x: hours[at], y: share[at], text: `${hm(Number(left.values.clock_s) / 60)} · ${pct(Number(left.values.share))}`, tone: 'signal', priority: 3, prefer: 'above' }] : [] }]}
            // Half is the level "mostly" has to clear: a gridline, labelled on the right, where the line has cleared it.
            xTicks={Array.from({ length: h1 - h0 + 1 }, (_, k) => ({ value: h0 + k, label: `${h0 + k}:00` }))}
            yTicks={[{ value: 50, label: 'Half' }, { value: 100, label: '100%' }]}
            label={`${leftRace}, hour by hour: the share of the field's slowing on course that reflects who was still out there, ${pct(Number(left.values.share))} at ${hm(Number(left.values.clock_s) / 60)}.`}
            values={(
              <Values id="rr-left" caption={`${leftRace}: the field on course, hour by hour`}
                columns={[{ key: 't', label: 'Race clock' }, { key: 'n', label: 'Pace on course, against the start' }, { key: 'w', label: 'Who’s left' }, { key: 'o', label: 'Still on course' }]}
                rows={comp.map((r, i) => [hm(r.clock_s / 60), `${Math.round((start / r.current_kmh - 1) * 100)}% slower`, pct(share[i] / 100), count(r.on_course)])} reading={at >= 0 ? at : undefined} />
            )} />
        </Beat>
      ) : null}
    </StoryPage>
  );
}
