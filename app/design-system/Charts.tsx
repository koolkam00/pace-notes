import '../styles/pages/design-system-charts.css';
import type { ReactNode } from 'react';
import { readInsight, getInsightsManifest, replayChoices } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry, Courses, Demographics, FinishTimes, Kick, ReplayIndex } from '@/lib/insights';
import { getAnalysisStart } from '@/lib/analysis-server';
import { getStudyEvidence } from '@/lib/research-data';
import { getFinishTimeSummary } from '@/lib/finish-times-summary';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { count, delta, hm, inWords, ms, pct, sectionLabel, temp } from '@/lib/nuggets/format';
import { getNugget, sentenceOf } from '@/lib/nuggets';
import { withEm } from '@/components/ui/withEm';
import Values from '@/components/ui/Values';
import HeroReplay from '@/components/story/HeroReplay';
import BinLens from '@/components/viz/BinLens';
import Cdf from '@/components/viz/Cdf';
import DotGrid from '@/components/viz/DotGrid';
import DotStrip from '@/components/viz/DotStrip';
import Dumbbell from '@/components/viz/Dumbbell';
import EffectBand from '@/components/viz/EffectBand';
import ElevationPace from '@/components/viz/ElevationPace';
import GhostRace from '@/components/viz/GhostRace.client';
import Histogram from '@/components/viz/Histogram';
import LineProfile from '@/components/viz/LineProfile';
import Ruler from '@/components/viz/Ruler';
import Scatter from '@/components/viz/Scatter';
import ShareBar from '@/components/viz/ShareBar';
import Slope from '@/components/viz/Slope';
import TypeGlyph from '@/components/viz/TypeGlyph';
import Waffle from '@/components/viz/Waffle';
import Waterfall from '@/components/viz/Waterfall';
import YearStrip from '@/components/viz/YearStrip';

// The chart forms of components/viz (WP0-C), each drawn from the release's own files through code. A gallery of forms,
// not a page: the sentences are the nuggets' where one exists, and plain descriptions otherwise.

