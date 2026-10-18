import type { ReactNode } from 'react';
import Values from '@/components/ui/Values';
import LineProfile from '@/components/viz/LineProfile';
import Waterfall from '@/components/viz/Waterfall';
import Cdf from '@/components/viz/Cdf';
import ElevationPace from '@/components/viz/ElevationPace';
import Columns from './Columns';
import { MARATHON_SECTION_ENDS, sectionLabel } from '@/lib/section-labels';
import { elevationValue, paceLabel, type UnitSystem } from '@/lib/units';

/** An elevation in whole feet or metres ("+171 ft"): a climb is never read to a tenth. */
export const wholeElevation = (metres: number, units: UnitSystem) => `${Math.round(elevationValue(metres, units)).toLocaleString('en-US')}\u00a0${units === 'mi' ? 'ft' : 'm'}`;
import type { GuideAnswer } from '@/lib/personalized';

/**
 * The explorer's one chart for each guide analysis (the redesign spec, section 7), drawn from the selection's answer:
 * the same server-drawn forms the pages use, so the visitor's comparison looks like the page's own. Pure: no state, so
 * the server draws the example and the browser redraws a comparison the visitor picks.
 */
const SECTION_MIDS = MARATHON_SECTION_ENDS.map((end, i) => ((i ? MARATHON_SECTION_ENDS[i - 1] : 0) + end) / 2);
const LENGTHS = MARATHON_SECTION_ENDS.map((end, i) => end - (i ? MARATHON_SECTION_ENDS[i - 1] : 0));
const KM_TICKS = [{ value: 0, label: 'Start' }, { value: 10, label: '10K' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const hm = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const signed = (s: number) => { const t = Math.round(Math.abs(s)); return `${s < 0 && t ? '−' : '+'}${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const signedPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

export type TerrainExtras = { elevation: number[] | null; step: number; relief: number };

export default function ExplorerChart({ id, answer, goal, units, terrain, valuesId, selectedAge, example = false }: {
  id: string; answer: GuideAnswer; goal: number; units: UnitSystem; terrain?: TerrainExtras; valuesId: string; selectedAge?: string;
  /** The page's own example (its answer card), not the visitor's selection: the goal is the page's, not "You". */
  example?: boolean;
}): ReactNode {
  if (id === 'profile') return <PaceProfile answer={answer} goal={goal} units={units} valuesId={valuesId} />;
  if (id === 'terrain') return <Terrain answer={answer} units={units} terrain={terrain} valuesId={valuesId} />;
  if (id === 'sections') return <Sections answer={answer} goal={goal} valuesId={valuesId} />;
  if (id === 'ambition') return <Target answer={answer} goal={goal} valuesId={valuesId} example={example} />;
  if (id === 'gains') return <Gains answer={answer} goal={goal} units={units} valuesId={valuesId} />;
  if (id === 'age') return <Ages answer={answer} valuesId={valuesId} selectedAge={selectedAge} />;
  return null;
}

/** Pace through the race for finishes near the goal: the median, its middle half, even goal pace dashed. */
function PaceProfile({ answer, goal, units, valuesId }: { answer: GuideAnswer; goal: number; units: UnitSystem; valuesId: string }) {
  const chart = answer.charts.find((c) => c.unit === 'min/km');
  if (!chart) return null;
  const k = units === 'mi' ? 1.609344 : 1;
  const rows = chart.rows.map((r) => ({ end: num(r.label), lo: num(r.low) * 60 * k, mid: num(r.value) * 60 * k, hi: num(r.high) * 60 * k }));
  const even = ((goal * 60) / 42.195) * k;
  // The domain fits the middle half and even pace with a little room; the readout carries the values, so no gridline
  // label sits where the needle opens and no label repeats the readout.
  const lo = Math.min(...rows.map((r) => r.lo), even), hi = Math.max(...rows.map((r) => r.hi), even);
  const room = (hi - lo) * 0.12 || 5;
  const slowest = rows.reduce((b, r, i) => (r.mid > rows[b].mid ? i : b), 0);
  const pace = (s: number) => paceLabel(s / k, units);
  return (
    // Slower is down, as on every pace chart on the site (the domain runs from slow at the foot to fast at the top).
    <LineProfile x={SECTION_MIDS} xDomain={[0, 42.195]} yDomain={[hi + room, lo - room]}
      layers={[{ id: 'p', label: 'Median', series: [{ id: 'm', values: rows.map((r) => r.mid) }], band: { lo: rows.map((r) => r.lo), hi: rows.map((r) => r.hi) } }]}
      refs={[{ value: even, dashed: true, label: `even ${hm(goal)}` }]}
      xTicks={KM_TICKS}
      scrub={{ label: 'Section pace, start to finish', initial: slowest, detents: [slowest],
        points: { x: SECTION_MIDS.map((m) => m / 42.195), keys: MARATHON_SECTION_ENDS.map((e) => `${sectionLabel(e)}, median pace`), values: rows.map((r) => pace(r.mid)),
          side: [{ label: 'Middle half', values: rows.map((r) => `${paceLabel(r.lo / k, units, false)}–${pace(r.hi)}`) }] } }}
      keys={[{ label: 'Middle half of finishes', mark: 'band' }, { label: `Even ${hm(goal)} pace, ${pace(even)}`, mark: 'dash' }]}
      label={`Median section pace for ${answer.comparison ?? 'finishes near this time'}; slowest in ${sectionLabel(MARATHON_SECTION_ENDS[slowest])} at ${pace(rows[slowest].mid)}`}
      values={<Values id={valuesId} caption="Median section pace, with the middle half of finishes" columns={[{ key: 's', label: 'Section' }, { key: 'm', label: 'Median' }, { key: 'r', label: 'Middle half' }]}
        rows={rows.map((r, i) => [sectionLabel(MARATHON_SECTION_ENDS[i]), pace(r.mid), `${paceLabel(r.lo / k, units, false)}–${pace(r.hi)}`])} reading={slowest} />}
      height={210} heightMd={260} />
  );
}

/** A course's climbs on the shared height scale, with each section's pace against the finishes' own average. */
function Terrain({ answer, units, terrain, valuesId }: { answer: GuideAnswer; units: UnitSystem; terrain?: TerrainExtras; valuesId: string }) {
  const pace = answer.charts.find((c) => c.unit === 'min/km');
  const climbs = answer.charts.find((c) => c.series.some((s) => s.key === 'gain'));
  const net = answer.charts.find((c) => c.unit === 'm' && c.series.length === 1);
  if (!pace || !terrain) return null;
  const p = pace.rows.map((r) => num(r.value));
  const mean = p.reduce((s, v, i) => s + v * LENGTHS[i], 0) / 42.195;
  const pct = p.map((v) => (v / mean - 1) * 100);
  const gainOf = (i: number) => num(climbs?.rows.find((r) => r.label === sectionLabel(MARATHON_SECTION_ENDS[i]))?.gain);
  const netOf = (i: number) => num(net?.rows.find((r) => r.label === sectionLabel(MARATHON_SECTION_ENDS[i]))?.value);
  const slowest = pct.reduce((b, v, i) => (v > pct[b] ? i : b), 0);
  // The supplied route's profile where there is one, else the section nets joined end to end.
  const km = terrain.elevation ? terrain.elevation.map((_, i) => Math.min(42.195, i * terrain.step)) : [0, ...MARATHON_SECTION_ENDS];
  let h = 0;
  const metres = terrain.elevation ?? [0, ...MARATHON_SECTION_ENDS.map((_, i) => (h += Number.isFinite(netOf(i)) ? netOf(i) : 0))];
  const climb = (i: number) => (Number.isFinite(gainOf(i)) ? `+${wholeElevation(gainOf(i), units)}` : '—');
  return (
    <ElevationPace km={km} metres={metres} relief={terrain.relief} focus={slowest} readoutKeys={['Climb', 'Pace against its average']}
      sections={MARATHON_SECTION_ENDS.map((end, i) => ({ label: sectionLabel(end), startKm: i ? MARATHON_SECTION_ENDS[i - 1] : 0, endKm: end, pct: pct[i], display: signedPct(Math.round(pct[i])), climb: climb(i) }))}
      label={`Elevation on the scale every course shares, with each 5K's pace against the finishes' own average; slowest in ${sectionLabel(MARATHON_SECTION_ENDS[slowest])}`}
      values={<Values id={valuesId} caption="By section: the climb and the pace against its own average" columns={[{ key: 's', label: 'Section' }, { key: 'c', label: 'Climb' }, { key: 'p', label: 'Pace against its average' }]}
        rows={MARATHON_SECTION_ENDS.map((end, i) => [sectionLabel(end), climb(i), signedPct(pct[i])])} reading={slowest} />} />
  );
}

/** Just over the goal against just under, section by section: the gap built from the start to the finish. */
function Sections({ answer, goal, valuesId }: { answer: GuideAnswer; goal: number; valuesId: string }) {
  const rows = answer.charts[0]?.rows ?? [];
  if (!rows.length) return null;
  const steps = rows.map((r, i) => ({ id: String(i), label: sectionLabel(MARATHON_SECTION_ENDS[i]), value: (num(r.above) - num(r.below)) * 60, display: signed((num(r.above) - num(r.below)) * 60) }));
  const total = steps.reduce((s, x) => s + x.value, 0);
  const big = steps.reduce((a, b) => (b.value > a.value ? b : a));
  // The mats between the sections, evenly every 10K, then the finish gap under its own bar.
  const mats = steps.length === MARATHON_SECTION_ENDS.length ? [0, 2, 4, 6, 8].map((at) => ({ at, label: at ? `${MARATHON_SECTION_ENDS[at - 1]}K` : 'Start' })) : undefined;
  return (
    <Waterfall steps={steps} total={{ label: 'Finish', display: signed(total) }} xTicks={mats}
      label={`The gap between finishes just over and just under ${hm(goal)}, built section by section; ${big.label} added the most, ${big.display}`}
      values={<Values id={valuesId} caption={`Just over ${hm(goal)} against just under, by section`} columns={[{ key: 's', label: 'Section' }, { key: 'g', label: 'Gap added' }]} rows={[...steps.map((s) => [s.label, s.display]), ['Finish', signed(total)]]} />} />
  );
}

/**
 * The share of the comparison's finishes under each time, the goal ringed. The visitor's own goal is "You" and the
 * readout opens on it; the page's example rings its goal by name and opens the readout on the median finish, the one
 * figure its headline (the shares under three round times) does not already give.
 */
function Target({ answer, goal, valuesId, example }: { answer: GuideAnswer; goal: number; valuesId: string; example: boolean }) {
  const rows = answer.charts[0]?.rows ?? [];
  const pts = rows.map((r) => ({ x: num(r.label), share: num(r.value) / 100 })).filter((p) => p.share >= 0.01 && p.share <= 0.99);
  if (pts.length < 2) return null;
  const at = pts.reduce((b, p) => (Math.abs(p.x - goal) < Math.abs(b.x - goal) ? p : b));
  const marks = Array.from({ length: 24 }, (_, i) => 120 + i * 30).filter((m) => m >= pts[0].x && m <= pts[pts.length - 1].x);
  const ticks = marks.filter((m) => m % 60 === 0);
  // The median: the first time with half the finishes under it.
  const half = pts.findIndex((p) => p.share >= 0.5);
  const open = example && half >= 0 ? half : pts.indexOf(at);
  return (
    <Cdf points={pts} you={goal} youLabel={example ? hm(goal) : 'You'} ticks={ticks.map((m) => ({ value: m, label: hm(m) }))}
      scrub={{ label: 'Finish time', points: { x: pts.map((p) => (p.x - pts[0].x) / (pts[pts.length - 1].x - pts[0].x)), keys: pts.map((p) => `Finishes under ${hm(p.x)}`), values: pts.map((p) => `${Math.round(p.share * 100)}%`) },
        initial: open, detents: [...marks.map((m) => pts.findIndex((p) => p.x === m)), ...(example ? [half] : [])].filter((i, k, all) => i >= 0 && all.indexOf(i) === k) }}
      label={`The share of finishes under each time; ${Math.round(at.share * 100)}% under ${hm(goal)}`}
      values={<Values id={valuesId} caption="Finishes under each round time" columns={[{ key: 't', label: 'Under' }, { key: 's', label: 'Share of finishes' }]} rows={marks.map((m) => [hm(m), `${Math.round((pts.find((p) => p.x === m)?.share ?? NaN) * 100)}%`])} />} />
  );
}

/** Where improving finishes found their time: the three blocks building the total gain. */
function Gains({ answer, goal, units, valuesId }: { answer: GuideAnswer; goal: number; units: UnitSystem; valuesId: string }) {
  const rows = answer.charts[0]?.rows ?? [];
  if (rows.length !== 3) return null;
  const labels = ['0–10K', '10–30K', '30K–finish'];
  // Time found reads unsigned ("8:44"): on this site + means behind, and these minutes are found, not lost.
  const plain = (s: number) => { const t = Math.round(Math.abs(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const steps = rows.map((r, i) => ({ id: String(i), label: labels[i], value: num(r.value) * 60, display: plain(num(r.value) * 60) }));
  const total = steps.reduce((s, x) => s + x.value, 0);
  return (
    <Waterfall steps={steps} total={{ label: 'In all', display: plain(total) }}
      label={`Where improving finishes near ${hm(goal)} found their time against an earlier best: ${steps.map((s) => `${s.label} ${s.display}`).join(', ')}, ${plain(total)} in all`}
      values={<Values id={valuesId} caption="Time found against the earlier best, by part of the race" columns={[{ key: 'b', label: 'Part of the race' }, { key: 'm', label: 'Time found' }, { key: 'k', label: units === 'mi' ? 'Per mile' : 'Per km' }]}
        rows={steps.map((s, i) => [s.label, s.display, `${Math.round((s.value / [10, 20, 12.195][i]) * (units === 'mi' ? 1.609344 : 1))} s`])} />} />
  );
}

/** The second 20K against the first, age group by age group. */
function Ages({ answer, valuesId, selectedAge }: { answer: GuideAnswer; valuesId: string; selectedAge?: string }) {
  const rows = (answer.charts[0]?.rows ?? []).map((r) => ({ age: String(r.label).replace(' (selected)', ''), value: num(r.value), n: num(r.n_value) }));
  if (rows.length < 2) return null;
  const max = Math.ceil(Math.max(...rows.map((r) => r.value)) / 2) * 2 + 2;
  return (
    <Columns items={rows.map((r) => ({ id: r.age, label: r.age, value: r.value, display: signedPct(r.value), tone: r.age === selectedAge ? 'signal' : 'ink' }))} max={max}
      label={`The second 20K against the first, by age group: ${rows.map((r) => `${r.age} ${signedPct(r.value)}`).join(', ')}`}
      values={<Values id={valuesId} caption="The second 20K against the first, by age group" columns={[{ key: 'a', label: 'Age group' }, { key: 'v', label: 'Second 20K' }, { key: 'n', label: 'Finishes' }]}
        rows={rows.map((r) => [r.age, signedPct(r.value), Number.isFinite(r.n) ? r.n.toLocaleString('en-US') : '—'])} />} />
  );
}
