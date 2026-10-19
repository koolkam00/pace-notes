import type { CourseGeometry, ReplayIndex } from '@/lib/insights';
import { getInsightsManifest, readInsight, replayChoices } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { count, matLabel } from '@/lib/nuggets/format';
import { MARATHON_KM } from '@/lib/units';
import HeroReplay from '@/components/story/HeroReplay';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import { Beat, StoryHero, StoryPage } from '../StoryPage';

const PATH = '/stories/race-replay';
const MINUS = '−';
/** Minutes ahead (−) or behind (+) with one decimal; a value that rounds to zero is "0 min", never "−0.0". */
const signedMin = (v: number) => (Math.abs(v) < 0.05 ? '0 min' : `${v > 0 ? '+' : MINUS}${Math.abs(v).toFixed(1)} min`);

/**
 * Watch a marathon unfold (the redesign spec, section 7.3, under section 00): the moment of the first finish as the H1,
 * and the replay itself straight under it (the story's signature: no step-by-step reveal), its caption at the flag
 * frame giving the share in figures for whichever race is picked, so the page's number always matches the race on
 * screen. Then the finishes that passed 10K together spreading out. The home page's band says how far the back of the
 * field had come at that moment, so this page never repeats it. Every edition is picked by the data.
 */
export default function ReplayBody() {
  const data = readInsight<ReplayIndex>('replay.json');
  const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
  const story = STORIES.find((s) => s.slug === 'race-replay')!;
  const packs = getNugget('replay.packs');
  const routes = new Map(geometry.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  // The race chips newest first (then by city), so the row reads as a calendar rather than the data's own order, and the
  // edition the page opens on (a recent one) sits at the start of a phone's scrolling row.
  const choices = replayChoices(data.editions, getInsightsManifest(), routes).sort((a, b) => b.year - a.year || a.city.localeCompare(b.city));

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
  // The 30K mat (or the middle one), where the band is named.
  const midIndex = Math.max(1, mats.indexOf(30) >= 0 ? mats.indexOf(30) : Math.floor(lastIndex / 2));

  return (
    <StoryPage path={PATH} numbers={[
      rows.length > 1 ? (
        <Values key="rr-pack" bare id="rr-pack" caption={`The pack in ${packEdition!.city} ${packEdition!.year}, mat by mat, against its median`}
          columns={[{ key: 'm', label: 'Mat' }, { key: 's', label: 'Middle 80% apart' }, { key: 'a', label: 'Its front' }, { key: 'b', label: 'Its back' }]}
          rows={rows.map((r, i) => [matLabel(r.km), `${Math.round(hi[i] - lo[i])} min`, signedMin(-hi[i]), signedMin(-lo[i])])} reading={lastIndex} />
      ) : null,
    ]}>
      {/* The H1 states the flag frame's moment in words; the replay under it is the reading: its one control is the
          race, and the caption at its flag frame gives that race's own share in figures ("When the first runner
          finished London 2026, 47% of the field had not reached 20K."). Links to the old #replay beat land on it. */}
      <StoryHero path={PATH} title={story.heading ?? story.title}>
        <div id="replay" className="night story-replay">
          <span id="snapshots" className="beat-alias" aria-hidden="true" />
          <span id="first" className="beat-alias" aria-hidden="true" />
          <HeroReplay choices={choices} layout={false} moment="exact" />
        </div>
      </StoryHero>

      {rows.length > 1 ? (
        <Beat id="packs" track="chapter-1" className="rr-packs" aliases={['emptying']} label={`Together at ${matLabel(Number(packs.values.checkpoint_km) || mats[0])}`} title={packs}
          dek={`${packEdition!.city} ${packEdition!.year}: ${count(Number(packs.values.n))} finishes passed ${matLabel(Number(packs.values.checkpoint_km))} together.`}>
          <LineProfile x={mats} xDomain={[mats[0], MARATHON_KM]} yDomain={[-reach, reach]}
            // The band is named on itself, inside its wider lower half near the finish, clear of the median's label on the
            // upper right (the H2 gives its width at the finish), so it needs no key.
            // The H2's minutes are the bracket on the finish edge, from the band's back to its front; the band is named
            // inside its lower half at 30K, clear of the bracket's label.
            layers={[{ id: 'pack', label: 'The pack', series: [{ id: 'median', values: rows.map(() => 0) }], band: { lo, hi, edge: true },
              bracket: { x: mats[lastIndex], y0: lo[lastIndex], y1: hi[lastIndex], label: `${Math.round(Number(packs.values.window_min))} min` },
              // Centred in the band's lower half at 30K, where it is widest before the finish: never on an edge.
              labels: [{ x: mats[midIndex], y: lo[midIndex] * 0.5, text: 'Middle 80%', tone: 'ink', priority: 3, prefer: 'right', gap: -40 }] }]}
            refs={[{ value: 0, label: 'Their median' }]}
            xTicks={mats.filter((_, i) => i === 0 || i === lastIndex || mats[i] % 10 === 0).map((km) => ({ value: km, label: matLabel(km) }))}
            // The scale reads on the left, at 10K, where the pack is still one line; the finish end carries the width.
            yTicks={[{ value: reach, label: `${reach} min ahead` }, { value: -reach, label: `${reach} min behind` }]} gridSide="left"
            label={`Finishes that passed ${matLabel(mats[0])} together in ${packEdition!.city} ${packEdition!.year}: the middle 80% spread from ${matLabel(mats[0])} to ${Math.round(Number(packs.values.window_min))} minutes apart at the finish.`} />
        </Beat>
      ) : null}

    </StoryPage>
  );
}