const ft = readInsight<FinishTimes>('finish-times.json');
const courses = readInsight<Courses>('courses.json');
const kick = readInsight<Kick>('kick.json');
const types = readInsight<Archetypes>('archetypes.json');
const demo = readInsight<Demographics>('demographics.json');
const replay = readInsight<ReplayIndex>('replay.json');
const geometry = readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses;
const SECTION_KM: [number, number][] = [[0, 5], [5, 10], [10, 15], [15, 20], [20, 25], [25, 30], [30, 35], [35, 40], [40, 42.195]];
const signedPct = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}%`;

function Form({ id, title, note, children }: { id: string; title: string; note: ReactNode; children: ReactNode }) {
  return (
    <div className="ds-form-block" id={id}>
      <h3 className="ds-form-title">{title}</h3>
      <p className="t-sentence ds-form-note">{note}</p>
      {children}
    </div>
  );
}

// ---------- The minute histogram, with its lens and scrubber ----------
function MinuteHistogram() {
  const lo = 150, hi = 330;
  const bins = ft.histogram.filter((h) => h.minute >= lo && h.minute < hi).map((h) => ({ x: h.minute, n: h.all }));
  const curve = ft.expected_curve.filter((c) => c.minute >= lo && c.minute < hi).map((c) => ({ x: c.minute, v: c.expected }));
  const marks = ft.marks.filter((m) => m.kind !== 'quarter' && m.minutes - 1 >= lo && m.minutes - 1 < hi);
  const top = marks.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const expected = new Map(ft.expected_curve.map((c) => [c.minute, c.expected]));
  const xs = bins.map((b) => (b.x - lo + 0.5) / (hi - lo));
  const detents = marks.map((m) => bins.findIndex((b) => b.x === m.minutes - 1)).filter((i) => i >= 0);
  const nugget = getNugget('round.top');
  const own = Object.fromEntries(marks.map((m) => [m.minutes - 1, m.ratio]));
  const ratio = (b: { x: number; n: number }) => own[b.x] ?? (expected.get(b.x) ? b.n / expected.get(b.x)! : NaN);
  return (
    <Form id="ds-histogram" title="Minute histogram" note={withEm(sentenceOf(nugget))}>
      <Histogram bins={bins} curve={curve} marks={marks.map((m) => m.minutes - 1)} reading={top.minutes - 1}
        ticks={[180, 240, 300].map((m) => ({ x: m, label: hm(m) }))}
        label={`Finishes per minute from ${hm(lo)} to ${hm(hi)}. The minute before ${top.mark} held ${top.ratio.toFixed(2)} times what a smooth curve expects.`}
        lens={{ label: 'Lens, finish times', count: 'Finishes per minute', ratio: 'Against the curve' }}
        keyLabels={{ bin: 'Each minute', mark: 'The minute before a round mark', curve: 'The smooth curve' }} ratioAt={own}
        scrub={{
          label: `Finish minute, ${hm(lo)} to ${hm(hi)}`,
          points: {
            x: xs, keys: bins.map((b) => `Finishes in minute ${hm(b.x)}`), values: bins.map((b) => count(b.n)),
            side: [{ label: 'Against the curve', values: bins.map((b) => (Number.isFinite(ratio(b)) ? `${ratio(b).toFixed(2)}×` : '—')) }],
          },
          initial: bins.findIndex((b) => b.x === top.minutes - 1), detents,
        }}
        values={<Values id="ds-v-hist" caption="Finishes in the minute before each round mark" columns={[{ key: 'm', label: 'Mark' }, { key: 'n', label: 'Minute before' }, { key: 'r', label: 'Against the curve' }]}
          rows={marks.map((m) => [m.mark, count(m.minute_before), `${m.ratio.toFixed(2)}×`])} reading={marks.indexOf(top)} />}
      />
    </Form>
  );
}

// ---------- Ten-second bins around a mark ----------
function SecondBins() {
  const marks = ft.seconds.map((s) => ({ id: s.mark, label: s.mark, bins: s.bins.filter((b) => b.offset_s >= -180 && b.offset_s < 120).map((b) => ({ offset_s: b.offset_s, n: b.n })), peak_offset_s: s.peak_offset_s }));
  const top = ft.seconds.reduce((a, b) => (b.peak_ratio > a.peak_ratio ? b : a));
  return (
    <Form id="ds-bins" title="Ten-second bins around a mark" note={<>The busiest ten seconds before {top.mark} came <em>{Math.abs(top.peak_offset_s)} seconds</em> before it.</>}>
      <BinLens marks={marks} initial={top.mark} label={`Finishes in ten-second bins from three minutes before to two minutes after each round mark. Before ${top.mark}, the peak is ${Math.abs(top.peak_offset_s)} seconds before the mark.`}
        values={<Values id="ds-v-bins" caption="The busiest ten seconds before each mark" columns={[{ key: 'm', label: 'Mark' }, { key: 'p', label: 'Peak' }, { key: 'r', label: 'Against the curve' }]}
          rows={ft.seconds.map((s) => [s.mark, `${Math.abs(s.peak_offset_s)} s before`, `${s.peak_ratio.toFixed(2)}×`])} />} />
    </Form>
  );
}

// ---------- A line profile with its band, one layer per pacing type ----------
function TypeProfiles() {
  const xs = SECTION_KM.map(([a, b]) => (a + b) / 2);
  const all = types.archetypes.flatMap((a) => a.profile);
  const lo = Math.floor(Math.min(...all)) - 2, hi = Math.ceil(Math.max(...all)) + 2;
  const layers = types.archetypes.map((a, i) => {
    const slowest = a.profile.indexOf(Math.max(...a.profile));
    return {
      id: a.slug, label: a.name,
      series: [{ id: 'm', values: a.profile, tone: 'type' as const, typeIndex: i }],
      band: { lo: a.profile_p25, hi: a.profile_p75 },
      labels: [{ x: xs[slowest], y: a.profile[slowest], text: `${sectionLabel(...SECTION_KM[slowest])} ${signedPct(a.profile[slowest], 1)}`, priority: 3 }],
    };
  });
  const top = types.archetypes.reduce((a, b) => (b.share > a.share ? b : a));
  return (
    <Form id="ds-profile" title="Line profile with a band" note={<>Each pacing type, section by section, against its own average pace. The commonest: <em>{top.name}</em>, {pct(top.share)} of finishes.</>}>
      <LineProfile x={xs} xDomain={[0, 42.195]} yDomain={[lo, hi]} layers={layers} initial={top.slug} lensLabel="Pacing type" chips
        refs={[{ value: 0, dashed: true }]} washes={[{ from: 20, to: 42.195, label: 'After 20K' }]}
        xTicks={[{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
        yTicks={[{ value: hi, label: signedPct(hi) }, { value: lo, label: signedPct(lo) }]}
        label="Section pace against each type's own average, the median with the middle half of finishes"
        keys={[{ label: 'Middle half of its finishes', mark: 'band' }, { label: 'Own average pace', mark: 'dash' }]}
        values={<Values id="ds-v-profile" caption="Median section pace against own average, by type" columns={[{ key: 't', label: 'Type' }, ...SECTION_KM.map(([a, b], i) => ({ key: `s${i}`, label: sectionLabel(a, b) }))]}
          rows={types.archetypes.map((a) => [a.name, ...a.profile.map((v) => signedPct(v, 1))])} />} />
    </Form>
  );
}

// ---------- The U-curve of starting pace, with the scrubber ----------
function OpeningCurve() {
  const curve = [...kick.bank.curve].sort((a, b) => a.lo - b.lo);
  const xs = curve.map((c) => c.lo + 0.5);
  const best = curve.reduce((a, b) => (b.finish_s < a.finish_s ? b : a));
  const fastest = kick.bank.bands.reduce((a, b) => (b.open_s < a.open_s ? b : a));
  const lo = Math.min(...curve.map((c) => c.finish_s)), hi = Math.max(...curve.map((c) => c.finish_s));
  const step = 120;
  const yTicks = [Math.ceil(hi / step) * step, Math.floor(lo / step) * step].map((v) => ({ value: v, label: delta(v) }));
  // Room under the best point for its label.
  const floor = yTicks[1].value - step * 0.75;
  const evenI = curve.findIndex((c) => c.lo === 0);
  // The first one-point bin entirely over 10% fast: the detent the note names.
  const fastI = curve.reduce((b, c, i) => (c.lo + 1 <= -10 && (b < 0 || c.lo > curve[b].lo) ? i : b), -1);
  const bestI = curve.indexOf(best);
  const word = (lo: number) => (lo + 1 <= 0 ? `${Math.abs(lo + 1)}–${Math.abs(lo)}% faster` : lo >= 0 ? `${lo}–${lo + 1}% slower` : 'within 1% of even');
  const fast = curve[fastI];
  return (
    <Form id="ds-ucurve" title="U-curve with a scrub" note={<>A first 5K {word(fast.lo)} than the 5–20K pace finished <em>{ms(fast.finish_s)} behind</em> the same pace; the best average was {delta(best.finish_s)}.</>}>
      <LineProfile x={xs} yDomain={[floor, Math.max(hi, yTicks[0].value)]}
        layers={[{ id: 'u', label: 'Finish', series: [{ id: 'finish', values: curve.map((c) => c.finish_s), fillAbove: 0 }],
          points: [{ x: best.lo + 0.5, y: best.finish_s, kind: 'best' }],
          labels: [{ x: best.lo + 0.5, y: best.finish_s, text: `Best ${delta(best.finish_s)}`, priority: 3, prefer: 'below' }] }]}
        refs={[{ value: 0, label: 'same pace' }]}
        xTicks={[-10, -5, 0, 5, 10].filter((v) => v >= curve[0].lo && v <= curve[curve.length - 1].lo + 1).map((v) => ({ value: v, label: v === 0 ? 'even' : `${Math.abs(v)}%` }))}
        axisTitle={{ start: 'Faster first 5K', end: 'Slower first 5K' }}
        yTicks={yTicks}
        scrub={{
          label: 'First 5K against the 5–20K pace',
          points: { x: xs.map((v) => (v - xs[0]) / (xs[xs.length - 1] - xs[0])), keys: curve.map((c) => `First 5K ${word(c.lo)}, at the finish`), values: curve.map((c) => delta(c.finish_s)),
            side: [{ label: 'After 20K', values: curve.map((c) => delta(c.after20_s)) }, { label: 'Sustained slowdown', values: curve.map((c) => pct(c.slowdown)) }] },
          initial: Math.max(0, fastI), detents: [evenI, bestI, fastI].filter((i) => i >= 0),
        }}
        label={`Finish against same-pace finishes by first-5K pace. A first 5K ${fastest.label.toLowerCase()} finished ${ms(fastest.finish_s)} behind.`}
        values={<Values id="ds-v-u" caption="Finish against the same 5–20K pace, by first 5K" columns={[{ key: 'b', label: 'First 5K' }, { key: 'o', label: 'First 5K' }, { key: 'f', label: 'At the finish' }, { key: 's', label: 'Sustained slowdown' }]}
          rows={kick.bank.bands.map((b) => [b.label, delta(b.open_s), delta(b.finish_s), pct(b.slowdown)])} />} />
    </Form>
  );
}

// ---------- Dot strip: median finish, course by course ----------
function CourseStrip() {
  const list = courses.courses.filter((c) => c.finishes >= 100);
  const all = getFinishTimeSummary().groups.all.median ?? 0;
  const subject = list.reduce((a, b) => (Math.abs(b.median_s / 60 - all) < Math.abs(a.median_s / 60 - all) ? b : a));
  const lo = Math.min(...list.map((c) => c.median_s)), hi = Math.max(...list.map((c) => c.median_s));
  const min = list.find((c) => c.median_s === lo)!, max = list.find((c) => c.median_s === hi)!;
  const t0 = Math.floor(lo / 1800) * 1800, t1 = Math.ceil(hi / 1800) * 1800;
  return (
    <Form id="ds-strip" title="Dot strip, ranked" note={<>Median finish, race by race: <em>{hm(lo / 60)}</em> in {min.city} to <em>{hm(hi / 60)}</em> in {max.city}.</>}>
      <DotStrip items={list.map((c) => ({ id: c.city, label: c.city, value: c.median_s, display: hm(c.median_s / 60), detail: count(c.finishes), hollow: c.editions < 3, subject: c.city === subject.city }))}
        domain={[t0, t1]} ticks={Array.from({ length: Math.round((t1 - t0) / 1800) + 1 }, (_, i) => t0 + i * 1800).map((v) => ({ value: v, label: hm(v / 60) }))}
        label={`Median finish of ${list.length} courses, from ${hm(lo / 60)} to ${hm(hi / 60)}`} readoutKey="Finishes" keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
        values={<Values id="ds-v-strip" caption="Median finish by course" columns={[{ key: 'c', label: 'Course', text: true }, { key: 'm', label: 'Median finish' }, { key: 'e', label: 'Editions' }, { key: 'n', label: 'Finishes' }]}
          rows={[...list].sort((a, b) => a.median_s - b.median_s).map((c) => [c.city, hm(c.median_s / 60), String(c.editions), count(c.finishes)])} />} />
    </Form>
  );
}

// ---------- Dumbbell: observed against typical sustained slowdown, by opening ----------
function OpeningDumbbell() {
  const bands = kick.bank.bands;
  const fastest = bands.reduce((a, b) => (b.open_s < a.open_s ? b : a));
  const hi = Math.ceil(Math.max(...bands.flatMap((b) => [b.slowdown, b.expected])) * 10) / 10;
  return (
    <Form id="ds-dumbbell" title="Dumbbell list" note={<>A first 5K {fastest.label.toLowerCase()}: <em>{pct(fastest.slowdown)}</em> had a sustained slowdown, against {pct(fastest.expected)} typical for the race and pace.</>}>
      <Dumbbell rows={bands.map((b) => ({ id: b.label, label: b.label, a: b.expected, b: b.slowdown, display: pct(b.slowdown), highlight: b === fastest }))}
        domain={[0, hi]} ticks={[0, hi / 2, hi].map((v) => ({ value: v, label: pct(v) }))} keyLabels={{ a: 'Typical for the race and pace', b: 'Observed' }}
        label={`Sustained slowdown by first 5K, observed against typical. ${fastest.label}: ${pct(fastest.slowdown)} against ${pct(fastest.expected)}.`}
        values={<Values id="ds-v-db" caption="Sustained slowdown by first 5K" columns={[{ key: 'b', label: 'First 5K' }, { key: 'o', label: 'Observed' }, { key: 't', label: 'Typical' }, { key: 'n', label: 'Finishes' }]}
          rows={bands.map((b) => [b.label, pct(b.slowdown), pct(b.expected), count(b.n)])} />} />
    </Form>
  );
}

// ---------- Share bar: where sustained slowdowns began ----------
function OnsetBar() {
  const rows = getStudyEvidence()?.timing.charts[0]?.rows ?? [];
  const total = rows.reduce((s, r) => s + Number(r.episodes ?? 0), 0) || 1;
  // The sentence's claim is one segment, "30K or later"; the sections before it each keep their own.
  const late = rows.filter((r) => Number(r.label) >= 30).reduce((s, r) => s + Number(r.episodes), 0);
  const segments = [
    ...rows.filter((r) => Number(r.label) < 30).map((r, i) => ({ id: String(r.label), label: sectionLabel(Number(r.label), Number(r.label) + 5), share: Number(r.episodes) / total, display: pct(Number(r.episodes) / total), tone: (i + 1) as 1 | 2 })),
    { id: 'late', label: '30K or later', share: late / total, display: pct(late / total), tone: 'signal' as const },
  ];
  return (
    <Form id="ds-share" title="Share bar" note={withEm(sentenceOf(getNugget('slowdown.onset')))}>
      <ShareBar segments={segments} label={`Where sustained slowdowns began: ${segments.map((s) => `${s.label} ${s.display}`).join(', ')}`}
        values={<Values id="ds-v-share" caption="Where sustained slowdowns began" columns={[{ key: 's', label: 'Section' }, { key: 'n', label: 'Slowdowns' }, { key: 'p', label: 'Share' }]}
          rows={rows.map((r) => [sectionLabel(Number(r.label), Number(r.label) + 5), count(Number(r.episodes)), pct(Number(r.episodes) / total)])} />} />
    </Form>
  );
}

// ---------- Waffle: same-course weather pairs ----------
function PairsWaffle() {
  const pairs = courses.weather.pairs;
  const tiles = pairs.list.map((p) => ({ id: `${p.city}-${p.hot_year}-${p.cool_year}`, lit: p.hotter_slowed_more, key: `${p.city}, sustained slowdown ${p.cool_year} vs ${p.hot_year}`, value: `${pct(p.cool_slowdown)} vs ${pct(p.hot_slowdown)}`, side: `${temp(p.cool_temp, 'mi')} vs ${temp(p.hot_temp, 'mi')}` }));
  return (
    <Form id="ds-waffle" title="Waffle" note={withEm(sentenceOf(getNugget('weather.pairs')))}>
      <Waffle tiles={tiles} sideLabel="At the start" label={`${pairs.hotter_slowed_more} of ${pairs.total} same-course pairs: the warmer year had more sustained slowdowns`}
        keyLabels={{ lit: 'Warmer year, more sustained slowdowns', other: 'Not so' }}
        values={<Values id="ds-v-waffle" caption="Same-course pairs at least 9°F apart" columns={[{ key: 'p', label: 'Pair', text: true }, { key: 'v', label: 'Start temperature · sustained slowdown' }]} rows={tiles.map((t) => [t.key, `${t.side} · ${t.value}`])} />} />
    </Form>
  );
}

// ---------- Year strip and race-morning scatter: the course with the most editions ----------
const longest = courses.courses.reduce((a, b) => (b.editions > a.editions ? b : a));
function CourseYears() {
  const cells = courses.years.cells.filter((c) => c.city === longest.city).sort((a, b) => a.year - b.year);
  const avg = cells.reduce((s, c) => s + c.slowdown, 0) / cells.length;
  const last = cells[cells.length - 1];
  return (
    <Form id="ds-years" title="Year strip" note={<>{longest.city}, edition by edition: in {last.year}, <em>{pct(last.slowdown)}</em> of finishes had a sustained slowdown.</>}>
      <YearStrip editions={cells.map((c) => ({ year: c.year, value: c.slowdown, display: pct(c.slowdown), side: [hm(c.median_s / 60), c.temp === null ? '—' : temp(c.temp, 'mi')] }))}
        selected={last.year} sideLabels={['Median', 'At the start']} valueDomain={[0, Math.ceil(Math.max(...cells.map((c) => c.slowdown)) * 10) / 10]} average={avg}
        extremeLabel={(p) => `${p.year} · ${p.display}`} label={`Sustained slowdown in ${longest.city}, ${cells[0].year} to ${last.year}`}
        values={<Values id="ds-v-years" caption={`${longest.city} by year`} columns={[{ key: 'y', label: 'Year' }, { key: 's', label: 'Sustained slowdown' }, { key: 'm', label: 'Median' }, { key: 't', label: 'At the start' }]}
          rows={cells.map((c) => [String(c.year), pct(c.slowdown), hm(c.median_s / 60), c.temp === null ? '—' : temp(c.temp, 'mi')])} />} />
    </Form>
  );
}

function CourseWeather() {
  const eds = courses.weather.editions.filter((e) => e.city === longest.city);
  const pair = courses.weather.hot_cool.find((h) => h.city === longest.city);
  const inPair = (y: number) => !!pair && (pair.hot.year === y || pair.cool.year === y);
  const t0 = Math.floor(Math.min(...eds.map((e) => e.temp)) / 5) * 5, t1 = Math.ceil(Math.max(...eds.map((e) => e.temp)) / 5) * 5;
  const s1 = Math.ceil(Math.max(...eds.map((e) => e.slowdown)) * 10) / 10;
  return (
    <Form id="ds-scatter" title="Scatter of few points" note={pair ? <>{longest.city}: at {temp(pair.cool.temp, 'mi')} in {pair.cool.year}, {pct(pair.cool.slowdown)} had a sustained slowdown; at {temp(pair.hot.temp, 'mi')} in {pair.hot.year}, <em>{pct(pair.hot.slowdown)}</em>.</> : `${longest.city}, race mornings.`}>
      <Scatter points={eds.map((e) => ({ id: String(e.year), x: e.temp, y: e.slowdown, label: String(e.year), key: `${longest.city} ${e.year}`, value: `${temp(e.temp, 'mi')} · ${pct(e.slowdown)}`, inPair: inPair(e.year) }))}
        xDomain={[t0, t1]} yDomain={[0, s1]} xTicks={Array.from({ length: (t1 - t0) / 5 + 1 }, (_, i) => t0 + i * 5).map((c) => ({ value: c, label: temp(c, 'mi') }))}
        yTicks={[{ value: s1, label: pct(s1) }, { value: s1 / 2, label: pct(s1 / 2) }]} pairLabel="The coolest and warmest mornings"
        label={`Start temperature against sustained slowdown, ${eds.length} editions of ${longest.city}`}
        values={<Values id="ds-v-scatter" caption={`${longest.city}: race mornings`} columns={[{ key: 'y', label: 'Year' }, { key: 't', label: 'At the start' }, { key: 's', label: 'Sustained slowdown' }]}
          rows={eds.map((e) => [String(e.year), temp(e.temp, 'mi'), pct(e.slowdown)])} />} />
    </Form>
  );
}

// ---------- Effect band: warmer mornings, by start temperature ----------
function WarmthEffect() {
  const curv = courses.weather.curvature.slowdown_points_per_c;
  const fit = courses.weather.fits.slowdown_within;
  return (
    <Form id="ds-effect" title="Binned effect band" note={<>Within a course, each degree warmer at the start went with <em>{fit.slope.toFixed(1)} points</em> more sustained slowdown.</>}>
      <EffectBand bins={curv.map((c) => ({ id: String(c.temp), label: temp(c.temp, 'mi'), value: c.slope, lo: c.ci95[0], hi: c.ci95[1] }))}
        estimate={{ value: fit.slope, lo: fit.ci95[0], hi: fit.ci95[1], label: 'Across all temperatures, with its interval' }} span={3} nullBand={0.5} unit="pts"
        label="Points of sustained slowdown per degree warmer, by start temperature, against a no-difference band"
        values={<Values id="ds-v-effect" caption="Points per °C warmer, by start temperature" columns={[{ key: 't', label: 'At the start' }, { key: 's', label: 'Points per °C' }, { key: 'c', label: 'Interval' }]}
          rows={curv.map((c) => [temp(c.temp, 'mi'), c.slope.toFixed(2), `${c.ci95[0].toFixed(2)} to ${c.ci95[1].toFixed(2)}`])} />} />
    </Form>
  );
}

// ---------- Elevation and pace blocks: the hilliest course with a pacing shape ----------
function Hills() {
  const shaped = new Map(courses.courses.filter((c) => c.curve?.length === 9).map((c) => [c.city, c]));
  const geo = geometry.filter((g) => shaped.has(g.city)).reduce((a, b) => (b.gain_m > a.gain_m ? b : a));
  const curve = shaped.get(geo.city)!.curve!;
  const relief = Math.ceil(Math.max(...geometry.map((g) => g.max_m - g.min_m)) / 50) * 50;
  const km = geo.elevation_m.map((_, i) => i * geo.elevation_step_km);
  const climb = SECTION_KM.map(([a, b]) => {
    let up = 0;
    for (let i = 1; i < km.length; i++) if (km[i] > a && km[i] <= b + 1e-9) up += Math.max(0, geo.elevation_m[i] - geo.elevation_m[i - 1]);
    return up;
  });
  const slowest = curve.indexOf(Math.max(...curve));
  return (
    <Form id="ds-hills" title="Elevation and pace blocks" note={<>{geo.city} climbs {Math.round(geo.gain_m * 3.28084).toLocaleString('en-US')} ft; its slowest section is <em>{sectionLabel(...SECTION_KM[slowest])}</em>, {signedPct(curve[slowest])} against its own average.</>}>
      <ElevationPace km={km} metres={geo.elevation_m} relief={relief} focus={slowest} readoutKeys={['Climb', 'Pace against its average']}
        sections={SECTION_KM.map(([a, b], i) => ({ label: sectionLabel(a, b), startKm: a, endKm: b, pct: curve[i], display: signedPct(curve[i]), climb: `${Math.round(climb[i] * 3.28084)} ft` }))}
        label={`${geo.city}: elevation on the scale every course shares, with each section's pace against the course's own average`}
        values={<Values id="ds-v-hills" caption={`${geo.city} by section`} columns={[{ key: 's', label: 'Section' }, { key: 'c', label: 'Climb' }, { key: 'p', label: 'Pace against its average' }]}
          rows={SECTION_KM.map(([a, b], i) => [sectionLabel(a, b), `${Math.round(climb[i] * 3.28084)} ft`, signedPct(curve[i], 1)])} />} />
    </Form>
  );
}

// ---------- Waterfall: where two close finishes split ----------
function Sections() {
  const chart = getAnalysisStart().answers.find((a) => a.id === 'sections')?.charts[0];
  const rows = (chart?.rows ?? []) as { label: string; below: number; above: number }[];
  const steps = rows.map((r, i) => ({ id: String(i), label: sectionLabel(...SECTION_KM[i]), value: (r.above - r.below) * 60, display: delta((r.above - r.below) * 60) }));
  const total = steps.reduce((s, x) => s + x.value, 0);
  const big = steps.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <Form id="ds-waterfall" title="Waterfall" note={<>Just over and just under {hm(EXAMPLE_PROFILE.goal)} split most in <em>{big.label}</em>: {big.display}.</>}>
      <Waterfall steps={steps} total={{ label: 'Finish', display: delta(total) }} label={`The gap between finishes just over and just under ${hm(EXAMPLE_PROFILE.goal)}, built section by section; ${big.label} added the most, ${big.display}.`}
        values={<Values id="ds-v-wf" caption={`Just over against just under ${hm(EXAMPLE_PROFILE.goal)}, by section`} columns={[{ key: 's', label: 'Section' }, { key: 'g', label: 'Gap added' }]} rows={steps.map((s) => [s.label, s.display])} />} />
    </Form>
  );
}

// ---------- Cumulative curve: a target among the field ----------
function Target() {
  const rows = (getAnalysisStart().answers.find((a) => a.id === 'ambition')?.charts[0]?.rows ?? []) as { label: number; value: number }[];
  const pts = rows.map((r) => ({ x: Number(r.label), share: Number(r.value) / 100 })).filter((p) => p.share >= 0.01 && p.share <= 0.99);
  const goal = EXAMPLE_PROFILE.goal;
  const at = pts.reduce((b, p) => (Math.abs(p.x - goal) < Math.abs(b.x - goal) ? p : b));
  const marks = [180, 210, 240, 270, 300, 330, 360].filter((m) => m >= pts[0].x && m <= pts[pts.length - 1].x);
  return (
    <Form id="ds-cdf" title="Cumulative curve" note={<><em>{pct(at.share)}</em> of finishes came in under {hm(goal)}.</>}>
      <Cdf points={pts} you={goal} ticks={marks.filter((_, i) => i % 2 === 0).map((m) => ({ value: m, label: hm(m) }))}
        scrub={{ label: 'Finish time', points: { x: pts.map((p) => (p.x - pts[0].x) / (pts[pts.length - 1].x - pts[0].x)), keys: pts.map((p) => `Under ${hm(p.x)}`), values: pts.map((p) => pct(p.share)) },
          initial: pts.indexOf(at), detents: marks.map((m) => pts.findIndex((p) => p.x === m)).filter((i) => i >= 0) }}
        label={`The share of finishes under each time; ${pct(at.share)} under ${hm(goal)}`}
        values={<Values id="ds-v-cdf" caption="Finishes under each round time" columns={[{ key: 't', label: 'Under' }, { key: 's', label: 'Share of finishes' }]} rows={marks.map((m) => [hm(m), pct(pts.find((p) => p.x === m)?.share ?? NaN)])} />} />
    </Form>
  );
}

// ---------- Slope: recorded women's share, first year to last ----------
function WomenSlope() {
  const cities = demo.women_share_by_city.map((c) => {
    const ys = c.years.filter((y) => y.n >= 100).sort((a, b) => a.year - b.year);
    return ys.length >= 2 ? { id: c.city, label: c.city, from: ys[0].women_share, to: ys[ys.length - 1].women_share } : null;
  }).filter((c): c is { id: string; label: string; from: number; to: number } => !!c);
  const rose = cities.filter((c) => c.to > c.from).length;
  return (
    <Form id="ds-slope" title="Slope chart" note={<>Recorded women&rsquo;s share of finishes rose in <em>{rose} of {cities.length}</em> cities, from each city&rsquo;s first year to its latest.</>}>
      <Slope items={cities} fromLabel="First year" toLabel="Latest year" format={(v) => pct(v)} label={`Recorded women's share rose in ${rose} of ${cities.length} cities`}
        values={<Values id="ds-v-slope" caption="Recorded women's share of finishes" columns={[{ key: 'c', label: 'City', text: true }, { key: 'f', label: 'First year' }, { key: 't', label: 'Latest year' }]} rows={cities.map((c) => [c.label, pct(c.from), pct(c.to)])} />} />
    </Form>
  );
}

