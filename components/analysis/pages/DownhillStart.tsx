import DotGrid from '@/components/viz/DotGrid';
import Dumbbell from '@/components/viz/Dumbbell';
import Values from '@/components/ui/Values';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import AnalysisShell, { AnswerCard, Beat, ExploreBeat } from '../Shell';
import { publishedCourses } from '@/lib/analysis-server';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getNugget } from '@/lib/nuggets';
import { countWord, pct } from '@/lib/nuggets/format';
import { bandWords } from '@/lib/all-finisher-context';
import { courseName } from '@/lib/nuggets/analyses';

const PATH = '/analyses/downhill-start';
/** "Boston, Sydney and Warsaw". */
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** Chapter 02, page 2: a downhill start and the opening, then opening band by opening band, then Make it yours. */
export default function DownhillStart() {
  const raw = getAllFinisherContextStart('downhill');
  const start = { ...raw, cities: publishedCourses(raw.cities) };
  const opening = getNugget('downhill.opening'), bands = getNugget('downhill.bands');
  const v = opening.values as { downhill: number; other: number; courses: number };
  const rows = start.opening_bands.map((band) => ({
    band, down: start.initial.downhill.find((g) => g.terrain === 'downhill' && g.opening === band.id), other: start.initial.downhill.find((g) => g.terrain === 'other' && g.opening === band.id),
  })).filter((r) => r.down && r.other);
  const lit = (share: number) => Math.round(share * 100);
  // The downhill-start courses by name, from the data: every course whose editions the downhill groups hold, so a runner
  // can tell whether their race is one of them.
  const down = new Set(start.initial.downhill.filter((g) => g.terrain === 'downhill').flatMap((g) => g.edition_indices ?? []));
  const named = start.initial.courses.filter((c) => (c.edition_indices ?? []).some((i) => down.has(i))).map((c) => courseName(c.label));
  const band = (label: string) => bandWords(label).replace(/^[a-z]/, (c) => c.toUpperCase());
  // The largest downhill-start course's share of the group's finishes (Boston's, about four in five), said once in the
  // dek, so a reader knows whose race the group mostly is.
  const downN = start.initial.downhill.filter((g) => g.terrain === 'downhill').reduce((t, g) => t + g.n, 0);
  const biggest = start.initial.courses.filter((c) => (c.edition_indices ?? []).some((i) => down.has(i))).reduce<{ label: string; n: number } | null>((b, c) => (!b || c.n > b.n ? c : b), null);
  const most = biggest && downN ? biggest.n / downN : 0;
  // Said as a finding, not a cohort note (critic round 5): "Mostly Boston, with Sydney and Warsaw, against every other course."
  const big = biggest ? courseName(biggest.label) : '';
  const dek = named.length === v.courses && named.length > 1
    ? most >= 0.5 ? `Mostly ${big}, with ${and(named.filter((c) => c !== big))}, against every other course.` : `${and(named)} against every other course.`
    : 'Downhill-start courses against every other course.';
  const answer = (
    <AnswerCard kicker="Of 100, opened over 5% fast" className="answer-pair is-null">
      <div className="answer-grids">
        <div className="answer-grid">
          {/* Both grids in one mark (critic round 4: orange on one side and rings on the other read as a difference, and a
              ring means "you"): the matching numbers carry the null. */}
          <DotGrid lit={lit(v.downhill)} compare label={`${lit(v.downhill)} of 100 finishes on downhill-start courses opened over 5% fast`} />
          {/* The dek names the courses; the grid says which side it is. */}
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
  // The explorer opens on a fast opening, the page's subject (critic round 5: "within 2%" continued neither the downhill
  // nor the fast start): the bounded band over 5% fast ("5–10% fast"), never the open "over 10% fast" whose rate the
  // previous page gave from another comparison; else the band where the two kinds of course differ most.
  const edges = (band: unknown) => band as { lower?: number | null; upper?: number | null };
  const fastOpen = rows.find((r) => { const e = edges(r.band); return typeof e.upper === 'number' && e.upper <= -5 && e.lower != null; });
  const clearest = fastOpen ?? rows.reduce<(typeof rows)[number] | undefined>((b, r) => (!b || Math.abs(r.other!.slowdown_pct - r.down!.slowdown_pct) > Math.abs(b.other!.slowdown_pct - b.down!.slowdown_pct) ? r : b), undefined);
  return (
    <AnalysisShell path={PATH} title={opening} dek={dek} answer={answer}>
      <Beat id="by-band" track="chapter-1" label="Band by band" title={bands} term>
        {/* Bare rows: the label and a wide track, so a gap of a point or two reads; the values are in Values. No row is
            the accent: the H2 states the pattern across every band, and a near-null looks null. */}
        <Dumbbell bare rows={rows.map((r) => ({ id: r.band.id, label: band(r.band.label), a: r.other!.slowdown_pct / 100, b: r.down!.slowdown_pct / 100, display: pct(r.down!.slowdown_pct / 100) }))}
          domain={[lo, top]} ticks={[lo, (lo + top) / 2, top].map((t) => ({ value: t, label: pct(t) }))} keyLabels={{ a: 'Every other course', b: 'Downhill-start courses' }}
          label={`Sustained slowdown by opening band, downhill-start courses against every other course: 2 points or more fewer in ${bands.values.fewer} of ${bands.values.total} bands, ${Number(bands.values.more) ? `2 points or more higher in ${bands.values.more}, ` : ''}within a point or so in the rest`}
          values={<Values id="dh-bands" caption="Sustained slowdown by opening band" columns={[{ key: 'b', label: 'Opening', text: true }, { key: 'd', label: 'Downhill-start courses' }, { key: 'o', label: 'Every other course' }]}
            rows={rows.map((r) => [band(r.band.label), pct(r.down!.slowdown_pct / 100), pct(r.other!.slowdown_pct / 100)])} />} />
      </Beat>
      <ExploreBeat track="chapter-2"><AllFinisherAnalysis kind="downhill" start={start} linkTerm={false} opening={clearest?.band.id} untouched="none" /></ExploreBeat>
    </AnalysisShell>
  );
}
