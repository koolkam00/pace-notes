import type { Demographics } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { hm, matLabel, ms, pct } from '@/lib/nuggets/format';
import { MARATHON_KM } from '@/lib/units';
import GhostRace from '@/components/viz/GhostRace.client';
import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import PairBars from '../charts/PairBars';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';

const PATH = '/stories/who-holds-pace';
const SECTION_KM: [number, number][] = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, MARATHON_KM]];
const MATS = [0, 5, 10, 15, 20, 25, 30, 35, 40, MARATHON_KM];
const MINUS = '−';
const slower = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)}%`;

/**
 * Who holds their pace (the redesign spec, section 7.9, under section 00): the reading (sustained slowdown, recorded
 * women against recorded men at the same finish times) as a pair of figures, then three beats: the gap pooled and matched under
 * one lens, the two racing side by side in the band with the most matched finishes, and the gap at every finish time.
 * The age ladder is cut (age is /analyses/age-and-pacing's finding) and so is the women's share by city (who runs, not
 * how they pace).
 */
export default function DemographicsBody() {
  const data = readInsight<Demographics>('demographics.json');
  const story = STORIES.find((s) => s.slug === 'who-holds-pace')!;
  const gender = getNugget('holds.gender'), unmask = getNugget('holds.unmask'), ghost = getNugget('holds.ghost'), bands = getNugget('holds.bands');
  const w = Number(gender.values.women), m = Number(gender.values.men);
  const o = data.overall;

  // The ghost race, in the band the holds.ghost nugget names: recorded men from their section profile, recorded women
  // behind them by the published gap at each mat. Positions between mats run at the section's pace.
  const band = data.bands.find((b) => b.label === ghost.values.band) ?? data.bands[0];
  const finish = (band.lo_min + 5) * 60;
  const raw = SECTION_KM.map(([a, b], i) => (b - a) * (1 + band.men_profile[i] / 100));
  const scale = finish / raw.reduce((s2, v) => s2 + v, 0);
  const men: number[] = [];
  raw.reduce((t, v) => { men.push(t + v * scale); return t + v * scale; }, 0);
  const women = men.map((t, k) => t + band.ghost_s[k]);
  const posAt = (cum: number[], t: number) => {
    const c = [0, ...cum];
    if (t >= c[c.length - 1]) return MARATHON_KM;
    let j = 1;
    while (c[j] < t) j++;
    return MATS[j - 1] + ((t - c[j - 1]) / (c[j] - c[j - 1])) * (MATS[j] - MATS[j - 1]);
  };
  const timeAt = (cum: number[], km: number) => {
    const c = [0, ...cum];
    let j = 1;
    while (j < MATS.length - 1 && MATS[j] < km) j++;
    return c[j - 1] + ((km - MATS[j - 1]) / (MATS[j] - MATS[j - 1])) * (c[j] - c[j - 1]);
  };
  const end = Math.max(men[8], women[8]);
  const peak = band.ghost_s.indexOf(Math.max(...band.ghost_s));
  const clocks = [...new Set([...Array.from({ length: Math.floor(end / 60) + 1 }, (_, i) => i * 60), men[peak]])].sort((a, b) => a - b);
  const ghostKm = clocks.map((t) => posAt(men, t)), runnerKm = clocks.map((t) => posAt(women, t));
  const gaps = clocks.map((t, i) => {
    if (t === 0) return 'Both at the start';
    const lead = Math.max(ghostKm[i], runnerKm[i]);
    if (ghostKm[i] >= MARATHON_KM && runnerKm[i] >= MARATHON_KM) return 'Both finished';
    const behind = ghostKm[i] >= runnerKm[i] ? timeAt(women, lead) - t : timeAt(men, lead) - t;
    return `${ghostKm[i] >= runnerKm[i] ? 'Women' : 'Men'} ${ms(Math.max(0, behind))} behind`;
  });
  const initial = Math.max(0, clocks.indexOf(men[peak]));

  // The gap at every finish time: each band's sustained-slowdown share for recorded women and men.
  const rows = data.bands.filter((b) => b.women_n >= 100 && b.men_n >= 100);
  const width = rows.length > 1 ? rows[1].lo_min - rows[0].lo_min : 10;
  const bx = rows.map((b) => b.lo_min + width / 2);
  const bTop = Math.ceil(Math.max(...rows.map((b) => b.men_slowdown)) * 10) / 10;
  const last = rows.length - 1;
  // The lines are named where they stand furthest apart, clear of the axis labels at either end.
  const mid = rows.reduce((best, b, i) => (i > 0 && i < last && b.men_slowdown - b.women_slowdown > rows[best].men_slowdown - rows[best].women_slowdown ? i : best), Math.floor(last / 2));

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek} fallback={!gender.guard}
        figures={[{ value: pct(w).replace('%', ''), unit: '%', sr: `${pct(w)} of recorded women's finishes`, key: 'Recorded women' }, { value: pct(m).replace('%', ''), unit: '%', sr: `${pct(m)} of recorded men's finishes`, key: 'Recorded men' }]}
        sentence={<Say nugget={gender} term />} />

      <Beat id="unmask" track="chapter-1" label="Pooled or matched" title={unmask}
        dek="How much slower the second 20K ran than the first: every finish pooled, or women and men matched.">
        <PairBars initial="matched" lensLabel="Compare" max={Math.ceil(Math.max(o.men_block, o.pooled_men_block) / 5) * 5}
          views={[
            { id: 'pooled', label: 'Pooled', bars: [{ label: 'Recorded women', value: o.pooled_women_block, display: slower(o.pooled_women_block) }, { label: 'Recorded men', value: o.pooled_men_block, display: slower(o.pooled_men_block) }], gap: `${(o.pooled_men_block - o.pooled_women_block).toFixed(1)} points apart` },
            { id: 'matched', label: 'Same finish time', bars: [{ label: 'Recorded women', value: o.women_block, display: slower(o.women_block) }, { label: 'Recorded men', value: o.men_block, display: slower(o.men_block) }], gap: `${(o.men_block - o.women_block).toFixed(1)} points apart` },
          ]}
          label={`Second 20K against the first. Pooled: women ${slower(o.pooled_women_block)}, men ${slower(o.pooled_men_block)}. Same race and finish minute: women ${slower(o.women_block)}, men ${slower(o.men_block)}.`}
          values={(
            <Values id="wh-unmask" caption="Second 20K against the first"
              columns={[{ key: 'v', label: 'Compared' }, { key: 'w', label: 'Recorded women' }, { key: 'm', label: 'Recorded men' }]}
              rows={[['Pooled', slower(o.pooled_women_block), slower(o.pooled_men_block)], ['Same race and finish minute', slower(o.women_block), slower(o.men_block)]]} reading={1} />
          )} />
      </Beat>

      <Beat id="ghost" track="chapter-2" label="Side by side" title={ghost}>
        <GhostRace clocks={clocks} ghost={ghostKm} runner={runnerKm} gaps={gaps} names={{ ghost: 'Recorded men', runner: 'Recorded women' }} clockLabels={clocks.map((t) => hm(t / 60))}
          ticks={Array.from({ length: Math.floor(end / 3600) + 1 }, (_, h) => ({ x: (h * 3600) / clocks[clocks.length - 1], label: `${h}:00` }))}
          initial={initial} detents={[initial]} label={`Recorded women and men finishing in ${band.label}`} />
        <Values id="wh-ghost" caption={`Finishing in ${band.label}: recorded women behind recorded men at each mat`}
          columns={[{ key: 'm', label: 'Mat' }, { key: 'g', label: 'Women behind' }]}
          rows={band.ghost_s.map((g, k) => [matLabel(MATS[k + 1]), ms(g)])} reading={peak} />
      </Beat>

      <Beat id="bands" track="chapter-3" label="Every finish time" title={bands} aliases={['age', 'field']}>
        <LineProfile x={bx} xDomain={[rows[0].lo_min, rows[last].lo_min + width]} yDomain={[0, bTop]}
          layers={[{ id: 'bands', label: 'Sustained slowdown', series: [{ id: 'women', values: rows.map((b) => b.women_slowdown), tone: 'quiet' }, { id: 'men', values: rows.map((b) => b.men_slowdown) }],
            labels: [
              { x: bx[mid], y: rows[mid].men_slowdown, text: 'Recorded men', tone: 'ink', priority: 3, prefer: 'above' },
              { x: bx[mid], y: rows[mid].women_slowdown, text: 'Recorded women', tone: 'quiet', priority: 2, prefer: 'below' },
            ] }]}
          xTicks={[180, 240, 300, 360].filter((v) => v > rows[0].lo_min && v < rows[last].lo_min + width).map((v) => ({ value: v, label: hm(v) }))}
          yTicks={[{ value: bTop, label: pct(bTop) }, { value: bTop / 2, label: pct(bTop / 2) }]}
          label={`Sustained slowdown by finish time, recorded women and men, from ${hm(rows[0].lo_min)} to ${hm(rows[last].lo_min + width)}.`}
          values={(
            <Values id="wh-bands" caption="Sustained slowdown by finish time"
              columns={[{ key: 'b', label: 'Finish time' }, { key: 'w', label: 'Recorded women' }, { key: 'm', label: 'Recorded men' }]}
              rows={rows.map((b) => [b.label, pct(b.women_slowdown), pct(b.men_slowdown)])} />
          )} />
      </Beat>
    </StoryPage>
  );
}
