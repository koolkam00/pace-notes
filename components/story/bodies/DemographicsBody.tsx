import type { Demographics } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { matLabel, ms, pct } from '@/lib/nuggets/format';
import { pointsApart } from '@/lib/nuggets/stories';
import { MARATHON_KM } from '@/lib/units';
import LineProfile from '@/components/viz/LineProfile';
import Ruler from '@/components/viz/Ruler';
import Values from '@/components/ui/Values';
import PairBars from '../charts/PairBars';
import { Beat, Say, StoryHero, StoryPage, rich } from '../StoryPage';

const PATH = '/stories/who-holds-pace';
const MATS = [0, 5, 10, 15, 20, 25, 30, 35, 40, MARATHON_KM];
const MINUS = '−';
const one = (v: number) => Math.round(v * 10) / 10;
const slower = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(one(v)).toFixed(1)}%`;

/**
 * Women and men, the who-holds-pace story (the redesign spec, section 7.9, under section 00): the reading (sustained slowdown, recorded
 * women against recorded men at the same finish times) as a pair of figures, then two beats: the gap over all finishes and like for like,
 * both drawn, and how far behind recorded men recorded women ran at each mat in the band with the most matched finishes
 * (a scrub along the course; the ghost race's two-dot strip is cut). The gap at every finish time is cut: it restated
 * the opener.
 * The age ladder is cut (age is /analyses/age-and-pacing's finding) and so is the women's share by city (who runs, not
 * how they pace).
 */
export default function DemographicsBody() {
  const data = readInsight<Demographics>('demographics.json');
  const story = STORIES.find((s) => s.slug === 'who-holds-pace')!;
  const gender = getNugget('holds.gender'), unmask = getNugget('holds.unmask'), ghost = getNugget('holds.ghost');
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

  return (
    <StoryPage path={PATH} numbers={[
      <Values key="wh-unmask" bare id="wh-unmask" caption="Second 20K against the first, recorded women and men"
        columns={[{ key: 'v', label: 'Compared' }, { key: 'w', label: 'Women' }, { key: 'm', label: 'Men' }]}
        rows={[['All finishes', slower(o.pooled_women_block), slower(o.pooled_men_block)], ['Same race and minute', slower(o.women_block), slower(o.men_block)]]} reading={1} />,
      <Values key="wh-ghost" bare id="wh-ghost" caption={`Finishing in ${band.label}: recorded women behind recorded men at each mat`}
        columns={[{ key: 'm', label: 'Mat' }, { key: 'g', label: 'Women behind' }]}
        rows={band.ghost_s.map((g, k) => [matLabel(MATS[k + 1]), ms(g)])} reading={peak - 1} />,
    ]}>
      <StoryHero path={PATH} title={story.heading ?? story.title} fallback={!gender.guard}
        figures={[{ value: pct(w).replace('%', ''), unit: '%', sr: `${pct(w)} of recorded women's finishes`, key: 'Recorded women' }, { value: pct(m).replace('%', ''), unit: '%', sr: `${pct(m)} of recorded men's finishes`, key: 'Recorded men' }]}
        // The H1 says who had fewer; the pair says how often each did, and the key under it what is counted (the
        // term's first use, so it carries the link). A failed guard shows the plain sentence instead.
        unitLine={gender.guard ? rich('of finishes had a sustained slowdown, at the same finish times', { term: true }) : undefined}
        sentence={gender.guard ? undefined : <Say nugget={gender} term />}
        // The pair on one scale, so "more than twice" is a distance: the figures give the values, the dots their names.
        instrument={gender.guard ? (
          <Ruler min={0} max={Math.max(0.5, Math.ceil(m * 4) / 4)} ticks={[0, 0.25, 0.5, 0.75].filter((v) => v <= Math.max(0.5, Math.ceil(m * 4) / 4)).map((v) => ({ value: v, label: pct(v) }))}
            label={`Sustained slowdown at the same finish times: recorded women ${pct(w)}, recorded men ${pct(m)}.`}
            marks={[{ value: w, kind: 'reading', label: 'Women' }, { value: m, kind: 'compare', label: 'Men' }]} />
        ) : undefined} />

      {/* The H2 is one clause (the gap, like for like, against all finishes); the two groups carry the gaps, each from
          the unrounded difference (pointsApart), the same values the nugget's ratio is taken from. A runner's words, never
          "pooled" (round 5). */}
      <Beat id="unmask" track="chapter-1" label="Like for like" title={unmask}
        dek="How much slower the second 20K ran than the first, recorded women against men.">
        <PairBars highlight="matched" max={Math.ceil(Math.max(o.men_block, o.pooled_men_block) / 5) * 5}
          views={[
            { id: 'pooled', label: 'All finishes', bars: [{ label: 'Recorded women', value: o.pooled_women_block, display: slower(o.pooled_women_block) }, { label: 'Recorded men', value: o.pooled_men_block, display: slower(o.pooled_men_block) }], gap: pointsApart(Number(unmask.values.pooled_gap)) },
            { id: 'matched', label: 'Same race, same finish minute', bars: [{ label: 'Recorded women', value: o.women_block, display: slower(o.women_block) }, { label: 'Recorded men', value: o.men_block, display: slower(o.men_block) }], gap: pointsApart(Number(unmask.values.matched_gap)) },
          ]}
          label={`Second 20K against the first. All finishes: women ${slower(o.pooled_women_block)}, men ${slower(o.pooled_men_block)}. Same race and finish minute: women ${slower(o.women_block)}, men ${slower(o.men_block)}.`} />
      </Beat>

      {/* The gap at every finish time restated the opener's finding (at the same finish times), so it is cut; its
          anchors land here. */}
      <Beat id="ghost" track="chapter-2" label="Mat by mat" title={ghost} aliases={['bands', 'age', 'field']}
        dek="How far behind recorded women ran, mat by mat.">
        <LineProfile x={MATS} xDomain={[0, MARATHON_KM]} yDomain={[0, gapTop]}
          layers={[{ id: 'gap', label: 'Women behind', series: [{ id: 'gap', values: gapMin }], band: { lo: gapMin.map(() => 0), hi: gapMin },
            points: [{ x: MATS[peak], y: gapMin[peak], kind: 'reading' }] }]}
          xTicks={[0, 10, 20, 30, MARATHON_KM].map((km) => ({ value: km, label: matLabel(km) }))}
          // One gridline, the whole minute under the peak, labelled on the left, where the line is still low.
          yTicks={Math.floor(gapMin[peak]) >= 1 ? [{ value: Math.floor(gapMin[peak]), label: `${Math.floor(gapMin[peak])} min behind` }] : []} gridSide="left"
          scrub={{ label: `Finishing in ${band.label}: recorded women behind recorded men, mat by mat`,
            // The mat's gap alone: the finish is level by construction (the band selects it), so it is no reading.
            points: { x: MATS.map((km) => km / MARATHON_KM), keys: MATS.map((km, k) => keyAt(km, gapMin[k])), values: gapMin.map(gapAt) },
            initial: peak, detents: [peak], follow: 'gap' }}
          label={`Finishing in ${band.label}: recorded women behind recorded men at each mat, ${ms(Math.round(gapMin[peak] * 60))} at ${matLabel(MATS[peak])}.`} />
      </Beat>

    </StoryPage>
  );
}
