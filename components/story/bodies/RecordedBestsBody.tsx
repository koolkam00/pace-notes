import { getNugget, sentenceOf } from '@/lib/nuggets';
import { BESTS_PATH, finishBandWords, linkedFiles, signedPoints, type AgainRow } from '@/lib/nuggets/linked';
import { count, pct } from '@/lib/nuggets/format';
import { STORIES } from '@/lib/stories';
import LineProfile from '@/components/viz/LineProfile';
import GuessFirst from '@/components/ui/GuessFirst.client';
import Values from '@/components/ui/Values';
import IntervalRows, { type IntervalRow } from '@/components/linked/IntervalRows';
import { Beat, StoryHero, StoryPage } from '../StoryPage';

const AGAIN_WORDS = { more_often: 'More often', less_often: 'Less often' } as const;

/** A recorded-again row as an interval row: its dot and words only under its verdict, else "No reading". */
export function againRow(r: AgainRow, label: string): IntervalRow {
  return { id: label, label, lo: r.lo_points, hi: r.hi_points, value: r.verdict ? r.difference_points : null,
    words: r.verdict ? `${AGAIN_WORDS[r.verdict]} · ${signedPoints(r.difference_points)}` : 'No reading', tone: r.verdict ? 'ink' : 'none' };
}
export function pointTicks(rows: IntervalRow[]) {
  const lo = Math.floor(Math.min(0, ...rows.map((r) => r.lo)) / 5) * 5, hi = Math.ceil(Math.max(0, ...rows.map((r) => r.hi)) / 5) * 5;
  const ticks = [] as { value: number; label: string }[];
  for (let t = lo; t <= hi; t += 5) ticks.push({ value: t, label: t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}` });
  return { domain: [lo, hi] as [number, number], ticks };
}

/**
 * Recorded bests: how often a second, third, … recorded marathon was the runner's recorded best so far, against what
 * order alone would give (1 in k). It opens on a guess (the second against the first), then the attempts one by one,
 * then who is recorded at another marathon at all, by finish time, each group against the other finishes of the same
 * races (recorded_again.json; the one comparison allowed: a `more_often` row against a `less_often` one).
 */
export default function RecordedBestsBody() {
  const story = STORIES.find((s) => s.slug === 'recorded-bests')!;
  const bests = linkedFiles.bests(), again = linkedFiles.again();
  const second = getNugget('bests.second'), later = getNugget('bests.later'), finish = getNugget('again.finish');
  const attempts = bests.by_recorded_attempt;
  const at = later.guard ? attempts.findIndex((a) => a.recorded_attempt === Number(later.values.from_attempt)) : -1;
  const xs = attempts.map((a) => a.recorded_attempt);
  const top = Math.ceil(Math.max(...attempts.map((a) => Math.max(a.share, a.shuffled_share))) * 10) / 10;
  const finishRows = again.by_finish.map((r) => againRow(r, capital(finishBandWords(r))));
  const scale = pointTicks(finishRows);

  return (
    <StoryPage path={BESTS_PATH} numbers={[
      <Values key="attempts" bare id="rb-attempts" caption="Recorded marathons that were the runner’s recorded best so far, by recorded marathon"
        columns={[{ key: 'k', label: 'Recorded marathon' }, { key: 's', label: 'A recorded best' }, { key: 'o', label: 'By order alone' }, { key: 'n', label: 'Results' }]}
        rows={attempts.map((a) => [String(a.recorded_attempt), pct(a.share), pct(a.shuffled_share), count(a.results)])} />,
      <Values key="again" bare id="rb-again" caption="Recorded at another marathon within two years: each finish band against the other finishes of the same races"
        columns={[{ key: 'b', label: 'Finish', text: true }, { key: 's', label: 'Recorded again' }, { key: 'e', label: 'Other finishes, same races' }, { key: 'd', label: 'Difference' }, { key: 'w', label: 'Reading', text: true }, { key: 'n', label: 'Finishes' }]}
        rows={again.by_finish_band.map((r) => [capital(finishBandWords(r)), pct(r.share), pct(r.expected_share), signedPoints(r.difference_points), r.verdict ? AGAIN_WORDS[r.verdict] : 'No reading', count(r.finishes)])} />,
    ]}>
      <StoryHero path={BESTS_PATH} title={story.heading ?? story.title} label="The guess"
        instrument={second.guard ? (
          <GuessFirst marks="ruler" min={0} max={100} step={1} unit="%" initial={50}
            question="Of second recorded marathons, how many were faster than the first?"
            truth={Number(second.values.share) * 100} truthLabel="were faster"
            compare={{ value: Number(second.values.shuffled) * 100, label: 'By order alone' }}
            answer={sentenceOf(second)} />
        ) : undefined}
        sentence={second.guard ? undefined : sentenceOf(second)} fallback={!second.guard} />

      <Beat id="later" track="chapter-1" label="Later marathons" title={later}
        dek="The share of each recorded marathon that beat every earlier one, against what order alone would give.">
        <LineProfile x={xs} xDomain={[xs[0], xs[xs.length - 1]]} yDomain={[0, top]}
          layers={[{ id: 'bests', label: 'Recorded bests', series: [
            { id: 'order', values: attempts.map((a) => a.shuffled_share), tone: 'quiet', dashed: true },
            { id: 'share', values: attempts.map((a) => a.share), tone: 'ink' },
          ],
          points: at >= 0 ? [{ x: xs[at], y: attempts[at].share, kind: 'compare' }] : [],
          labels: at >= 0 ? [{ x: xs[at], y: attempts[at].share, text: `${pct(attempts[at].share)} against ${pct(attempts[at].shuffled_share)}`, tone: 'ink', priority: 3, prefer: 'above' }] : [] }]}
          xTicks={xs.filter((k) => k === xs[0] || k % 5 === 0 || k === xs[xs.length - 1]).map((k) => ({ value: k, label: k === xs[0] ? `${k}nd` : String(k) }))}
          yTicks={[{ value: top, label: pct(top) }]}
          axisTitle={{ start: 'Recorded marathon', end: 'Later' }}
          keys={[{ label: 'A recorded best', mark: 'line', tone: 'ink' }, { label: 'By order alone', mark: 'dash', tone: 'quiet' }]}
          scrub={{ label: 'Recorded marathon', follow: 'share', initial: Math.max(0, at), detents: at >= 0 ? [0, at] : [0],
            points: { x: xs.map((k) => (k - xs[0]) / (xs[xs.length - 1] - xs[0])), keys: xs.map((k) => `Recorded marathon ${k}, a recorded best`), values: attempts.map((a) => pct(a.share)),
              side: [{ label: 'By order alone', values: attempts.map((a) => pct(a.shuffled_share)) }] } }}
          label={`Share of each recorded marathon that was a recorded best, against order alone: ${attempts.slice(0, 6).map((a) => `${a.recorded_attempt}: ${pct(a.share)} against ${pct(a.shuffled_share)}`).join('; ')}.`} />
      </Beat>

      <Beat id="again" track="chapter-2" label="Recorded again" title={finish}
        dek="Another recorded marathon within two years, each finish group against the other finishes of the same races.">
        <IntervalRows rows={finishRows} domain={scale.domain} ticks={scale.ticks} zeroLabel="Other finishes of the same races (points)"
          label={`Recorded at another marathon within two years, by finish time, against the other finishes of the same races: ${finishRows.map((r) => `${r.label} ${r.words}`).join('; ')}.`} />
      </Beat>
    </StoryPage>
  );
}

function capital(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }
