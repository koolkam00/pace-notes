import type { ComponentProps } from 'react';
import type { HalfWindow } from '@/lib/half-types';
import { readHalf } from '@/lib/half-server';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { halfDeks } from '@/lib/nuggets/half';
import { count, hm, pct } from '@/lib/nuggets/format';
import { NOT_A_PREDICTION, floorHM, paceGap, readoutMark, windowOverDouble } from '@/lib/tools/half-to-full';
import type { UnitSystem } from '@/lib/units';
import { STORIES } from '@/lib/stories';
import { ScopeTag } from '@/components/tools/EvidenceTag';
import Ruler from '@/components/viz/Ruler';
import LineProfile from '@/components/viz/LineProfile';
import Dumbbell from '@/components/viz/Dumbbell';
import GuessFirst from '@/components/ui/GuessFirst.client';
import Values from '@/components/ui/Values';
import PredictorLink from '@/components/half/PredictorLink.client';
import { SaveImage } from '@/components/half/HalfCharts';
import { HalfWay } from '@/components/half/HalfWays';
import { Beat, Say, SayText, StoryHero, StoryPage, rich } from '../StoryPage';

const PATH = '/stories/half-to-full';
/** The flagship's half (1:45, the band nearest the pooled median half) and the readout's other detents, seconds. */
const DETENTS = [5400, 6300, 7200, 8100];
/** The five-minute windows the chart and its readout step through (the 5-minute bands centred on round times). */
const BAND_S = 300;
const M = 'Recorded men’s';
/** A window's 8-in-10 wash is drawn at full strength from this many pairs; thinner windows (the slow end) are faint. */
const THIN = 300;
const minutes = (s: number) => s / 60;
/** A guess grid's name with its leading words marked, so a column too narrow for "Recorded women’s: 10" puts "Recorded"
 *  on its own line in both grids and the two names break alike (guess.css; 320 px, round 3 review). */
const gridName = (name: string) => { const at = name.lastIndexOf(' '); return <><span className="guess-dots-name-head">{name.slice(0, at + 1)}</span>{name.slice(at + 1)}</>; };
/** "+21" minutes, from seconds, one decimal where the ruler needs it. */
const plus = (s: number) => `${s >= 0 ? '+' : '−'}${Math.round(Math.abs(s) / 60)}`;

/**
 * From the half to the marathon (chapter 11's opener): the marathons that followed a half 3 to 16 weeks before, for
 * records linked by name (public/data/half/linked.json). Every figure is a linked one, so the page carries the scope
 * chip once, after the dek, and its root says so (data-half-scope="linked"). Words and figures are the half nuggets
 * (lib/nuggets/half.ts) and the tool sentences (lib/tools/half-to-full.ts); the page types no number.
 *
 * The reading (the typical marathon took double the half plus 21 minutes; only 8% came in under double; a ruler of the
 * minutes over double), then two beats: the marathons after each half time (a profile with a needle, the typical
 * marathon and the middle 80%, the share under the nearest round time, and the link into the predictor at the scrubbed
 * half), and women and men after the same half (the page's one guess, under a heading that does not give its answer
 * away; the reading comes with the reveal), then the way to /half. One All numbers fold at the foot.
 */