// ---------- Ghost race: recorded women and men with the same finish ----------
function Ghost() {
  const band = demo.bands.reduce((a, b) => (Math.abs(b.lo_min - EXAMPLE_PROFILE.goal) < Math.abs(a.lo_min - EXAMPLE_PROFILE.goal) ? b : a));
  const finish = (band.lo_min + 5) * 60;
  const lens = SECTION_KM.map(([a, b]) => b - a);
  const raw = lens.map((l, i) => l * (1 + band.men_profile[i] / 100));
  const scale = finish / raw.reduce((s, v) => s + v, 0);
  const men: number[] = [];
  raw.reduce((t, v) => { men.push(t + v * scale); return t + v * scale; }, 0);
  const women = men.map((t, k) => t + band.ghost_s[k]);
  const mats = [0, ...SECTION_KM.map(([, b]) => b)];
  const at = (cum: number[], t: number) => {
    const c = [0, ...cum];
    if (t >= c[c.length - 1]) return 42.195;
    let j = 1;
    while (c[j] < t) j++;
    return mats[j - 1] + ((t - c[j - 1]) / (c[j] - c[j - 1])) * (mats[j] - mats[j - 1]);
  };
  const timeAt = (cum: number[], km: number) => {
    const c = [0, ...cum];
    let j = 1;
    while (j < mats.length - 1 && mats[j] < km) j++;
    return c[j - 1] + ((km - mats[j - 1]) / (mats[j] - mats[j - 1])) * (c[j] - c[j - 1]);
  };
  const end = Math.max(men[8], women[8]);
  const peak = band.ghost_s.indexOf(Math.max(...band.ghost_s));
  // Every minute of the race, and the moment the men reach the mat the sentence names, so the default reads its number.
  const clocks = [...new Set([...Array.from({ length: Math.floor(end / 60) + 1 }, (_, i) => i * 60), men[peak]])].sort((x, y) => x - y);
  const ghost = clocks.map((t) => at(men, t));
  const runner = clocks.map((t) => at(women, t));
  const gaps = clocks.map((t, i) => {
    const lead = Math.max(ghost[i], runner[i]);
    if (t === 0) return 'Both at the start';
    if (lead >= 42.195 && runner[i] >= 42.195 && ghost[i] >= 42.195) return 'Both finished';
    const behind = ghost[i] >= runner[i] ? timeAt(women, lead) - t : timeAt(men, lead) - t;
    return ghost[i] >= runner[i] ? `Women ${ms(Math.max(0, behind))} behind` : `Men ${ms(Math.max(0, behind))} behind`;
  });
  const initial = clocks.indexOf(men[peak]);
  return (
    <Form id="ds-ghost" title="Ghost race" note={<>Finishing in {band.label}, recorded men reached {sectionLabel(...SECTION_KM[peak]).split('–')[1]} <em>{ms(band.ghost_s[peak])}</em> ahead of recorded women, and the two finished together.</>}>
      <GhostRace clocks={clocks} ghost={ghost} runner={runner} gaps={gaps} names={{ ghost: 'Recorded men', runner: 'Recorded women' }} clockLabels={clocks.map((t) => hm(t / 60))}
        ticks={Array.from({ length: Math.floor(end / 3600) + 1 }, (_, h) => ({ x: (h * 3600) / clocks[clocks.length - 1], label: `${h}h` }))}
        initial={Math.max(0, initial)} detents={[Math.max(0, initial)]} label={`Recorded women and men finishing in ${band.label}`} />
    </Form>
  );
}

