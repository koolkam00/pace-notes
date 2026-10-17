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
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

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
  const answer = rows.length >= 2 ? (
    <AnswerCard kicker="The second 20K against the first, by age group">
      <LineProfile x={xs} xDomain={[-0.4, rows.length - 0.6]} yDomain={[lo, hi]}
        layers={[{ id: 'a', label: 'Age', series: [{ id: 'pooled', values: rows.map((r) => r.pooled), tone: 'quiet' }, { id: 'same', values: rows.map((r) => r.same), tone: 'signal' }],
          labels: [
            { x: pooledHi, y: rows[pooledHi].pooled, text: `${rows[pooledHi].age} ${signedPct(rows[pooledHi].pooled)}`, priority: 2, prefer: 'above' },
            { x: pooledLo, y: rows[pooledLo].pooled, text: `${rows[pooledLo].age} ${signedPct(rows[pooledLo].pooled)}`, priority: 1, prefer: 'above' },
            { x: rows.length - 1, y: rows[rows.length - 1].same, text: `near ${hm(goal)}`, tone: 'signal', priority: 3, prefer: 'below' },
          ] }]}
        xTicks={rows.map((r, i) => ({ value: i, label: r.age })).filter((_, i) => i % 2 === 0 || i === rows.length - 1)}
        yTicks={[{ value: Math.floor(hi), label: signedPct(Math.floor(hi)) }]}
        keys={[{ label: 'All finishes', mark: 'line', tone: 'quiet' }, { label: `Finishes near ${hm(goal)}`, mark: 'line', tone: 'signal' }]}
        label={`The second 20K against the first, by age group: pooled from ${signedPct(rows[pooledLo].pooled)} at ${rows[pooledLo].age} to ${signedPct(rows[pooledHi].pooled)} at ${rows[pooledHi].age}; near ${hm(goal)}, every age within ${Number(n.values.same_spread).toFixed(1)} points`}
        values={<Values id="age-two" caption="The second 20K against the first, by age group" columns={[{ key: 'a', label: 'Age group' }, { key: 'p', label: 'All finishes' }, { key: 's', label: `Near ${hm(goal)}` }]}
          rows={rows.map((r) => [r.age, signedPct(r.pooled), signedPct(r.same)])} />}
        height={200} heightMd={240} />
    </AnswerCard>
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
