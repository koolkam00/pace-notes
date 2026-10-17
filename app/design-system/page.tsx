import '../styles/pages/design-system.css';
import type { ReactNode } from 'react';
import { pageMetadata } from '@/lib/seo';
import { readInsight } from '@/lib/insights-server';
import type { FinishTimes, FinishTimeMark } from '@/lib/insights';
import { getFastStartStart } from '@/lib/fast-start-server';
import { FAST_START_DEFAULT } from '@/lib/fast-start';
import { STORIES } from '@/lib/stories';
import KeypadHint from '@/components/KeypadHint';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import Arrow from '@/components/ui/Arrow';
import BigNumber from '@/components/ui/BigNumber';
import Button from '@/components/ui/Button';
import Chips from '@/components/ui/Chips.client';
import GuessFirst from '@/components/ui/GuessFirst.client';
import MakeItYours from '@/components/ui/MakeItYours.client';
import MarkerBadge, { MARKERS } from '@/components/ui/MarkerBadge';
import Reading, { withEm } from '@/components/ui/Reading';
import Receipt from '@/components/ui/Receipt';
import Scrolly from '@/components/ui/Scrolly.client';
import Segmented from '@/components/ui/Segmented.client';
import ShareButton from '@/components/ui/ShareButton.client';
import { SheetButton } from '@/components/ui/Sheet.client';
import Values from '@/components/ui/Values';

// A gallery of every primitive and token, drawn with the release's own data (WP0-A, owner decision 14). Not linked from
// any page, never in the sitemap, noindex; WP9 deletes it. Every number on it is read from public/data through code.
export const metadata = pageMetadata({
  title: 'Design system | Pace Notes',
  description: 'The Pace Notes primitives and tokens in every state, drawn with real data: readings, receipts, cards, controls, sheets and type.',
  path: '/design-system',
  noindex: true,
});

// ---------- Data, read through code ----------
const ft = readInsight<FinishTimes>('finish-times.json');
const fast = getFastStartStart('all');
const story = STORIES.find((s) => s.slug === 'round-numbers');

const n = (v: number) => Math.round(v).toLocaleString('en-US');
const pct = (share: number) => Math.round(share * 100);
const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const mmss = (s: number) => { const t = Math.round(Math.abs(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const signed = (s: number) => `${s < 0 ? '−' : '+'}${mmss(s)}`;

/** The mark whose minute-before stands tallest against the smooth curve. */
const top: FinishTimeMark = ft.marks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
const ratio = top.ratio.toFixed(2);
const before = clock(top.minutes - 1);
const ratios = ft.marks.map((m) => m.ratio);
const lo = Math.min(...ratios), hi = Math.max(...ratios);
const nearest = ft.marks.reduce((a, b) => (Math.abs(b.ratio - 1) < Math.abs(a.ratio - 1) ? b : a));
const nullMark = ft.marks.find((m) => m.ratio_ci95[0] <= 1 && m.ratio_ci95[1] >= 1) ?? nearest;
const roundMarks = ft.marks.filter((m) => m.kind !== 'quarter' && m.minutes >= 180 && m.minutes <= 300);
const hourHalf = ft.marks.filter((m) => m.kind !== 'quarter');
/** The hour and half-hour marks inside the towers' window (2:30 to 5:30). */
const windowMarks = hourHalf.filter((m) => m.minutes - 1 >= 150 && m.minutes - 1 <= 330);
const allAbove = windowMarks.every((m) => m.ratio > 1);

/** The 40K view: the mark where finishes projected just over it most outdo the comparison. */
const bubble = ft.bubble.reduce((a, b) => (b.over.share_under - b.over.expected_share_under > a.over.share_under - a.over.expected_share_under ? b : a));
const bubbleGuard = bubble.over.share_under > bubble.over.expected_share_under;

const group = (band: string) => fast.initial.groups.find((g) => g.band === band);
const focus = group(FAST_START_DEFAULT.band);
const even = group('steady');
const bandLabel = (id: string) => fast.bands.find((b) => b.id === id)?.label ?? id;
const slow = focus ? focus.slowdown_n / focus.n : 0;
const evenSlow = even ? even.slowdown_n / even.n : 0;

// Minutes around the top mark, for micro-charts.
const near = ft.histogram.filter((h) => h.minute >= top.minutes - 14 && h.minute <= top.minutes + 6);

// ---------- Small server-drawn pictures for the gallery ----------
function MiniBars({ values, highlight, label }: { values: number[]; highlight?: number; label?: string }) {
  const max = Math.max(...values, 1e-9);
  const w = 6, g = 2;
  const width = values.length * (w + g) - g;
  return (
    <svg className="ds-mini" viewBox={`0 0 ${width} 48`} preserveAspectRatio="none" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * 46);
        return <rect key={i} x={i * (w + g)} y={48 - h} width={w} height={h} rx={1.5} className={i === highlight ? 'is-signal' : 'is-quiet'} />;
      })}
    </svg>
  );
}