// ---------- Dot grid, ruler and type glyphs ----------
function Small() {
  const fastest = kick.bank.bands.reduce((a, b) => (b.open_s < a.open_s ? b : a));
  const even = kick.bank.bands.reduce((a, b) => (Math.abs(b.open_s) < Math.abs(a.open_s) ? b : a));
  const s = getFinishTimeSummary();
  const p = (g: typeof s.groups.all, q: number) => g.percentiles.find((x) => x.p === q)?.minute ?? NaN;
  const lo = p(s.groups.all, 0.1), hi = p(s.groups.all, 0.9);
  const domain = [...types.archetypes.flatMap((a) => a.profile)];
  return (
    <>
      <Form id="ds-dots" title="Dot grid" note={<>Of 100 finishes with a first 5K {fastest.label.toLowerCase()}, <em>{Math.round(fastest.slowdown * 100)}</em> had a sustained slowdown; with an even one, {Math.round(even.slowdown * 100)}.</>}>
        <div className="ds-pair">
          <DotGrid lit={fastest.slowdown * 100} label={`${Math.round(fastest.slowdown * 100)} of 100 finishes with a first 5K ${fastest.label.toLowerCase()} had a sustained slowdown`} caption={<><strong>{fastest.label}</strong></>} />
          <DotGrid lit={even.slowdown * 100} compare label={`${Math.round(even.slowdown * 100)} of 100 finishes with an even first 5K had a sustained slowdown`} caption={<><strong>{even.label}</strong></>} />
          <DotGrid lit={fastest.slowdown * 100} you={40} label="The same grid with a guess of 40 ringed" caption={<><strong>With a guess:</strong> 40</>} />
        </div>
      </Form>
      <Form id="ds-ruler" title="Ruler" note={withEm(sentenceOf(getNugget('field.median')))}>
        <Ruler min={lo} max={hi} label={`Median finishes between the 10th and 90th percentile: all ${hm(s.groups.all.median!)}, women ${hm(s.groups.women.median!)}, men ${hm(s.groups.men.median!)}`}
          ticks={[lo, Math.round((lo + hi) / 2), hi].map((m) => ({ value: m, label: hm(m) }))}
          marks={[{ value: s.groups.men.median!, kind: 'compare', label: `Men ${hm(s.groups.men.median!)}` }, { value: s.groups.women.median!, kind: 'compare', label: `Women ${hm(s.groups.women.median!)}` }, { value: s.groups.all.median!, kind: 'reading', label: `All ${hm(s.groups.all.median!)}` }]} />
      </Form>
      <Form id="ds-glyphs" title="Type glyphs" note={<>Six pacing types, each next to its name, on one shared scale. The rarest: <em>{inWords(Math.min(...types.archetypes.map((a) => a.share)))}</em> finishes.</>}>
        <ul className="ds-glyphs">
          {types.archetypes.map((a, i) => <li key={a.slug}><TypeGlyph profile={a.profile} index={i} domain={[Math.min(...domain), Math.max(...domain)]} /><span>{a.name}</span><b>{pct(a.share)}</b></li>)}
        </ul>
        <div className="night ds-night"><ul className="ds-glyphs">
          {types.archetypes.map((a, i) => <li key={a.slug}><TypeGlyph profile={a.profile} index={i} domain={[Math.min(...domain), Math.max(...domain)]} /><span>{a.name}</span><b>{pct(a.share)}</b></li>)}
        </ul></div>
      </Form>
    </>
  );
}

