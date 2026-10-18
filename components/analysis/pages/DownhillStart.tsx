import DotGrid from '@/components/viz/DotGrid';
import Dumbbell from '@/components/viz/Dumbbell';
import Values from '@/components/ui/Values';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisShell, { AnswerCard, Beat, ExploreBeat } from '../Shell';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getNugget } from '@/lib/nuggets';
import { countWord, pct } from '@/lib/nuggets/format';
import { bandWords } from '@/lib/all-finisher-context';

const PATH = '/analyses/downhill-start';

/** Chapter 02, page 2: a downhill start and the opening, then opening band by opening band, then Make it yours. */
export default function DownhillStart() {
  const start = getAllFinisherContextStart('downhill');
  const opening = getNugget('downhill.opening'), bands = getNugget('downhill.bands');
  const v = opening.values as { downhill: number; other: number; courses: number };
  const rows = start.opening_bands.map((band) => ({
    band, down: start.initial.downhill.find((g) => g.terrain === 'downhill' && g.opening === band.id), other: start.initial.downhill.find((g) => g.terrain === 'other' && g.opening === band.id),
  })).filter((r) => r.down && r.other);
  const lit = (share: number) => Math.round(share * 100);
  const band = (label: string) => bandWords(label).replace(/^[a-z]/, (c) => c.toUpperCase());
  const answer = (
    <AnswerCard kicker="Of 100 finishes, opened over 5% fast" className="answer-pair">
      <div className="answer-grids">
        <div className="answer-grid">
          <DotGrid lit={lit(v.downhill)} label={`${lit(v.downhill)} of 100 finishes on downhill-start courses opened over 5% fast`} />
          <p className="answer-grid-label"><strong>{lit(v.downhill)}</strong> on the {countWord(v.courses)} downhill-start courses</p>
        </div>
        <div className="answer-grid">
          <DotGrid lit={lit(v.other)} compare label={`${lit(v.other)} of 100 finishes elsewhere opened over 5% fast`} />
          <p className="answer-grid-label"><strong>{lit(v.other)}</strong> on every other course</p>
        </div>
      </div>
    </AnswerCard>
  );
  // The axis spans the rates to the nearest ten points, so a few points' gap still reads.
  const all = rows.flatMap((r) => [r.down!.slowdown_pct, r.other!.slowdown_pct]);
  const lo = Math.floor(Math.min(...all) / 10) * 10 / 100, top = Math.ceil(Math.max(...all) / 10) * 10 / 100;
  return (
    <AnalysisShell path={PATH} title={opening} dek="What follows a downhill opening?" answer={answer}>
      <Beat id="by-band" track="chapter-1" label="Band by band" title={bands} term>
        {/* Bare rows: the label and a wide track, so a gap of a point or two reads; the values are in Values. */}
        <Dumbbell bare rows={rows.map((r) => ({ id: r.band.id, label: band(r.band.label), a: r.other!.slowdown_pct / 100, b: r.down!.slowdown_pct / 100, display: pct(r.down!.slowdown_pct / 100) }))}
          domain={[lo, top]} ticks={[lo, (lo + top) / 2, top].map((t) => ({ value: t, label: pct(t) }))} keyLabels={{ a: 'Every other course', b: 'Downhill-start courses' }}
          label={`Sustained slowdown by opening band, downhill-start courses against every other course: fewer in ${bands.values.fewer} of ${bands.values.total} bands`}
          values={<Values id="dh-bands" caption="Sustained slowdown by opening band" columns={[{ key: 'b', label: 'Opening', text: true }, { key: 'd', label: 'Downhill-start courses' }, { key: 'o', label: 'Every other course' }]}
            rows={rows.map((r) => [band(r.band.label), pct(r.down!.slowdown_pct / 100), pct(r.other!.slowdown_pct / 100)])} />} />
      </Beat>
      <ExploreBeat track="chapter-2"><AllFinisherAnalysis kind="downhill" start={start} linkTerm={false} /></ExploreBeat>
    </AnalysisShell>
  );
}
