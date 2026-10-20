import Receipt from '@/components/ui/Receipt';
import Values from '@/components/ui/Values';
import LineProfile from '@/components/viz/LineProfile';
import FastStartAnalysis from '@/components/FastStartAnalysis';
import AnalysisShell, { Beat, ExploreBeat } from '../Shell';
import GoalLine from '../GoalLine.client';
import { analysisBySlug } from '@/lib/ten-analyses';
import { publishedCourses } from '@/lib/analysis-server';
import { getFastStartStarts } from '@/lib/fast-start-server';
import { fastEdge } from '@/lib/fast-start';
import { readInsight } from '@/lib/insights-server';
import type { Kick } from '@/lib/insights';
import { getNugget } from '@/lib/nuggets';
import { openingWords, sweetBand } from '@/lib/nuggets/analyses';
import { bandWords } from '@/lib/all-finisher-context';
import { ms, pct, spokenTime } from '@/lib/nuggets/format';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { howWeKnowOf } from '@/lib/chapters';

const PATH = '/analyses/starting-pace';
/** The page's methods, at the foot of its All numbers (the closing row is the way back alone). */
const HOW = howWeKnowOf(PATH) ?? undefined;
const capitalize = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase());
/** A gap against the same pace in words: "1:48 ahead", "2:04 behind", "even". */
const gap = (s: number) => { const r = Math.round(s); return r === 0 ? 'even' : `${ms(Math.abs(r))} ${r < 0 ? 'ahead' : 'behind'}`; };

/** Chapter 02, page 1: the matched bank-and-pay answer, the U-curve of opening pace, then Make it yours. */
export default function StartingPace() {
  const definition = analysisBySlug('starting-pace')!;
  const bank = getNugget('kick.bank'), sweet = getNugget('kick.sweetspot');
  const all = getFastStartStarts();
  // The explorer offers the course pages' list (the files also hold courses with no page).
  const starts = { all: { ...all.all, cities: publishedCourses(all.all.cities) }, history: { ...all.history, cities: publishedCourses(all.history.cities) } };
  const v = bank.values as { band?: string; open_s?: number; after20_s?: number; finish_s?: number; slowdown?: number; expected?: number };
  const edge = (() => { const b = starts.all.bands.find((x) => x.label === v.band); return b ? fastEdge(b) : null; })();
  const said = bandWords(v.band ?? '');
  // The two lines add up to the result: each is rounded from the same whole seconds, so the receipt never reads
  // 2:44 ahead + 7:49 behind = 5:06 behind. The second line is the finish less the first 5K, so it is named for what it
  // is, "From 5K on" (the 5–20K part, matched by design, is under a second; critic round 4: "After 20K" put a derived
  // 7:50 beside the data's 7:49). Each line says whom it is ahead of or behind, in words, with no sign.
  const total = Math.round(v.finish_s ?? NaN), open = Math.round(v.open_s ?? NaN), after = total - open;
  const side = (s: number) => (s < 0 ? 'ahead of' : 'behind');
  const answer = v.band ? (
    <Receipt kicker={`First 5K ${said}`}
      lines={[
        { label: 'First 5K', key: `${side(open)} runners with the same 5–20K pace`, value: ms(Math.abs(open)), sr: `${spokenTime(Math.abs(open))} ${side(open)} runners with the same 5–20K pace` },
        { label: 'From 5K on', key: `${after > 0 ? 'behind' : 'ahead of'} them`, value: ms(Math.abs(after)), sr: `${spokenTime(Math.abs(after))} ${after > 0 ? 'behind' : 'ahead of'} them` },
      ]}
      result={{ label: 'At the finish', value: `${ms(total)} behind`, sr: `${spokenTime(total)} behind`, fallback: bank.guard ? undefined : `Finished ${ms(Math.abs(total))} ${total > 0 ? 'behind' : 'ahead'}` }}
      goal={edge !== null ? <GoalLine band={said} edge={edge} /> : undefined} />
  ) : null;
  return (
    // The dek is the band's sustained slowdowns against the same race and pace (the term linked here, once, under the H1).
    <AnalysisShell path={PATH} numbers title={bank} answer={answer}
      dek={bank.guard && Number(v.slowdown) > Number(v.expected)
        ? <>Of these finishes, {pct(Number(v.slowdown))} had a <Link href={bank.term ?? '/methodology#sustained-slowdown'} className="term-link">sustained slowdown</Link>, against {pct(Number(v.expected))} at the same race and pace.</>
        : definition.title}>
      <Beat id="sweet-spot" track="chapter-1" label="The sweet spot" title={sweet}><OpeningCurve /></Beat>
      <ExploreBeat track="chapter-2"><FastStartAnalysis starts={starts} untouched="none" /></ExploreBeat>
    </AnalysisShell>
  );
}