// ---------- The replay ----------
function Replay() {
  const manifest = getInsightsManifest();
  const routes = new Map(geometry.map((c) => [c.city, { points: c.route, km: c.route_km }]));
  const choices = replayChoices(replay.editions, manifest, routes);
  return (
    <>
      <Form id="ds-replay" title="Race replay, rank lanes" note={withEm(sentenceOf(getNugget('replay.first')))}>
        <div className="night ds-night ds-replay"><HeroReplay choices={choices} /></div>
      </Form>
      <Form id="ds-replay-band" title="Race replay, the home band" note="The same replay at a fifth of the screen, with no picker.">
        <div className="night ds-night ds-replay"><HeroReplay choices={choices} band /></div>
      </Form>
    </>
  );
}

export default function Charts() {
  return (
    <section className="beat ds-section ds-charts" id="charts" aria-labelledby="charts-title">
      <div className="beat-head">
        <span className="t-kicker">14 · Charts</span>
        <h2 className="t-h2" id="charts-title">Touch the data</h2>
      </div>
      <p className="t-body ds-lede">Every chart is drawn on the server and fits any width. Drag across a chart with a needle; tap a dot to read it.</p>
      <Replay />
      <MinuteHistogram />
      <SecondBins />
      <OpeningCurve />
      <TypeProfiles />
      <CourseStrip />
      <OpeningDumbbell />
      <OnsetBar />
      <PairsWaffle />
      <CourseYears />
      <CourseWeather />
      <WarmthEffect />
      <Hills />
      <Sections />
      <Target />
      <WomenSlope />
      <Ghost />
      <Small />
    </section>
  );
}
