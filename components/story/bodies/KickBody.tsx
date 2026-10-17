import type { Kick } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { sectionName } from '@/lib/nuggets/stories';
import { hm, pct } from '@/lib/nuggets/format';
import Dumbbell from '@/components/viz/Dumbbell';
import DotGrid from '@/components/viz/DotGrid';
import Values from '@/components/ui/Values';
import Columns from '../charts/Columns';
import { Beat, Moved, Say, StoryHero, StoryPage } from '../StoryPage';

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
  const twins = getNugget('kick.twins'), later = getNugget('kick.later'), bands = getNugget('kick.bands'), warning = getNugget('kick.warning'), stay = getNugget('kick.stay'), magnet = getNugget('kick.magnet');

  // Same pace through 20K: each pace band's finish, with and without a sustained slowdown.
  const cost = data.cost.bands.filter((b) => b.slowdown_n >= 100 && b.other_n >= 100);
  // Each band's gap, drawn from its own no-slowdown finish at zero, on a scale to the next 10 minutes.
  const gTop = Math.max(1800, Math.ceil(Math.max(...cost.map((b) => b.slowdown_finish_s - b.other_finish_s)) / 600) * 600);

  // The warning sign: the middle section the data reports, by how much slower it ran than early pace.
  const w = data.warning[Math.floor(data.warning.length / 2)];
  const wTop = Math.ceil(Math.max(...w.rows.map((r) => r.later)) * 10) / 10;

  // The last stretch: the share running each section faster than the one before.
  // The last four sections drawn (so each name fits a phone), every section in the table.
  const lastFour = data.magnet.slice(-4);
  const mTop = Math.ceil(Math.max(...lastFour.map((m) => m.all)) * 10) / 10;
  const s = data.recovery.stay[0];

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={twins.figure ? { ...twins.figure } : undefined} fallback={!later.guard}
        sentence={<Say nugget={later} term />} />

      <Beat id="twins" track="chapter-1" label="Same pace, apart" title={bands}>
        <Dumbbell rows={cost.map((b) => ({ id: b.label, label: `${b.label} pace`, a: 0, b: b.slowdown_finish_s - b.other_finish_s, display: `+${minutes(b.slowdown_finish_s - b.other_finish_s)}` }))}
          domain={[0, gTop]} ticks={[0, 600, 1200, 1800].filter((t) => t <= gTop).map((t) => ({ value: t, label: t === 0 ? '0' : t === gTop ? `+${t / 60} min` : `+${t / 60}` }))}
          keyLabels={{ a: 'No sustained slowdown', b: 'Sustained slowdown' }}
          label={`Minutes later at the finish after a sustained slowdown, for each pace through 20K: ${Math.round(Number(bands.values.low_s) / 60)} to ${Math.round(Number(bands.values.high_s) / 60)} minutes.`}
          values={(
            <Values id="fk-twins" caption="Median finish by pace through 20K, with and without a sustained slowdown"
              columns={[{ key: 'p', label: 'Pace through 20K' }, { key: 'a', label: 'Without' }, { key: 'b', label: 'With' }, { key: 'g', label: 'Apart' }]}
              rows={cost.map((b) => [b.label, hm(b.other_finish_s / 60), hm(b.slowdown_finish_s / 60), minutes(b.slowdown_finish_s - b.other_finish_s)])} />
          )} />
      </Beat>

      <Beat id="warning" track="chapter-2" label="The warning sign" title={warning}>
        <Columns max={wTop} items={w.rows.map((r, i) => ({ id: r.label, label: r.label.replace(/ slower$/, '').replace(/% /, '%'), value: r.later, display: pct(r.later), tone: i === w.rows.length - 1 ? 'signal' : 'ink' }))}
          label={`How often each pace at ${sectionName(w.after)}, against the 5–20K pace, was followed by a sustained slowdown: from ${pct(w.rows[0].later)} to ${pct(w.rows[w.rows.length - 1].later)}.`}
          caption={`Pace at ${sectionName(w.after)} against the 5–20K pace`}
          values={(
            <Values id="fk-warning" caption={`Pace at ${sectionName(w.after)} against the 5–20K pace, and the share that went on to a sustained slowdown`}
              columns={[{ key: 'p', label: `Pace at ${sectionName(w.after)}` }, { key: 's', label: 'Went on to one' }]}
              rows={w.rows.map((r) => [r.label, pct(r.later)])} />
          )} />
      </Beat>

      <Beat id="states" track="chapter-3" label="No second wind" title={stay} aliases={['break']}>
        <DotGrid lit={s.stay * 100} label={`Of 100 finishes at sustained-slowdown pace over ${sectionName(s.source)}, ${Math.round(s.stay * 100)} stayed that slow over ${sectionName(s.target)}.`}
          caption={<><strong>{Math.round(s.stay * 100)} of 100</strong> stayed that slow. {Math.round(s.back_within_10 * 100) < 1 ? 'Under 1' : Math.round(s.back_within_10 * 100)} got back within 10% of their early pace.</>} />
      </Beat>

      <Beat id="magnet" track="chapter-4" label="The last stretch" title={magnet} aliases={['women-men']}>
        <Columns max={mTop} items={lastFour.map((m, i) => ({ id: m.section, label: sectionName(m.section), value: m.all, display: pct(m.all), tone: i === lastFour.length - 1 ? 'signal' : 'ink' }))}
          label={`The share of finishes that ran each section faster than the one before: ${lastFour.map((m) => `${sectionName(m.section)} ${pct(m.all)}`).join(', ')}.`}
          caption="Ran the section faster than the one before"
          values={(
            <Values id="fk-magnet" caption="Ran the section faster than the one before"
              columns={[{ key: 's', label: 'Section' }, { key: 'a', label: 'All finishes' }, { key: 'd', label: 'With a sustained slowdown' }]}
              rows={data.magnet.map((m) => [sectionName(m.section), pct(m.all), pct(m.slowdown)])} reading={data.magnet.length - 1} />
          )} />
      </Beat>

      <Moved id="bank" href="/analyses/starting-pace">Fast starts and what followed are now on Starting pace.</Moved>
      <Moved id="follows" href="/analyses/finding-improvement">The next race after a sustained slowdown is now on Where improvement happens.</Moved>
    </StoryPage>
  );
}