/**
 * The U-curve: the finish against same-pace finishes, by first-5K pace, scrubbable, opening on the best point. The
 * plateau the H2 names (the bins within 10 seconds of the best) is washed, not one bin ringed: on a flat top the best
 * bin wins by a second or two.
 */
function OpeningCurve() {
  const kick = readInsight<Kick>('kick.json');
  const curve = [...kick.bank.curve].filter((c) => c.n >= 100).sort((a, b) => a.lo - b.lo);
  const xs = curve.map((c) => c.lo + 0.5);
  const best = curve.reduce((a, b) => (b.finish_s < a.finish_s ? b : a));
  const plateau = sweetBand(curve);
  const lo = Math.min(...curve.map((c) => c.finish_s)), hi = Math.max(...curve.map((c) => c.finish_s));
  const step = 120;
  // In words, as the readout and the receipt say a gap ("2:00 ahead", "6:00 behind"), never a sign to decode.
  const yTicks = [Math.ceil(hi / step) * step, Math.floor(lo / step) * step].map((value) => ({ value, label: gap(value) }));
  const floor = yTicks[1].value - step * 0.75;
  const bestI = curve.indexOf(best);
  const span = xs[xs.length - 1] - xs[0];
  // Each tick sits on its bin edge (round 6: on bin centres the washed 1–4% band read as about 0.5–3.5%), so the axis
  // reads true against the wash and the needle. No detents: each draws a dot on the axis, and the bins' centres never sit
  // on a labelled edge.
  const ticks = [-10, -5, 0, 5, 10].filter((t) => t >= curve[0].lo && t <= curve[curve.length - 1].lo + 1).map((t) => ({ value: t, label: t === 0 ? 'even' : `${Math.abs(t)}%` }));
  const detents: number[] = [];
  return (
    // Behind is down and ahead is up, as on every pace and gap chart on the site: the best finish is the curve's peak.
    // The behind side is a quiet fill (slower is never orange).
    // Half a bin of room at each end, so the outermost ticks (on bin centres) stay inside the axis.
    <LineProfile x={xs} xDomain={[xs[0] - 0.5, xs[xs.length - 1] + 0.5]} yDomain={[Math.max(hi, yTicks[0].value), floor]}
      layers={[{ id: 'u', label: 'Finish', series: [{ id: 'finish', values: curve.map((c) => c.finish_s), fillAbove: 0, fillTone: 'quiet' }] }]}
      refs={[{ value: 0, label: 'same pace' }]}
      washes={plateau && plateau.bins.length > 1 ? [{ from: plateau.from, to: plateau.to, fill: true }] : []}
      xTicks={ticks}
      axisTitle={{ start: 'Faster first 5K', end: 'Slower first 5K' }}
      yTicks={yTicks}
      scrub={{
        label: 'First 5K against the pace that followed',
        // On the plot's own x scale (half a bin of room each side), so the needle and its detents sit on the ticks.
        // The readout says each gap in words ("1:48 ahead"), as the receipt above does.
        // One line ("First 5K 2–3% slower · at the finish"): the washed band shows the plateau, so the key never repeats
        // the H2 (critic round 5).
        points: { x: xs.map((x) => (x - xs[0] + 0.5) / (span + 1)), keys: curve.map((c) => `First 5K ${openingWords(c.lo)} · at the finish`), values: curve.map((c) => gap(c.finish_s)),
          side: [{ label: 'After 20K', values: curve.map((c) => gap(c.after20_s)) }, { label: 'Sustained slowdown', values: curve.map((c) => pct(c.slowdown)) }] },
        initial: bestI, detents,
        // A dot marks where the needle meets the curve, at rest on the best bin too, so the readout is tied to it.
        follow: 'finish',
      }}
      label={`The finish against same-pace finishes, by first-5K pace; the best average finishes went with a first 5K ${plateau && plateau.bins.length > 1 ? `${plateau.from}–${plateau.to}% slower, within ${Math.round(plateau.spread)} seconds of each other` : openingWords(best.lo)}`}
      // The curve's own twin, 1% bin by bin, as the readout reads it (the explorer below gives the six wider bands).
      values={<Values id="sp-curve-values" how={HOW} caption="Against the same race and 5–20K pace, by first 5K"
        columns={[{ key: 'b', label: 'First 5K', text: true }, { key: 'f', label: 'At the finish' }, { key: 'a', label: 'After 20K' }, { key: 's', label: 'Sustained slowdown' }]}
        rows={curve.map((c) => [capitalize(openingWords(c.lo)), gap(c.finish_s), gap(c.after20_s), pct(c.slowdown)])} reading={bestI} />}
      height={220} heightMd={280} />
  );
}
