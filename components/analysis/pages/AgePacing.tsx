import LineProfile from '@/components/viz/LineProfile';
import Values from '@/components/ui/Values';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { AnswerCard, ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart, getCityData } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getNugget } from '@/lib/nuggets';
import { ageRows } from '@/lib/nuggets/analyses';
import { hm } from '@/lib/nuggets/format';

const PATH = '/analyses/age-and-pacing';
/** One decimal everywhere ("+11.0%"), so a column of values reads alike. */
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;

/** Chapter 07, page 2: the second 20K by age, pooled and at the same finish time, on one chart; then Make it yours. */
export default function AgePacing() {
  const definition = analysisBySlug('age-and-pacing')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('age.retention');
  const goal = Number(n.values.goal_min);
  const rows = ageRows(getCityData(EXAMPLE_PROFILE.city), goal);
  const xs = rows.map((_, i) => i);
  const vals = rows.flatMap((r) => [r.pooled, r.same]);
  const lo = Math.floor(Math.min(...vals) / 2) * 2 - 2, hi = Math.ceil(Math.max(...vals) / 2) * 2 + 1;
  const pooledHi = rows.reduce((b, r, i) => (r.pooled > rows[b].pooled ? i : b), 0);
  const pooledLo = rows.reduce((b, r, i) => (r.pooled < rows[b].pooled ? i : b), 0);
  // The finding's own numbers on its own line: the range near the goal, labelled at the middle age group.
  const sameLo = Math.min(...rows.map((r) => r.same)), sameHi = Math.max(...rows.map((r) => r.same));
  const mid = Math.floor((rows.length - 1) / 2);
  const answer = rows.length >= 2 ? (
    <AnswerCard kicker="The second 20K, by age group">
      <LineProfile x={xs} xDomain={[-0.4, rows.length - 0.6]} yDomain={[lo, hi]}
        layers={[{ id: 'a', label: 'Age', series: [{ id: 'pooled', values: rows.map((r) => r.pooled), tone: 'quiet' }, { id: 'same', values: rows.map((r) => r.same), tone: 'signal' }],
          labels: [
            // The pooled line's top (the oldest group, the H1's "slowed more"); its low point has no room above it at
            // a phone's width, so it is read in Values.
            { x: pooledHi, y: rows[pooledHi].pooled, text: `${rows[pooledHi].age} ${signedPct(rows[pooledHi].pooled)}`, priority: 2, prefer: 'above' },
            { x: mid, y: rows[mid].same, text: `Near ${hm(goal)}: ${signedPct(sameLo)} to ${signedPct(sameHi)}`, tone: 'signal', priority: 3, prefer: 'below' },
          ] }]}
        // Three evenly spaced ages (the ends and the middle) at every width; every group is in Values.
        xTicks={[...new Set([0, Math.round((rows.length - 1) / 2), rows.length - 1])].map((i) => ({ value: i, label: rows[i].age }))}
        // Gridlines every 5 points inside the range, so the gap between the lines can be read; none near the top, where
        // the oldest group's label sits at the right edge.
        yTicks={Array.from({ length: Math.floor(hi / 5) - Math.ceil(lo / 5) + 1 }, (_, k) => (Math.ceil(lo / 5) + k) * 5).filter((t) => t > lo && t < Math.max(...vals) - 2).slice(-3).map((t) => ({ value: t, label: `${t > 0 ? '+' : t < 0 ? '−' : ''}${Math.abs(t)}%` }))}
        keys={[{ label: 'All finishes', mark: 'line', tone: 'quiet' }, { label: `Finishes near ${hm(goal)}`, mark: 'line', tone: 'signal' }]}
        label={`The second 20K against the first, by age group: pooled from ${signedPct(rows[pooledLo].pooled)} at ${rows[pooledLo].age} to ${signedPct(rows[pooledHi].pooled)} at ${rows[pooledHi].age}; near ${hm(goal)}, every age within ${Number(n.values.same_spread).toFixed(1)} points`}
        values={<Values id="age-two" caption="The second 20K against the first, by age group" columns={[{ key: 'a', label: 'Age group' }, { key: 'p', label: 'All finishes' }, { key: 's', label: `Near ${hm(goal)}` }]}
          rows={rows.map((r) => [r.age, signedPct(r.pooled), signedPct(r.same)])} />}
        height={200} heightMd={240} />
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} answer={answer}
      // The H1 is the finding at the same finish time; the pooled shape is its setup, here.
      dek={n.guard ? `Across all finishes, ${n.values.u_shape ? 'the youngest and oldest' : 'older runners'} slowed more.` : definition.title}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} untouched="none" />
      </ExploreBeat>
    </AnalysisShell>
  );
}
