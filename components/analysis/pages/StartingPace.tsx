import Receipt from '@/components/ui/Receipt';
import Values from '@/components/ui/Values';
import LineProfile from '@/components/viz/LineProfile';
import FastStartAnalysis from '@/components/FastStartAnalysis';
import AnalysisShell, { Beat, ExploreBeat } from '../Shell';
import GoalLine from '../GoalLine.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getFastStartStarts } from '@/lib/fast-start-server';
import { fastEdge } from '@/lib/fast-start';
import { readInsight } from '@/lib/insights-server';
import type { Kick } from '@/lib/insights';
import { getNugget } from '@/lib/nuggets';
import { openingWords } from '@/lib/nuggets/analyses';
import { delta, ms, pct, spokenTime } from '@/lib/nuggets/format';

const PATH = '/analyses/starting-pace';

/** Chapter 02, page 1: the matched bank-and-pay answer, the U-curve of opening pace, then Make it yours. */
export default function StartingPace() {
  const definition = analysisBySlug('starting-pace')!;
  const bank = getNugget('kick.bank'), sweet = getNugget('kick.sweetspot');
  const starts = getFastStartStarts();
  const v = bank.values as { band?: string; open_s?: number; after20_s?: number; finish_s?: number };
  const edge = (() => { const b = starts.all.bands.find((x) => x.label === v.band); return b ? fastEdge(b) : null; })();
  const said = (v.band ?? '').replace(/^More than (\d+)% faster$/i, 'more than $1% fast').replace(/^[A-Z]/, (c) => c.toLowerCase());
  const answer = v.band ? (
    <Receipt kicker={`First 5K ${v.band.toLowerCase()}`}
      lines={[
        { label: 'First 5K', key: 'ahead of the same pace', value: delta(v.open_s!), sr: `${spokenTime(Math.abs(v.open_s!))} ahead` },
        { label: 'After 20K', key: 'behind it', value: delta(v.after20_s!), sr: `${spokenTime(Math.abs(v.after20_s!))} behind` },
      ]}
      result={{ label: 'At the finish', value: `${ms(v.finish_s!)} behind`, sr: `${spokenTime(v.finish_s!)} behind`, fallback: bank.guard ? undefined : `Finished ${ms(Math.abs(v.finish_s!))} ${v.finish_s! > 0 ? 'behind' : 'ahead'}` }}
      footer="Same race · same 5–20K pace"
      goal={edge !== null ? <GoalLine band={said} edge={edge} /> : undefined} />
  ) : null;
  return (
    <AnalysisShell path={PATH} title={bank} dek={definition.title} answer={answer}>
      <Beat id="sweet-spot" track="chapter-1" label="The sweet spot" title={sweet}><OpeningCurve /></Beat>
      <ExploreBeat track="chapter-2"><FastStartAnalysis starts={starts} /></ExploreBeat>
    </AnalysisShell>
  );
}

/** The U-curve: the finish against same-pace finishes, by first-5K pace, scrubbable, opening on the best point. */
function OpeningCurve() {
  const kick = readInsight<Kick>('kick.json');
  const curve = [...kick.bank.curve].filter((c) => c.n >= 100).sort((a, b) => a.lo - b.lo);
  const xs = curve.map((c) => c.lo + 0.5);
  const best = curve.reduce((a, b) => (b.finish_s < a.finish_s ? b : a));
  const lo = Math.min(...curve.map((c) => c.finish_s)), hi = Math.max(...curve.map((c) => c.finish_s));
  const step = 120;
  const yTicks = [Math.ceil(hi / step) * step, Math.floor(lo / step) * step].map((value) => ({ value, label: delta(value) }));
  const floor = yTicks[1].value - step * 0.75;
  const evenI = curve.findIndex((c) => c.lo === 0);
  const fastI = curve.reduce((b, c, i) => (c.lo + 1 <= -10 && (b < 0 || c.lo > curve[b].lo) ? i : b), -1);
  const bestI = curve.indexOf(best);
  const span = xs[xs.length - 1] - xs[0];
  return (
    <LineProfile x={xs} yDomain={[floor, Math.max(hi, yTicks[0].value)]}
      layers={[{ id: 'u', label: 'Finish', series: [{ id: 'finish', values: curve.map((c) => c.finish_s), fillAbove: 0 }],
        points: [{ x: best.lo + 0.5, y: best.finish_s, kind: 'best' }],
        labels: [{ x: best.lo + 0.5, y: best.finish_s, text: `Best ${delta(best.finish_s)}`, priority: 3, prefer: 'below' }] }]}
      refs={[{ value: 0, label: 'same pace' }]}
      xTicks={[-10, -5, 0, 5, 10].filter((t) => t >= curve[0].lo && t <= curve[curve.length - 1].lo + 1).map((t) => ({ value: t, label: t === 0 ? 'even' : `${Math.abs(t)}%` }))}
      axisTitle={{ start: 'Faster first 5K', end: 'Slower first 5K' }}
      yTicks={yTicks}
      scrub={{
        label: 'First 5K against the pace that followed',
        points: { x: xs.map((x) => (x - xs[0]) / span), keys: curve.map((c) => `First 5K ${openingWords(c.lo)}, at the finish`), values: curve.map((c) => delta(c.finish_s)),
          side: [{ label: 'After 20K', values: curve.map((c) => delta(c.after20_s)) }, { label: 'Sustained slowdown', values: curve.map((c) => pct(c.slowdown)) }] },
        initial: bestI, detents: [evenI, bestI, fastI].filter((i) => i >= 0),
      }}
      label={`The finish against same-pace finishes, by first-5K pace; the best average finish went with a first 5K ${openingWords(best.lo)}`}
      values={<Values id="sp-curve-values" caption="The finish against the same 5–20K pace, by first 5K"
        columns={[{ key: 'b', label: 'First 5K', text: true }, { key: 'o', label: 'First 5K time' }, { key: 'f', label: 'At the finish' }, { key: 's', label: 'Sustained slowdown' }]}
        rows={kick.bank.bands.map((b) => [b.label, delta(b.open_s), delta(b.finish_s), pct(b.slowdown)])} />}
      height={220} heightMd={280} />
  );
}