export default function HalfToFullBody() {
  const story = STORIES.find((s) => s.slug === 'half-to-full')!;
  const linked = readHalf('linked.json');
  const deks = halfDeks();
  const extra = getNugget('half.extra'), range = getNugget('half.range'), sexes = getNugget('half.sexes'), guess = getNugget('half.sexesGuess');
  // The hero's figure is the nugget's: a reading only under a guard of its own, else the count of pairs (lib/nuggets/half.ts
  // halfExtraFrom). A table row is marked as the page's reading only while that reading is stated (review, October 30, 2026).
  const figure = extra.figure;
  const Q = linked.Q;
  const q = (w: HalfWindow, level: number) => w.q[Q.findIndex((x) => Math.abs(x - level) < 1e-9)];

  // The reading's ruler: minutes over double the half, typical and the middle half of marathons.
  const e = linked.overall.extra_s;
  const underDouble = linked.overall.under_double_plus_min['0'];
  // The hero's figure (8% under double) has its place on the scale: the line left of "Double" is thickened in the quiet
  // tone and keyed with the figure, while the figure is that share (its own guard); orange stays the typical dot alone.
  const shaded = extra.values.figure_is_share === 1;
  // The band's own label has no room beside "Typical" on a phone, so a key under the ruler names it. The scale's zero is
  // double the half, named on the axis itself ("Double"), so the ink dot there keeps its name at every width (a label
  // above it lost its place to "Typical" at 200% zoom). Under the key, the note that the minutes grow with the half, next
  // to the H1 whose 21 it qualifies.
  const ruler = (
    <>
      <Ruler className="half-ruler" min={-20} max={60} ticks={[0, 15, 30, 45].map((v) => ({ value: v, label: v ? `+${v} min` : 'Double' }))}
        marks={[{ value: 0, kind: 'compare' }, { value: minutes(e.p50), kind: 'reading', label: 'Typical' }]}
        band={{ lo: minutes(e.p25), hi: minutes(e.p75) }} shade={shaded ? { lo: -20, hi: 0 } : undefined}
        label={`Minutes over double the half: typical plus ${Math.round(e.p50 / 60)}; half of these marathons between plus ${Math.round(e.p25 / 60)} and plus ${Math.round(e.p75 / 60)}${shaded ? `; ${pct(underDouble)} under double` : ''}.`} />
      <ul className="half-ruler-key" aria-hidden="true">
        {shaded ? <li><i className="is-shade" />Under double: <b>{pct(underDouble)}</b></li> : null}
        <li><i />Half of them: <b>{plus(e.p25)} to {plus(e.p75)} min</b></li>
      </ul>
      {deks.scale ? <p className="half-ruler-note">{deks.scale}</p> : null}
    </>
  );

  // Beat 1: the five-minute windows from the first to the last published, one scrub point each.
  const bands = linked.windows.all.filter((w) => w.h % BAND_S === 0);
  const xs = bands.map((w) => w.h);
  const lo = xs[0], hi = xs[xs.length - 1];
  const home = Math.max(0, bands.findIndex((w) => w.h === range.values.h));
  const markOf = bands.map((w) => readoutMark(w));
  const yLo = Math.min(...bands.map((w) => Math.min(q(w, 0.1), 2 * w.h))), yHi = Math.max(...bands.map((w) => Math.max(q(w, 0.9), 2 * w.h)));
  // The plot holds the middle 8 in 10 and double the half, to the 10 minutes around them (no empty half hour above).
  const yDomain: [number, number] = [Math.floor(yLo / 600) * 600, Math.ceil(yHi / 600) * 600];
  // The chart is drawn on the server; the lines under it (the pace against the half, "Not a prediction." and the link
  // into the predictor) follow its needle in the browser (PredictorLink). Each window's minutes over double are its
  // typical marathon as printed minus double its half (windowOverDouble), so the readout's "Typical" and "double the
  // half plus N min", its pace against the half and the table's "Over double" add up with the times beside them.
  const over = bands.map((w) => windowOverDouble(w));
  const paces = (u: UnitSystem) => over.map((x) => { const gap = paceGap(x * 60, u); return { gap: `${Math.round(Math.abs(gap))} s/${u}`, word: gap < 0 ? 'quicker' as const : 'slower' as const }; });
  const profile: ComponentProps<typeof LineProfile> = {
    x: xs, xDomain: [lo, hi], yDomain,
    layers: [{
      id: 'after', label: 'Marathons',
      // The wash is lighter where a window holds fewer than THIN pairs (2:30 to 2:45), so its noisy slow end stays quiet;
      // it fades into it from 2:25, and the key names it.
      band: { lo: bands.map((w) => q(w, 0.1)), hi: bands.map((w) => q(w, 0.9)), faint: bands.map((w) => w.n < THIN) },
      series: [{ id: 'median', values: bands.map((w) => w.q[9]), tone: 'ink' }, { id: 'double', values: xs.map((h) => 2 * h), dashed: true }],
    }],
    // The spec's ticks: 1:15, 1:45, 2:15 and 2:45 on a phone, the half hours between them from a 600 px figure (on a
    // phone 2:30 crowded the end label, 2:45, set flush right).
    xTicks: [4500, 5400, 6300, 7200, 8100, 9000, 9900].filter((h) => h >= lo && h <= hi)
      .map((h) => ((h / 60) % 30 === 15 ? { value: h, label: floorHM(h), priority: 3 } : { value: h, label: floorHM(h), priority: 1, from: 600 })),
    // Gridlines on every hour inside the plot, 3:00 to 6:00 (the spec's four; the forms' three-line limit lifted for this
    // chart), so the quick end the first stops read (a 2:29 marathon after a 1:10 half) has 3:00 to read against. Their
    // labels sit over the data on a halo of the page, so the dashed double-the-half never strikes one through.
    yTicks: Array.from({ length: Math.floor(yDomain[1] / 3600) - Math.ceil(yDomain[0] / 3600) + 1 }, (_, i) => (Math.ceil(yDomain[0] / 3600) + i) * 3600)
      .filter((s) => s > yDomain[0] && s < yDomain[1]).map((s) => ({ value: s, label: floorHM(s) })),
    gridMax: 4,
    gridSide: 'left',
    // The key draws the wash as the plot does, and its lighter stretch where windows hold fewer than THIN pairs, named as
    // the same range with less behind it ("Fewer marathons" read as a third band of rarer finishes; round 4 review).
    keys: [{ label: 'Typical marathon', mark: 'line' }, { label: '8 in 10', mark: 'wash' },
      ...(bands.some((w) => w.n < THIN) ? [{ label: '8 in 10, from fewer marathons', mark: 'wash-thin' as const }] : []), { label: 'Double the half', mark: 'dash' }],
    axisTitle: { end: 'Half time' },
    scrub: {
      label: `Half time, ${floorHM(lo)} to ${floorHM(hi)}`,
      points: {
        x: xs.map((h) => (h - lo) / (hi - lo)),
        keys: bands.map((w) => `After a ${floorHM(w.h)} half`),
        values: bands.map((w) => floorHM(w.q[9])),
        side: [
          { label: '8 in 10', values: bands.map((w) => `${floorHM(q(w, 0.1))}–${floorHM(q(w, 0.9))}`) },
          // Keyed per point ("Under 4:00" over "67%"), as /half's readout keys its time and leaves the share bare.
          { label: 'Under', labels: bands.map((_, i) => (markOf[i] ? `Under ${floorHM(markOf[i]![0])}` : 'Under')), values: bands.map((_, i) => (markOf[i] ? pct(markOf[i]![1]) : '—')) },
        ],
      },
      initial: home, detents: DETENTS.map((h) => bands.findIndex((w) => w.h === h)).filter((i) => i >= 0), follow: 'median', flipGrid: true,
    },
    label: `The marathon after each half time, ${floorHM(lo)} to ${floorHM(hi)}: the typical marathon and the middle 8 in 10, against double the half. ${sentenceOf(range).replace(/\*/g, '')}`,
    height: 220, heightMd: 280,
  };
  const chart = (
    <div className="half-after-chart">
      <LineProfile {...profile} />
      <PredictorLink halves={bands.map((w) => floorHM(w.h))} paces={{ mi: paces('mi'), km: paces('km') }} initial={home}
        extras={over} under={bands.map((w) => `${Math.round(w.under_double * 100)} in 100`)} not={NOT_A_PREDICTION} />
    </div>
  );

  // Beat 2: the guess at the flagship's half, or (without both sexes there) the bands side by side.
  const F = linked.windows.F, Mw = linked.windows.M;
  const both = F.filter((f) => f.h % BAND_S === 0 && Mw.some((m) => m.h === f.h)).map((f) => ({ h: f.h, f, m: Mw.find((m) => m.h === f.h)! }));
  const hasGuess = guess.guard && deks.guess !== null;
  const women = F.find((w) => w.h === guess.values.h), men = Mw.find((w) => w.h === guess.values.h);
  const showGuess = hasGuess && !!women && !!men;

  return (
    <StoryPage path={PATH} halfScope="linked" numbers={[
      // The page's own words for the spreads ("8 in 10", and "Half of them" as the ruler's key says it), as ranges, not
      // percentile codes; "Middle half" read as a half-marathon range in a table whose first column is the half.
      <Values key="bands" bare id="hf-bands" caption="The marathon after each half time"
        columns={[{ key: 'h', label: 'Half' }, { key: 't', label: 'Typical' }, { key: 'r80', label: '8 in 10' }, { key: 'r50', label: 'Half of them' },
          { key: 'x', label: 'Over double' }, { key: 'u', label: 'Under double' }, { key: 'm', label: 'Under a round time' }, { key: 'n', label: 'Pairs' }, { key: 'e', label: 'Marathon editions' }]}
        rows={bands.map((w, i) => [floorHM(w.h), floorHM(w.q[9]), `${floorHM(q(w, 0.1))}–${floorHM(q(w, 0.9))}`, `${floorHM(q(w, 0.25))}–${floorHM(q(w, 0.75))}`,
          `${plus(over[i] * 60)} min`, pct(w.under_double, 1), markOf[i] ? `${floorHM(markOf[i]![0])}: ${pct(markOf[i]![1], 1)}` : '—', count(w.n), count(w.e)])}
        reading={range.guard ? home : undefined} />,
      <Values key="double" bare id="hf-double" caption="Marathons under double the half, and within 10 to 40 minutes over it"
        columns={[{ key: 'w', label: 'Under' }, { key: 's', label: 'Share of marathons' }]}
        rows={(['0', '10', '20', '30', '40'] as const).map((k) => [k === '0' ? 'Double the half' : `Double the half + ${k} min`, pct(linked.overall.under_double_plus_min[k], 1)])}
        reading={shaded ? 0 : undefined} />,
      // The two shares first under short headers, so recorded women's and men's sit side by side on a phone.
      <Values key="sexes" bare id="hf-sexes" caption="Recorded women’s and men’s marathons after the same half: the share with a sustained slowdown, then the typical marathon and the pairs"
        columns={[{ key: 'h', label: 'Half' }, { key: 'fs', label: 'Women’s' }, { key: 'ms', label: 'Men’s' },
          { key: 'ft', label: 'Women’s typical' }, { key: 'mt', label: 'Men’s typical' }, { key: 'fn', label: 'Women’s pairs' }, { key: 'mn', label: 'Men’s pairs' }]}
        rows={both.map(({ h, f, m }) => [floorHM(h), pct(f.sus, 1), pct(m.sus, 1), floorHM(f.q[9]), floorHM(m.q[9]), count(f.n), count(m.n)])}
        reading={both.findIndex((b) => b.h === guess.values.h)} />,
    ]}>
      <StoryHero path={PATH} title={story.heading ?? story.title} stacked fallback={!extra.guard}
        // The dek says what the page pairs and where to look, and states no reading, so it reads the same under the
        // plain H1 (review, October 30, 2026: the old verbless dek was written to qualify the reading H1).
        dek={<>{rich(deks.hero, { linked: true })} <ScopeTag /></>}
        figure={figure ? { value: figure.value, unit: figure.unit, sr: figure.sr } : undefined} unitLine={figure ? extra.key : undefined}
        instrument={extra.guard ? ruler : undefined} />

      <Beat id="after" track="chapter-1" label="Half by half" title={range} dek={deks.range ?? undefined}>
        {chart}
        <SaveImage slug="half-double" />
      </Beat>

      {/* With the guess, the heading is the beat's neutral line and the reading comes with the reveal, after the guess's
          own answer: a heading that says "far fewer" gave the guess away before the reader made it (review, October
          30, 2026; round numbers puts a teaser over its guess the same way). Without the guess, the heading is the
          nugget, as every beat's is. */}
      <Beat id="women-men" track="chapter-2" label="Women and men" title={showGuess ? <SayText text={sexes.fallback} term plain /> : <Say nugget={sexes} term />}>
        {showGuess ? (
          // The men's 100 stand beside the guess from the start (the question gives them), so the reveal shows the two
          // side by side. The other halves' comparison and the card (which prints the answer) come only after it.
          <GuessFirst marks="dots" unit="of 100" initial={Number(guess.values.men_of_100)}
            question={deks.guess!} truth={women!.sus * 100} truthLabel="had a sustained slowdown" truthName={gridName('Recorded women’s')} compareName={gridName(M)}
            compare={{ value: men!.sus * 100, label: M }} answer={sexes.guard ? `${sentenceOf(guess)} ${sentenceOf(sexes).replace(/\*/g, '')}` : sentenceOf(guess)}
            after={<>{deks.guessMore ? <p className="half-guess-more">{deks.guessMore}</p> : null}<SaveImage slug="half-same-half" /></>} />
        ) : (
          <Dumbbell rows={both.map(({ h, f, m }) => ({ id: String(h), label: `${floorHM(h)} half`, a: m.sus, b: f.sus, display: `${pct(f.sus)} · ${pct(m.sus)}` }))}
            domain={[0, 0.6]} ticks={[0, 0.2, 0.4, 0.6].map((v) => ({ value: v, label: pct(v) }))} keyLabels={{ a: 'Recorded men’s', b: 'Recorded women’s' }}
            label={`Sustained slowdowns after the same half, recorded women’s and men’s marathons: ${both.map(({ h, f, m }) => `${hm(minutes(h))} ${pct(f.sus)} and ${pct(m.sus)}`).join('; ')}.`} />
        )}
        {showGuess ? null : <SaveImage slug="half-same-half" />}
        {/* The way on to every half finish, not only those linked to a marathon: no figure of its own (spec 3.4). */}
        <HalfWay className="story-way" lead="Where your half sits among half finishes:">The half marathon</HalfWay>
      </Beat>
    </StoryPage>
  );
}
