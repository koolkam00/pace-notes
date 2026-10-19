import type { Kick } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { sectionName } from '@/lib/nuggets/stories';
import { hm, pct } from '@/lib/nuggets/format';
import LineProfile from '@/components/viz/LineProfile';
import DotGrid from '@/components/viz/DotGrid';
import Values from '@/components/ui/Values';
import Columns from '@/components/viz/Columns';
import Ruler from '@/components/viz/Ruler';
import { Beat, Moved, Say, StoryHero, StoryPage, rich } from '../StoryPage';

const PATH = '/stories/final-kick';
const minutes = (s: number) => `${Math.round(s / 60)} min`;

/**
 * After 30K (the redesign spec, section 7.7, under section 00), retitled from its lead finding: finishes on the same
 * pace through 20K, apart at the finish, then in race order the warning sign at 25–30K, no second wind, and the last
 * 2.2K. The fast-start bank moved to /analyses/starting-pace and the next-race recurrence to
 * /analyses/finding-improvement: their old anchors hold a line that shows only when a link lands there. The break and
 * the women-and-men kick are cut.
 */
export default function KickBody() {
  const data = readInsight<Kick>('kick.json');
  const story = STORIES.find((s) => s.slug === 'final-kick')!;
  const twins = getNugget('kick.twins'), bands = getNugget('kick.bands'), warning = getNugget('kick.warning'), stay = getNugget('kick.stay'), magnet = getNugget('kick.magnet');

  // Same pace through 20K: how many minutes later each pace band's finishes with a sustained slowdown came in, as one
  // line over the pace through 20K (a finish-time equivalent), the gap washed down to zero.
  const cost = data.cost.bands.filter((b) => b.slowdown_n >= 100 && b.other_n >= 100);
  const width = cost.length > 1 ? cost[1].lo_min - cost[0].lo_min : 15;
  const cx = cost.map((b) => b.lo_min + width / 2);
  const gap = cost.map((b) => (b.slowdown_finish_s - b.other_finish_s) / 60);
  const gTop = Math.max(10, Math.ceil(Math.max(...gap) / 10) * 10);
  const lowAt = gap.indexOf(Math.min(...gap)), highAt = gap.indexOf(Math.max(...gap));

  // The warning sign: the middle section the data reports, by how much slower it ran than early pace.
  const w = data.warning[Math.floor(data.warning.length / 2)];
  const wTop = Math.ceil(Math.max(...w.rows.map((r) => r.later)) * 10) / 10;

  // The last stretch: the share running each section faster than the one before, for finishes with a sustained
  // slowdown (the H2's share): the final section, and the band of every section before it (every section in the table).
  const final = data.magnet[data.magnet.length - 1];
  const before = data.magnet.slice(0, -1);
  const s = data.recovery.stay[0];

  return (
    <StoryPage path={PATH} numbers={[
      <Values key="twins" bare id="fk-twins" caption="Median finish by pace through 20K, with and without a sustained slowdown"
        columns={[{ key: 'p', label: 'Pace through 20K' }, { key: 'a', label: 'Without' }, { key: 'b', label: 'With' }, { key: 'g', label: 'Apart' }]}
        rows={cost.map((b) => [b.label, hm(b.other_finish_s / 60), hm(b.slowdown_finish_s / 60), minutes(b.slowdown_finish_s - b.other_finish_s)])} />,
      <Values key="warning" bare id="fk-warning" caption={`Pace at ${sectionName(w.after)} against the 5–20K pace, and the share that went on to a sustained slowdown`}
        columns={[{ key: 'p', label: `Pace at ${sectionName(w.after)}` }, { key: 's', label: 'Went on to one' }]}
        rows={w.rows.map((r) => [r.label, pct(r.later)])} />,
      <Values key="states" bare id="fk-states" caption={`Finishes at sustained-slowdown pace over ${sectionName(s.source)}, over ${sectionName(s.target)}`}
        columns={[{ key: 'a', label: `Over ${sectionName(s.target)}` }, { key: 's', label: 'Share of those finishes' }]}
        rows={[['Stayed that slow', pct(s.stay)], ['Did not', pct(1 - s.stay)]]} reading={0} />,
      <Values key="magnet" bare id="fk-magnet" caption="Ran the section faster than the one before"
        columns={[{ key: 's', label: 'Section' }, { key: 'd', label: 'With a sustained slowdown' }, { key: 'a', label: 'All finishes' }]}
        rows={data.magnet.map((m) => [sectionName(m.section), pct(m.slowdown), pct(m.all)])} reading={data.magnet.length - 1} />,
    ]}>
      {/* The H1 says the finding with its minutes, once (round 5: a big "20 min" under it said them again); the dek
          names the comparison, the same pace to 20K, and carries the term's one link to its definition. The next beat
          draws the gap at every pace, so the opener needs no figure or instrument of its own. */}
      <StoryHero path={PATH} title={story.heading ?? story.title}
        dek={twins.guard ? rich('Against finishes with no sustained slowdown, from the same pace through 20K.', { term: true }) : undefined}
        fallback={!twins.guard} sentence={twins.guard ? undefined : <Say nugget={twins} term />} />

      <Beat id="twins" track="chapter-1" label="Same pace, apart" title={bands}>
        <LineProfile x={cx} xDomain={[cost[0].lo_min, cost[cost.length - 1].lo_min + width]} yDomain={[0, gTop]}
          layers={[{ id: 'gap', label: 'Minutes later', series: [{ id: 'gap', values: gap }], band: { lo: gap.map(() => 0), hi: gap },
            labels: [
              // The H2's two ends ("13 to 24 minutes"), each on a point on the line. Lifted clear of the line as it climbs
              // to the right, so each label stands above its point, not on the area.
              { x: cx[lowAt], y: gap[lowAt], text: `+${Math.round(gap[lowAt])} min`, tone: 'ink', priority: 3, prefer: 'above', gap: 30 },
              { x: cx[highAt], y: gap[highAt], text: `+${Math.round(gap[highAt])} min`, tone: 'ink', priority: 3, prefer: 'above' },
            ],
            points: [{ x: cx[lowAt], y: gap[lowAt], kind: 'compare' }, { x: cx[highAt], y: gap[highAt], kind: 'compare' }] }]}
          xTicks={[180, 240, 300, 360].filter((v) => v > cost[0].lo_min && v < cost[cost.length - 1].lo_min + width).map((v) => ({ value: v, label: `${hm(v)} pace` }))}
          // No gridline: the labels on the line give its ends, and the area stands on the zero line.
          yTicks={[]}
          axisTitle={{ start: 'Pace through 20K, as a finish time' }}
          label={`Minutes later at the finish after a sustained slowdown, for each pace through 20K: ${Math.round(Number(bands.values.low_s) / 60)} to ${Math.round(Number(bands.values.high_s) / 60)} minutes.`} />
      </Beat>

      <Beat id="warning" track="chapter-2" label="The warning sign" title={warning}>
        <Columns max={wTop} items={w.rows.map((r, i) => ({ id: r.label, label: r.label.replace(/ slower$/, '').replace(/% /, '%'), value: r.later, display: pct(r.later), tone: i === w.rows.length - 1 ? 'signal' : 'ink' }))}
          label={`How often each pace at ${sectionName(w.after)}, against the 5–20K pace, was followed by a sustained slowdown: from ${pct(w.rows[0].later)} to ${pct(w.rows[w.rows.length - 1].later)}.`}
          caption={`Pace at ${sectionName(w.after)} against the 5–20K pace`} />
      </Beat>

      <Beat id="states" track="chapter-3" label="No second wind" title={stay} aliases={['break']}
        dek={stay.guard ? `Finishes at sustained-slowdown pace over ${sectionName(s.source)}.` : undefined}>
        {/* Staying slow is drawn in ink, never the accent (slower is never orange); the H2 gives the share. Ten by ten
            across the column on a phone; one wide band of 25 by 4 from 900 px, so it spans the measure. */}
        <DotGrid lit={s.stay * 100} compare className="is-band" label={`Of 100 finishes at sustained-slowdown pace over ${sectionName(s.source)}, ${Math.round(s.stay * 100)} stayed that slow over ${sectionName(s.target)}.`}
          caption={<span className="dot-grid-key"><span><i className="is-ink" />Stayed that slow</span><span><i />Did not</span></span>} />
      </Beat>

      {/* A scale, not a second set of columns (round 5: two near-identical bar charts on one page): the last stretch's
          share as the one orange dot, against the band every 5K before it held. */}
      <Beat id="magnet" track="chapter-4" label="The last stretch" title={magnet} aliases={['women-men']} dek={magnet.guard ? 'Finishes with a sustained slowdown, against each 5K before.' : undefined}>
        <Ruler min={0} max={1} ticks={[0, 0.25, 0.5, 0.75, 1].map((v) => ({ value: v, label: pct(v) }))}
          band={{ lo: Math.min(...before.map((m) => m.slowdown)), hi: Math.max(...before.map((m) => m.slowdown)), label: 'Each 5K before' }}
          marks={[{ value: final.slowdown, kind: 'reading', label: `${sectionName(final.section)} ${pct(final.slowdown)}` }]}
          label={`Of finishes with a sustained slowdown, ${pct(final.slowdown)} ran ${sectionName(final.section)} faster than the section before, against ${pct(Math.min(...before.map((m) => m.slowdown)))} to ${pct(Math.max(...before.map((m) => m.slowdown)))} in each 5K from ${sectionName(before[0].section)} on.`} />
      </Beat>

      <Moved id="bank" href="/analyses/starting-pace">Fast starts and what followed are now on Starting pace.</Moved>
      <Moved id="follows" href="/analyses/finding-improvement">The next race after a sustained slowdown is now on Where runners improve.</Moved>
    </StoryPage>
  );
}