function Towers() {
  const rows = ft.histogram.filter((h) => h.minute >= 150 && h.minute <= 330);
  const curve = ft.expected_curve.filter((c) => c.minute >= 150 && c.minute <= 330);
  const W = 181, H = 100, max = Math.max(...rows.map((r) => r.all));
  const x = (m: number) => m - 150;
  const y = (v: number) => H - (v / max) * (H - 4);
  const marks = new Set(windowMarks.map((m) => m.minutes - 1));
  const path = curve.map((c, i) => `${i ? 'L' : 'M'}${(x(c.minute) + 0.5).toFixed(1)} ${y(c.expected).toFixed(2)}`).join(' ');
  const left = (m: number) => `${(x(m) / W) * 100}%`;
  const bar = (m: number, v: number, cls: string) => <rect key={`${cls}${m}`} x={x(m) + 0.12} y={y(v)} width={0.76} height={H - y(v)} className={cls} />;
  const val = (m: number) => rows.find((r) => r.minute === m)?.all ?? 0;
  return (
    <figure className="viz ds-towers" role="img" aria-label={`Finishes per minute from 2:30 to 5:30. The minute before ${top.mark} stands ${ratio} times what a smooth curve expects.`}>
      <div className="ds-towers-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <g>{rows.map((r) => bar(r.minute, r.all, 'is-quiet'))}</g>
          <path d={path} className="ds-towers-curve" data-from="1" vectorEffect="non-scaling-stroke" />
          <g data-from="2">{[...marks].map((m) => bar(m, val(m), 'is-ink'))}</g>
          <g data-from="3">{bar(top.minutes - 1, top.minute_before, 'is-signal')}</g>
        </svg>
        <span className="ds-towers-leader" data-from="3" style={{ left: left(top.minutes - 1), top: '26px', height: `calc(${(y(top.minute_before) / H) * 100}% - 28px)` }} />
        <span className="ds-towers-label t-direct" data-from="3" style={{ left: left(top.minutes - 1) }}>{before} · {ratio}×</span>
      </div>
      <div className="ds-towers-axis" aria-hidden="true">{[180, 240, 300].map((m) => <span key={m} className="t-tick" style={{ left: left(m) }}>{clock(m)}</span>)}</div>
    </figure>
  );
}

function Swatch({ name, job }: { name: string; job: string }) {
  return (
    <li className="ds-swatch">
      <span className="ds-swatch-chip" style={{ background: `var(${name})` }} />
      <span className="ds-swatch-name">{name}</span>
      <span className="ds-swatch-job">{job}</span>
    </li>
  );
}

