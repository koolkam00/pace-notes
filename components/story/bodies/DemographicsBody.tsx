import type { Demographics } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { hm, matLabel, ms, pct } from '@/lib/nuggets/format';
import { MARATHON_KM } from '@/lib/units';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import PairBars from '../charts/PairBars';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';

const PATH = '/stories/who-holds-pace';
const MATS = [0, 5, 10, 15, 20, 25, 30, 35, 40, MARATHON_KM];
const MINUS = '−';
const one = (v: number) => Math.round(v * 10) / 10;
const slower = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(one(v)).toFixed(1)}%`;
/** The gap between two shown values, from the shown (rounded) values, so the three on screen add up. */
const apart = (a: number, b: number) => `${Math.abs(one(b) - one(a)).toFixed(1)} points apart`;

/**
 * Women and men, the who-holds-pace story (the redesign spec, section 7.9, under section 00): the reading (sustained slowdown, recorded
 * women against recorded men at the same finish times) as a pair of figures, then three beats: the gap pooled and matched,
 * both drawn, how far behind recorded men recorded women ran at each mat in the band with the most matched finishes (a
 * scrub along the course; the ghost race's two-dot strip is cut), and the gap at every finish time.
 * The age ladder is cut (age is /analyses/age-and-pacing's finding) and so is the women's share by city (who runs, not
 * how they pace).
 */
export default function DemographicsBody() {
  const data = readInsight<Demographics>('demographics.json');
  const story = STORIES.find((s) => s.slug === 'who-holds-pace')!;
  const gender = getNugget('holds.gender'), unmask = getNugget('holds.unmask'), ghost = getNugget('holds.ghost'), bands = getNugget('holds.bands');
  const w = Number(gender.values.women), m = Number(gender.values.men);
  const o = data.overall;

  // The gap, mat by mat, in the band the holds.ghost nugget names: how far behind recorded men recorded women were at
  // each mat (the published gap; nothing between mats is drawn as known). The two finish level by construction.
  const band = data.bands.find((b) => b.label === ghost.values.band) ?? data.bands[0];
  const gapMin = [0, ...band.ghost_s.map((g) => g / 60)];
  const peak = gapMin.indexOf(Math.max(...gapMin));
  const gapTop = Math.max(1, Math.ceil(gapMin[peak] * 1.15));
  // The readout: the mat and who is behind as its key, the gap as its value (short, so it fits at 200% zoom).
  const secs = (min: number) => Math.round(min * 60);
  const place = (km: number) => (km ? `At ${matLabel(km)}` : 'At the start');
  const keyAt = (km: number, min: number) => (Math.abs(secs(min)) < 1 ? place(km) : `${place(km)}, ${secs(min) > 0 ? 'women' : 'men'} behind by`);
  const gapAt = (min: number) => (Math.abs(secs(min)) < 1 ? 'Level' : ms(Math.abs(secs(min))));

  // The gap at every finish time: each band's sustained-slowdown share for recorded women and men.
  const rows = data.bands.filter((b) => b.women_n >= 100 && b.men_n >= 100);
  const width = rows.length > 1 ? rows[1].lo_min - rows[0].lo_min : 10;
  const bx = rows.map((b) => b.lo_min + width / 2);
  // Round gridlines: quarters of the share, up to the quarter above the highest band.
  const bTop = Math.ceil(Math.max(...rows.map((b) => b.men_slowdown)) * 4) / 4;
  const last = rows.length - 1;
  // The lines are named where they stand furthest apart, clear of the axis labels at either end.
  const mid = rows.reduce((best, b, i) => (i > 0 && i < last && b.men_slowdown - b.women_slowdown > rows[best].men_slowdown - rows[best].women_slowdown ? i : best), Math.floor(last / 2));

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek} fallback={!gender.guard}
        figures={[{ value: pct(w).replace('%', ''), unit: '%', sr: `${pct(w)} of recorded women's finishes`, key: 'Recorded women' }, { value: pct(m).replace('%', ''), unit: '%', sr: `${pct(m)} of recorded men's finishes`, key: 'Recorded men' }]}
        sentence={<Say nugget={gender} term />} />

      <Beat id="unmask" track="chapter-1" label="Pooled or matched" title={unmask}
        dek="How much slower the second 20K ran than the first.">
        <PairBars highlight="matched" max={Math.ceil(Math.max(o.men_block, o.pooled_men_block) / 5) * 5}
          views={[
            { id: 'pooled', label: 'Every finish, pooled', bars: [{ label: 'Recorded women', value: o.pooled_women_block, display: slower(o.pooled_women_block) }, { label: 'Recorded men', value: o.pooled_men_block, display: slower(o.pooled_men_block) }], gap: apart(o.pooled_women_block, o.pooled_men_block) },
            { id: 'matched', label: 'Same race, same finish minute', bars: [{ label: 'Recorded women', value: o.women_block, display: slower(o.women_block) }, { label: 'Recorded men', value: o.men_block, display: slower(o.men_block) }], gap: apart(o.women_block, o.men_block) },
          ]}
          label={`Second 20K against the first. Pooled: women ${slower(o.pooled_women_block)}, men ${slower(o.pooled_men_block)}. Same race and finish minute: women ${slower(o.women_block)}, men ${slower(o.men_block)}.`}
          values={(
            <Values id="wh-unmask" caption="Second 20K against the first, recorded women and men"
              columns={[{ key: 'v', label: 'Compared' }, { key: 'w', label: 'Women' }, { key: 'm', label: 'Men' }]}
              rows={[['Pooled', slower(o.pooled_women_block), slower(o.pooled_men_block)], ['Same race and minute', slower(o.women_block), slower(o.men_block)]]} reading={1} />
          )} />
      </Beat>

      <Beat id="ghost" track="chapter-2" label="Mat by mat" title={ghost}>
        <LineProfile x={MATS} xDomain={[0, MARATHON_KM]} yDomain={[0, gapTop]}
          layers={[{ id: 'gap', label: 'Women behind', series: [{ id: 'gap', values: gapMin }], band: { lo: gapMin.map(() => 0), hi: gapMin },
            points: [{ x: MATS[peak], y: gapMin[peak], kind: 'reading' }] }]}
          xTicks={[0, 10, 20, 30, MARATHON_KM].map((km) => ({ value: km, label: matLabel(km) }))}
          // One gridline, the whole minute under the peak, labelled on the left, where the line is still low.
          yTicks={Math.floor(gapMin[peak]) >= 1 ? [{ value: Math.floor(gapMin[peak]), label: `${Math.floor(gapMin[peak])} min behind` }] : []} gridSide="left"
          scrub={{ label: `Finishing in ${band.label}: recorded women behind recorded men, mat by mat`,
            points: { x: MATS.map((km) => km / MARATHON_KM), keys: MATS.map((km, k) => keyAt(km, gapMin[k])), values: gapMin.map(gapAt) },
            initial: peak, detents: [peak] }}
          label={`Finishing in ${band.label}: recorded women behind recorded men at each mat, ${ms(Math.round(gapMin[peak] * 60))} at ${matLabel(MATS[peak])}, level at the finish.`}
          values={(
            <Values id="wh-ghost" caption={`Finishing in ${band.label}: recorded women behind recorded men at each mat`}
              columns={[{ key: 'm', label: 'Mat' }, { key: 'g', label: 'Women behind' }]}
              rows={band.ghost_s.map((g, k) => [matLabel(MATS[k + 1]), ms(g)])} reading={peak - 1} />
          )} />
      </Beat>

      <Beat id="bands" track="chapter-3" label="Every finish time" title={bands} aliases={['age', 'field']}>
        <LineProfile x={bx} xDomain={[rows[0].lo_min, rows[last].lo_min + width]} yDomain={[0, bTop]}
          layers={[{ id: 'bands', label: 'Sustained slowdown', series: [{ id: 'women', values: rows.map((b) => b.women_slowdown), tone: 'quiet' }, { id: 'men', values: rows.map((b) => b.men_slowdown) }],
            labels: [
              { x: bx[mid], y: rows[mid].men_slowdown, text: 'Recorded men', tone: 'ink', priority: 3, prefer: 'above' },
              { x: bx[mid], y: rows[mid].women_slowdown, text: 'Recorded women', tone: 'quiet', priority: 2, prefer: 'below' },
            ] }]}
          xTicks={[180, 240, 300, 360, 420].filter((v) => v > rows[0].lo_min && v <= rows[last].lo_min + width).map((v) => ({ value: v, label: hm(v) }))}
          yTicks={[0.25, 0.5, 0.75].filter((v) => v <= bTop).map((v) => ({ value: v, label: pct(v) }))} gridSide="left"
          label={`Sustained slowdown by finish time, recorded women and men, from ${hm(rows[0].lo_min)} to ${hm(rows[last].lo_min + width)}.`}
          values={(
            <Values id="wh-bands" caption="Sustained slowdown by finish time, recorded women and men"
              columns={[{ key: 'b', label: 'Finish time' }, { key: 'w', label: 'Women' }, { key: 'm', label: 'Men' }]}
              rows={rows.map((b) => [b.label, pct(b.women_slowdown), pct(b.men_slowdown)])} />
          )} />
      </Beat>
    </StoryPage>
  );
}
