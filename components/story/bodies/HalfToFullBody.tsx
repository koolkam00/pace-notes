import type { ComponentProps } from 'react';
import type { HalfWindow } from '@/lib/half-types';
import { readHalf } from '@/lib/half-server';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { halfDeks } from '@/lib/nuggets/half';
import { count, hm, pct } from '@/lib/nuggets/format';
import { floorHM, paceGap, readoutMark } from '@/lib/tools/half-to-full';
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
import { Beat, Say, StoryHero, StoryPage, rich } from '../StoryPage';

const PATH = '/stories/half-to-full';
/** The flagship's half (1:45, the band nearest the pooled median half) and the readout's other detents, seconds. */
const DETENTS = [5400, 6300, 7200, 8100];
/** The five-minute windows the chart and its readout step through (the 5-minute bands centred on round times). */
const BAND_S = 300;
const M = 'Recorded men’s';
const minutes = (s: number) => s / 60;
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
 * half), and women and men after the same half (the page's one guess). One All numbers fold at the foot.
 */
export default function HalfToFullBody() {
  const story = STORIES.find((s) => s.slug === 'half-to-full')!;
  const linked = readHalf('linked.json');
  const deks = halfDeks();
  const extra = getNugget('half.extra'), range = getNugget('half.range'), sexes = getNugget('half.sexes'), guess = getNugget('half.sexesGuess');
  const figure = extra.figure;
  const Q = linked.Q;
  const q = (w: HalfWindow, level: number) => w.q[Q.findIndex((x) => Math.abs(x - level) < 1e-9)];

  // The reading's ruler: minutes over double the half, typical and the middle half of marathons.
  const e = linked.overall.extra_s;
  // The band's own label has no room beside "Typical" on a phone, so a key under the ruler names it.
  const ruler = (
    <>
      <Ruler min={-20} max={60} ticks={[0, 15, 30, 45].map((v) => ({ value: v, label: v ? `+${v} min` : '0' }))}
        marks={[{ value: 0, kind: 'compare', label: 'Double the half' }, { value: minutes(e.p50), kind: 'reading', label: 'Typical' }]}
        band={{ lo: minutes(e.p25), hi: minutes(e.p75) }}
        label={`Minutes over double the half: typical plus ${Math.round(e.p50 / 60)}; half of these marathons between plus ${Math.round(e.p25 / 60)} and plus ${Math.round(e.p75 / 60)}.`} />
      <ul className="half-ruler-key" aria-hidden="true"><li><i />Half of them: <b>{plus(e.p25)} to {plus(e.p75)} min</b></li></ul>
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
  // into the predictor) follow its needle in the browser (PredictorLink).
  const paces = (u: UnitSystem) => bands.map((w) => { const gap = paceGap(w.extra_p50, u); return { gap: `${Math.round(Math.abs(gap))} s/${u}`, word: gap < 0 ? 'quicker' as const : 'slower' as const }; });
  const profile: ComponentProps<typeof LineProfile> = {
    x: xs, xDomain: [lo, hi], yDomain,
    layers: [{
      id: 'after', label: 'Marathons',
      band: { lo: bands.map((w) => q(w, 0.1)), hi: bands.map((w) => q(w, 0.9)) },
      series: [{ id: 'median', values: bands.map((w) => w.q[9]), tone: 'ink' }, { id: 'double', values: xs.map((h) => 2 * h), dashed: true }],
    }],
    xTicks: [4500, 5400, 6300, 7200, 8100, 9000, 9900].filter((h) => h >= lo && h <= hi).map((h) => ({ value: h, label: floorHM(h), priority: (h / 60) % 30 === 15 ? 3 : 1 })),
    yTicks: [10800, 14400, 18000].filter((s) => s > yDomain[0] && s < yDomain[1]).map((s) => ({ value: s, label: floorHM(s) })),
    gridSide: 'left',
    keys: [{ label: 'Typical marathon', mark: 'line' }, { label: '8 in 10', mark: 'band' }, { label: 'Double the half', mark: 'dash' }],
    axisTitle: { end: 'Half time' },
    scrub: {
      label: `Half time, ${floorHM(lo)} to ${floorHM(hi)}`,
      points: {
        x: xs.map((h) => (h - lo) / (hi - lo)),
        keys: bands.map((w) => `After a ${floorHM(w.h)} half`),
        values: bands.map((w) => floorHM(w.q[9])),
        side: [
          { label: '8 in 10', values: bands.map((w) => `${floorHM(q(w, 0.1))}–${floorHM(q(w, 0.9))}`) },
          { label: 'Under', values: bands.map((w, i) => (markOf[i] ? `${floorHM(markOf[i]![0])}: ${pct(markOf[i]![1])}` : '—')) },
        ],
      },
      initial: home, detents: DETENTS.map((h) => bands.findIndex((w) => w.h === h)).filter((i) => i >= 0), follow: 'median',
    },
    label: `The marathon after each half time, ${floorHM(lo)} to ${floorHM(hi)}: the typical marathon and the middle 8 in 10, against double the half. ${sentenceOf(range).replace(/\*/g, '')}`,
    height: 220, heightMd: 280,
  };
  const chart = (
    <div className="half-after-chart">
      <LineProfile {...profile} />
      <PredictorLink halves={bands.map((w) => floorHM(w.h))} paces={{ mi: paces('mi'), km: paces('km') }} initial={home} />
    </div>
  );

  // Beat 2: the guess at the flagship's half, or (without both sexes there) the bands side by side.
  const F = linked.windows.F, Mw = linked.windows.M;
  const both = F.filter((f) => f.h % BAND_S === 0 && Mw.some((m) => m.h === f.h)).map((f) => ({ h: f.h, f, m: Mw.find((m) => m.h === f.h)! }));
  const hasGuess = guess.guard && deks.guess !== null;
  const women = F.find((w) => w.h === guess.values.h), men = Mw.find((w) => w.h === guess.values.h);

  return (
    <StoryPage path={PATH} halfScope="linked" numbers={[
      <Values key="bands" bare id="hf-bands" caption="The marathon after each half time"
        columns={[{ key: 'h', label: 'Half' }, { key: 't', label: 'Typical' }, { key: 'p10', label: 'p10' }, { key: 'p25', label: 'p25' }, { key: 'p75', label: 'p75' }, { key: 'p90', label: 'p90' },
          { key: 'x', label: 'Over double' }, { key: 'u', label: 'Under double' }, { key: 'm', label: 'Under a round time' }, { key: 'n', label: 'Pairs' }, { key: 'e', label: 'Marathon editions' }]}
        rows={bands.map((w, i) => [floorHM(w.h), floorHM(w.q[9]), floorHM(q(w, 0.1)), floorHM(q(w, 0.25)), floorHM(q(w, 0.75)), floorHM(q(w, 0.9)),
          `${plus(w.extra_p50)} min`, pct(w.under_double, 1), markOf[i] ? `${floorHM(markOf[i]![0])}: ${pct(markOf[i]![1], 1)}` : '—', count(w.n), count(w.e)])}
        reading={home} />,
      <Values key="double" bare id="hf-double" caption="Marathons under double the half, and within 10 to 40 minutes over it"
        columns={[{ key: 'w', label: 'Under' }, { key: 's', label: 'Share of marathons' }]}
        rows={(['0', '10', '20', '30', '40'] as const).map((k) => [k === '0' ? 'Double the half' : `Double the half + ${k} min`, pct(linked.overall.under_double_plus_min[k], 1)])}
        reading={0} />,
      <Values key="sexes" bare id="hf-sexes" caption="Recorded women’s and men’s marathons after the same half"
        columns={[{ key: 'h', label: 'Half' }, { key: 'fs', label: 'Women’s, sustained slowdown' }, { key: 'ms', label: 'Men’s, sustained slowdown' },
          { key: 'ft', label: 'Women’s typical' }, { key: 'mt', label: 'Men’s typical' }, { key: 'fn', label: 'Women’s pairs' }, { key: 'mn', label: 'Men’s pairs' }]}
        rows={both.map(({ h, f, m }) => [floorHM(h), pct(f.sus, 1), pct(m.sus, 1), floorHM(f.q[9]), floorHM(m.q[9]), count(f.n), count(m.n)])}
        reading={both.findIndex((b) => b.h === guess.values.h)} />,
    ]}>
      <StoryHero path={PATH} title={story.heading ?? story.title} stacked fallback={!extra.guard}
        dek={<>{rich('Halves and marathons of records linked by name, the half 3 to 16 weeks before.', { linked: true })} <ScopeTag /></>}
        figure={figure ? { value: figure.value, unit: figure.unit, sr: figure.sr } : undefined} unitLine={figure ? extra.key : undefined}
        instrument={extra.guard ? ruler : undefined} />

      <Beat id="after" track="chapter-1" label="Half by half" title={range} dek={deks.range ?? undefined}>
        {chart}
        <SaveImage slug="half-double" />
      </Beat>

      <Beat id="women-men" track="chapter-2" label="Women and men" title={<Say nugget={sexes} term />}>
        {hasGuess && women && men ? (
          <GuessFirst marks="dots" unit="of 100" initial={Number(guess.values.men_of_100)}
            question={deks.guess!} truth={women.sus * 100} truthLabel="had a sustained slowdown"
            compare={{ value: men.sus * 100, label: M }} answer={sentenceOf(guess)} />
        ) : (
          <Dumbbell rows={both.map(({ h, f, m }) => ({ id: String(h), label: `${floorHM(h)} half`, a: m.sus, b: f.sus, display: `${pct(f.sus)} · ${pct(m.sus)}` }))}
            domain={[0, 0.6]} ticks={[0, 0.2, 0.4, 0.6].map((v) => ({ value: v, label: pct(v) }))} keyLabels={{ a: 'Recorded men’s', b: 'Recorded women’s' }}
            label={`Sustained slowdowns after the same half, recorded women’s and men’s marathons: ${both.map(({ h, f, m }) => `${hm(minutes(h))} ${pct(f.sus)} and ${pct(m.sus)}`).join('; ')}.`} />
        )}
        <SaveImage slug="half-same-half" />
      </Beat>
    </StoryPage>
  );
}