function Section({ id, n: num, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section className="beat ds-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="beat-head">
        <span className="t-kicker">{num}</span>
        <h2 className="t-h2" id={`${id}-title`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

const Crumbs = () => <><MarkerBadge marker="FINISH" /><span>The finish line</span></>;


export default function DesignSystemPage() {
  const towersSteps = [
    { kicker: '01', text: `Every minute of *${n(ft.analysis_n)}* finishes, from ${clock(150)} to ${clock(330)}.` },
    { kicker: '02', text: 'The line is the smooth curve: the field with no round numbers in it.' },
    { kicker: '03', text: allAbove ? 'The minute before every hour and half-hour stands above it.' : `The minute before ${windowMarks.filter((m) => m.ratio > 1).length} of ${windowMarks.length} hour and half-hour marks stands above it.` },
    { kicker: '04', text: `Tallest against the curve: ${top.mark}, at *${ratio}×*.` },
  ];
  const marksOptions = roundMarks.map((m) => ({ value: m.mark, label: m.mark }));
  const micro = { kind: 'bars' as const, values: near.map((h) => h.all), highlight: near.findIndex((h) => h.minute === top.minutes - 1) };
  const card = { kicker: 'The finish line', marker: 'FINISH', figure: ratio, unit: '×', path: '/stories/round-numbers', claim: `The minute before ${top.mark}: *${ratio}×* the smooth curve.`, micro };
  const sentence = `Between ${before}:00 and ${before}:59, ${n(top.minute_before)} finishes landed: *${ratio} times* what a smooth curve expects.`;
  const slower = (s: number) => `${mmss(s)} ${s > 0 ? 'slower' : 'faster'}`;
  const receipt = focus && even ? {
    kicker: `First 5K ${bandLabel(focus.band).toLowerCase()}`,
    lines: [
      { label: 'First 5K', key: 'against the 5–20K pace', value: signed(focus.opening_delta_mean_s), sr: `${signed(focus.opening_delta_mean_s)} minutes` },
      { label: 'After 20K', key: 'against the 5–20K pace', value: signed(focus.remainder_delta_mean_s), sr: `${signed(focus.remainder_delta_mean_s)} minutes` },
    ],
    result: { label: 'Whole race, against the 5–20K pace', value: slower(focus.finish_delta_mean_s), sr: slower(focus.finish_delta_mean_s) },
    extra: { label: 'Sustained slowdown', value: `${pct(slow)}%`, key: `with an even first 5K: ${pct(evenSlow)}%`, typical: evenSlow, observed: slow },
    footer: 'Same race · same 5–20K pace',
  } : null;

  return (
    <article className="ds">
      <header className="ds-intro">
        <h1 className="t-display">Design system</h1>
        <p className="t-body ds-lede">Every primitive in every state, drawn with the release&rsquo;s own data. Not linked and not indexed.</p>
        <nav className="ds-toc" aria-label="Gallery sections">
          {[['colour', 'Colour'], ['type', 'Type'], ['reading', 'Reading'], ['receipt', 'Receipt'], ['buttons', 'Buttons'], ['forms', 'Forms'], ['controls', 'Controls'], ['marks', 'Marks'], ['values', 'Values'], ['guess', 'Guess'], ['scrolly', 'Scrolly'], ['sheets', 'Sheets'], ['dark', 'Dark']].map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
      </header>

      <Section id="colour" n="01 · Colour" title="Ink, paper and one accent">
        <ul className="ds-swatches">
          <Swatch name="--paper" job="Page" /><Swatch name="--paper-raised" job="The one raised surface" /><Swatch name="--paper-sunk" job="Tracks" />
          <Swatch name="--rule" job="Hairlines" /><Swatch name="--rule-strong" job="Axis, input edge" /><Swatch name="--ink" job="Headings, figures" />
          <Swatch name="--ink-2" job="Body" /><Swatch name="--ink-3" job="Muted, ticks" /><Swatch name="--mark-quiet" job="Context marks" />
          <Swatch name="--fill-quiet" job="Silhouettes, with an edge" /><Swatch name="--signal" job="The reading, you" /><Swatch name="--signal-ink" job="Accent words" />
          <Swatch name="--accent" job="Primary button, brand" /><Swatch name="--focus" job="Focus ring" />
        </ul>
        <h3 className="ds-sub">Ordinal</h3>
        <ul className="ds-swatches is-row"><Swatch name="--ordinal-1" job="Lowest" /><Swatch name="--ordinal-2" job="" /><Swatch name="--ordinal-3" job="" /><Swatch name="--ordinal-4" job="Highest" /></ul>
        <div className="night ds-night">
          <h3 className="ds-sub">Night: the race and the answer</h3>
          <ul className="ds-swatches">
            <Swatch name="--paper" job="Surface" /><Swatch name="--paper-raised" job="Raised" /><Swatch name="--rule" job="Hairlines" />
            <Swatch name="--ink" job="Text, marks" /><Swatch name="--ink-2" job="Secondary" /><Swatch name="--ink-3" job="Ticks" />
            <Swatch name="--mark-quiet" job="Context marks" /><Swatch name="--signal" job="The reading" /><Swatch name="--focus" job="Focus ring" />
          </ul>
        </div>
      </Section>

      <Section id="type" n="02 · Type" title="Fraunces speaks, Inter explains, Bricolage counts">
        <dl className="ds-type">
          <div><dt>--t-display</dt><dd className="t-display">The <em>{before}</em> effect</dd></div>
          <div><dt>--t-title</dt><dd className="t-title">After a fast first 5K, <em>{pct(slow)}%</em> had a sustained slowdown</dd></div>
          <div><dt>--t-h2</dt><dd className="t-h2">Against the curve, the tallest tower is <em>{before}</em>.</dd></div>
          <div><dt>--t-sentence</dt><dd className="t-sentence">{withEm(sentence)}</dd></div>
          <div><dt>--t-figure xl · l · m · s</dt><dd className="ds-figures"><BigNumber value={ratio} unit="×" sr={`${ratio} times`} size="xl" /><BigNumber value={`${pct(slow)}`} unit="%" sr={`${pct(slow)} percent`} size="l" /><BigNumber value={n(top.minute_before)} sr={n(top.minute_before)} size="m" /><BigNumber value={`${pct(evenSlow)}`} unit="%" sr={`${pct(evenSlow)} percent`} size="s" /></dd></div>
          <div><dt>Figure tones: ink · signal · quiet</dt><dd className="ds-figures"><BigNumber value={ratio} unit="×" sr={`${ratio} times`} size="m" /><BigNumber value={ratio} unit="×" sr={`${ratio} times`} size="m" tone="signal" /><BigNumber value={nullMark.ratio.toFixed(2)} unit="×" sr={`${nullMark.ratio.toFixed(2)} times`} size="m" tone="quiet" /></dd></div>
          <div><dt>--t-readout</dt><dd><span className="t-readout">{before}</span> <span className="t-label">{n(top.minute_before)} finishes</span></dd></div>
          <div><dt>--t-body</dt><dd className="t-body">Body text is Inter, 17 px on a phone and 18 px from 900 px, in --ink-2.</dd></div>
          <div><dt>--t-small · --t-label · --t-direct</dt><dd className="ds-inline"><span className="t-small">Secondary text</span><span className="t-label">Readout key</span><span className="t-direct">Direct label</span></dd></div>
          <div><dt>--t-kicker · --t-tick</dt><dd className="ds-inline"><span className="t-kicker">01 · The towers</span><span className="t-tick">{roundMarks.map((m) => m.mark).join('   ')}</span></dd></div>
        </dl>
      </Section>

      <Section id="reading" n="03 · Reading" title="Every page opens on its finding">
        <div className="ds-frame">
          <Reading titleAs="h2" crumbs={<Crumbs />} title={story?.title ?? 'Round numbers'} dek="Do finish times bunch up just under round numbers?"
            figure={{ value: ratio, unit: '×', sr: `${ratio} times` }} unitLine={`the smooth curve, in the minute before ${top.mark}`}
            sentence={sentence}
            instrument={<MiniBars values={micro.values} highlight={micro.highlight} label={`Finishes per minute around ${top.mark}; the minute before is highlighted`} />}
            foot={<><ShareButton slug="design-system-reading" card={card} goal="Goal 4:00" /><a className="ds-term" href="/methodology#story-round-numbers">How we know<Arrow dir="up-right" /></a></>}
          />
        </div>
        <div className="ds-grid-2">
          <div className="ds-frame">
            <p className="ds-cap">Pair</p>
            <Reading titleAs="h2" titleSize="title" stacked title={bubbleGuard ? `Near ${bubble.mark}, more finishes find the line` : `Near ${bubble.mark}, about as many finish under the line`} variant="pair"
              figures={[{ value: `${pct(bubble.over.share_under)}`, unit: '%', sr: `${pct(bubble.over.share_under)} percent`, key: `on course for 0–2 min over ${bubble.mark} at 40K, got under` },
                { value: `${pct(bubble.over.expected_share_under)}`, unit: '%', sr: `${pct(bubble.over.expected_share_under)} percent`, key: 'away from a round mark' }]} />
          </div>
          <div className="ds-frame">
            <p className="ds-cap">Range</p>
            <Reading titleAs="h2" titleSize="title" stacked title="Every round mark, against the curve" variant="range" figure={{ value: `${lo.toFixed(2)}–${hi.toFixed(2)}`, unit: '×', sr: `${lo.toFixed(2)} to ${hi.toFixed(2)} times` }}
              range={{ from: lo, to: hi, min: 0, max: Math.ceil(hi) }} sentence={`Across ${ft.marks.length} marks, the minute before ran *${lo.toFixed(2)}× to ${hi.toFixed(2)}×* the curve.`} />
          </div>
          <div className="ds-frame">
            <p className="ds-cap">Null</p>
            <Reading titleAs="h2" titleSize="title" stacked title={`At ${nullMark.mark}, no clear bunching`} variant="null" figure={{ value: nullMark.ratio.toFixed(2), unit: '×', sr: `${nullMark.ratio.toFixed(2)} times` }}
              sentence={`In the minute before ${nullMark.mark}, finishes were close to what a smooth curve expects.`} />
          </div>
          <div className="ds-frame">
            <p className="ds-cap">Fallback: the guard is false</p>
            <Reading titleAs="h2" titleSize="title" stacked title={`Finishes in the minute before ${top.mark}`} fallback figure={{ value: n(top.minute_before), sr: n(top.minute_before) }}
              sentence={`In the minute before ${top.mark}, ${n(top.minute_before)} finishes landed.`} />
          </div>
        </div>
      </Section>

      <Section id="receipt" n="04 · Receipt" title="An analysis answers on one card">
        {receipt ? (
          <div className="ds-grid-2">
            <Receipt {...receipt} goal={<>Add a goal to read these as first-5K splits. <a className="ds-inline-btn" href="#make-it-yours-demo">Change</a></>} />
            <div>
              <p className="ds-cap">Fallback: the result&rsquo;s guard is false</p>
              <Receipt lines={receipt.lines} result={{ ...receipt.result, fallback: `${slower(focus!.finish_delta_mean_s)} over the whole race` }} />
            </div>
          </div>
        ) : null}
      </Section>

      <Section id="buttons" n="05 · Buttons" title="One orange button per screen">
        <div className="ds-matrix">
          {(['primary', 'secondary', 'tertiary'] as const).map((v) => (
            <div className="ds-matrix-row" key={v}>
              <span className="ds-cap">{v[0].toUpperCase() + v.slice(1)}</span>
              <Button variant={v}>Plan your race</Button>
              <Button variant={v} className="is-hover">Hover</Button>
              <Button variant={v} className="is-focus">Focus</Button>
              <Button variant={v} className="is-pressed">Pressed</Button>
              <Button variant={v} disabled>Disabled</Button>
              <Button variant={v} loading>Loading</Button>
            </div>
          ))}
          <div className="ds-matrix-row">
            <span className="ds-cap">Compact, as links</span>
            <Button compact>Compact</Button>
            <Button variant="secondary" href="/tools/plan" arrow="right">Plan your race</Button>
            <Button variant="tertiary" href="/methodology" arrow="up-right">How we know</Button>
          </div>
        </div>
        <div className="night ds-night ds-matrix">
          <div className="ds-matrix-row"><span className="ds-cap">On night</span><Button>Plan your race</Button><Button variant="secondary">Secondary</Button><Button variant="tertiary">Tertiary</Button></div>
        </div>
      </Section>

      <Section id="forms" n="06 · Forms" title="Fields sized for a thumb">
        <div className="ds-grid-2">
          <div className="field"><label className="field-label" htmlFor="ds-goal">Goal finish time</label><input id="ds-goal" className="input" inputMode="decimal" defaultValue="4:00" /><span className="field-hint">h:mm <KeypadHint /></span></div>
          <div className="field"><label className="field-label" htmlFor="ds-goal-h">Hover</label><input id="ds-goal-h" className="input is-hover" defaultValue="4:00" /></div>
          <div className="field"><label className="field-label" htmlFor="ds-goal-f">Focus</label><input id="ds-goal-f" className="input is-focus" defaultValue="4:00" /></div>
          <div className="field"><label className="field-label" htmlFor="ds-goal-e">Error</label><input id="ds-goal-e" className="input" defaultValue="4:75" aria-invalid="true" aria-describedby="ds-goal-e-msg" /><span className="field-error" id="ds-goal-e-msg" role="alert">Minutes run from 00 to 59.</span></div>
          <div className="field"><label className="field-label" htmlFor="ds-course">Course</label><select id="ds-course" className="select" defaultValue={fast.cities[0]}>{fast.cities.slice(0, 8).map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="ds-goal-d">Disabled</label><input id="ds-goal-d" className="input" defaultValue="4:00" disabled /></div>
        </div>
        <label className="check"><input type="checkbox" defaultChecked />Add my goal to the card</label>
      </Section>

      <Section id="controls" n="07 · Controls" title="Tap to compare">
        <div className="ds-stack">
          <p className="ds-cap">Segmented: up to five options</p>
          <Segmented label="Mark, gallery" options={marksOptions} defaultValue={roundMarks.find((m) => m.mark === top.mark)?.mark ?? marksOptions[0]?.value} />
          <Segmented label="Lens, gallery" options={[{ value: 'count', label: 'Finishes per minute' }, { value: 'curve', label: 'Against the curve' }]} defaultValue="count" block />
          <Segmented label="Disabled option, gallery" options={[{ value: 'a', label: 'All courses' }, { value: 'b', label: 'One course' }, { value: 'c', label: 'No data', disabled: true }]} defaultValue="a" />
          <p className="ds-cap">Chips: a row that scrolls, and a set that wraps</p>
          <Chips label="Every mark, gallery" options={ft.marks.map((m) => ({ value: m.mark, label: m.mark }))} defaultValue={top.mark} />
          <Chips label="Opening, gallery" wrap options={fast.bands.map((b) => ({ value: b.id, label: b.label }))} defaultValue={FAST_START_DEFAULT.band} />
          <div className="chips"><div className="chips-row" role="group" aria-label="Chip states, gallery">
            <button type="button" className="chip" aria-pressed="false">Default</button><button type="button" className="chip is-hover" aria-pressed="false">Hover</button>
            <button type="button" className="chip is-focus" aria-pressed="false">Focus</button><button type="button" className="chip is-pressed" aria-pressed="false">Pressed</button>
            <button type="button" className="chip" aria-pressed="true">Selected</button><button type="button" className="chip" aria-pressed="false" disabled>Disabled</button>
          </div></div>
          <div className="night ds-night ds-stack">
            <p className="ds-cap">On night</p>
            <Segmented label="Mark on night, gallery" options={marksOptions} defaultValue={marksOptions[0]?.value} />
            <Chips label="Every mark on night, gallery" options={ft.marks.map((m) => ({ value: m.mark, label: m.mark }))} defaultValue={top.mark} />
          </div>
        </div>
      </Section>

      <Section id="marks" n="08 · Marks" title="Where you are, and where a number comes from">
        <div className="ds-row">{MARKERS.map((m) => <MarkerBadge key={m} marker={m} />)}</div>
        <div className="night ds-night ds-row">{MARKERS.slice(0, 6).map((m) => <MarkerBadge key={m} marker={m} />)}</div>
        <div className="ds-row is-badges"><EvidenceTag kind="data" /><EvidenceTag kind="research" /><EvidenceTag kind="official" /><EvidenceTag kind="data" link={false} /></div>
      </Section>

      <Section id="values" n="09 · Values" title="Every chart has its table">
        <Values id="ds-values" caption="Finishes in the minute before each mark, against the smooth curve"
          columns={[{ key: 'mark', label: 'Mark' }, { key: 'n', label: 'Minute before' }, { key: 'e', label: 'Smooth curve' }, { key: 'r', label: 'Against the curve' }, { key: 'men', label: 'Recorded men' }, { key: 'women', label: 'Recorded women' }]}
          rows={ft.marks.map((m) => [m.mark, n(m.minute_before), n(m.expected_minute_before), `${m.ratio.toFixed(2)}×`, `${m.men_ratio.toFixed(2)}×`, m.women_ratio === null ? '—' : `${m.women_ratio.toFixed(2)}×`])}
          reading={ft.marks.indexOf(top)} open />
      </Section>

      <Section id="guess" n="10 · Guess first" title="Guess, then see it on the same marks">
        <GuessFirst question={`At 40K a finish is on course for 0\u2060–\u20602 minutes over ${bubble.mark}. What share still got under?`}
          truth={bubble.over.share_under * 100} compare={{ value: bubble.over.expected_share_under * 100, label: `Away from a round mark: ${pct(bubble.over.expected_share_under)}%` }}
          answer={`*${pct(bubble.over.share_under)}%* of ${n(bubble.over.n)} such finishes got under it.`} truthLabel="got under" />
      </Section>

      <Section id="scrolly" n="11 · Scrolly" title="One step-by-step reveal per story">
        <Scrolly graphic={<Towers />} steps={towersSteps} />
      </Section>

      <Section id="sheets" n="12 · Sheets" title="The menu, your inputs and sharing">
        <div className="ds-row">
          <SheetButton id="ds-sheet" title="A sheet" label="Open a sheet" className="btn btn-secondary">
            <p className="t-body">A bottom sheet on a phone and a right drawer from 600 px. Escape, the scrim or Close shuts it, and focus returns to the button that opened it.</p>
          </SheetButton>
          <ShareButton slug="design-system" card={card} goal="Goal 4:00" />
        </div>
        <div className="miy-beat analysis-layout ds-explorer" id="make-it-yours-demo">
          <MakeItYours id="ds-miy" summary={`${fast.cities[0]} · 4:00 · All ages`}>
            <form className="ds-form" action="#make-it-yours-demo">
              <div className="field"><label className="field-label" htmlFor="ds-miy-course">Course</label><select id="ds-miy-course" className="select" defaultValue={fast.cities[0]}>{fast.cities.slice(0, 8).map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="field"><label className="field-label" htmlFor="ds-miy-goal">Goal finish time</label><input id="ds-miy-goal" className="input" inputMode="decimal" defaultValue="4:00" /><KeypadHint block /></div>
              <Button type="submit" variant="secondary" compact>Update comparison</Button>
            </form>
          </MakeItYours>
          <p className="t-body miy-results">The explorer&rsquo;s results. Under 900 px the chip floats while this beat is on screen; from 900 px the form sits inline above.</p>
        </div>
      </Section>

      <section className="ds-dark-wrap" data-theme="dark" id="dark" aria-labelledby="dark-title">
        <div className="beat-head">
          <span className="t-kicker">13 · Dark</span>
          <h2 className="t-h2" id="dark-title">A chosen dark palette, not an inversion</h2>
        </div>
        <Reading titleAs="h2" titleSize="title" crumbs={<Crumbs />} title={story?.title ?? 'Round numbers'} figure={{ value: ratio, unit: '×', sr: `${ratio} times` }} sentence={sentence} />
        <div className="ds-stack">
          <Segmented label="Mark in dark, gallery" options={marksOptions} defaultValue={marksOptions[1]?.value} />
          <div className="ds-row"><Button>Plan your race</Button><Button variant="secondary">Secondary</Button><EvidenceTag kind="data" /><MarkerBadge marker="HALF" /></div>
          {receipt ? <Receipt {...receipt} /> : null}
          {focus ? <GuessFirst marks="dots" unit="of 100" question={`Of 100 finishes with a first 5K ${bandLabel(focus.band).toLowerCase()}, how many had a sustained slowdown?`}
            truth={slow * 100} answer={`*${pct(slow)} in 100* did.`} truthLabel="Had a sustained slowdown" initial={30} /> : null}
        </div>
      </section>
    </article>
  );
}
