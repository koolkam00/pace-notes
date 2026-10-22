import type { ReactNode } from 'react';
import DotStrip from '@/components/viz/DotStrip';
import Columns from '@/components/viz/Columns';
import Values from '@/components/ui/Values';
import { bandShort, type AllFinisherGroup } from '@/lib/all-finisher-context';
import { count, pct, temp } from '@/lib/nuggets/format';
import type { UnitSystem } from '@/lib/units';

/**
 * The all-finisher answers' two charts, drawn once for the page's example (server) and again for a Make it yours
 * selection on the same card (HeroSwap, browser): course comparison's ranked dot strip and race-day weather's columns by
 * start temperature. One module, so the selection is drawn in the answer's own grammar (critic round 5: the explorer drew
 * a second, plainer copy under the form). Pure: no server reads.
 */
export type AnswerParts = { kicker: string; chart: ReactNode; values: ReactNode };

/** The courses most readers know, named in quiet ink on a wide strip (DotStrip `named`); any not shown is skipped. */
const MAJORS = ['Boston', 'Berlin', 'Chicago', 'London', 'New York'];
const courseName = (city: string) => (city === 'New York' ? 'New York City' : city);
const cap = (s: string) => s.replace(/^[a-z]/, (c) => c.toUpperCase());

/** Every course with 100 finishes or more; fewer than three editions is hollow and never the strip's named end. */
export function courseStrip(groups: AllFinisherGroup[], { id, subject }: { id: string; subject?: string }): AnswerParts | null {
  const shown = groups.filter((c) => c.n >= 100 && Number.isFinite(c.slowdown_pct));
  const comparable = new Set(shown.filter((c) => c.edition_n >= 3).map((c) => c.id));
  const sorted = [...shown].sort((a, b) => a.slowdown_pct - b.slowdown_pct);
  if (sorted.length < 2) return null;
  const v = sorted.map((c) => c.slowdown_pct);
  const lo = Math.floor(Math.min(...v) / 10) * 10, hi = Math.ceil(Math.max(...v) / 10) * 10;
  const ticks = Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10);
  // The subject is the course followed; the example's is the high end (the H1's accent), where the readout opens.
  const high = sorted.filter((c) => comparable.has(c.id)).reduce<AllFinisherGroup | undefined>((a, b) => (!a || b.slowdown_pct > a.slowdown_pct ? b : a), undefined);
  const focus = sorted.find((c) => c.id === subject) ?? high;
  return {
    kicker: `${sorted.length} courses${sorted.every((c) => comparable.has(c.id)) ? ' with three or more editions' : ''}`,
    chart: (
      <DotStrip labelSubject mdScale={1.4} named={MAJORS} hint="Choose a dot to read its course" items={sorted.map((c) => ({ id: c.id, label: courseName(c.label), value: c.slowdown_pct, display: pct(c.slowdown_pct / 100), detail: count(c.n), hollow: !comparable.has(c.id), subject: c === focus }))}
        domain={[lo, Math.max(...v) > hi - 5 ? hi + 5 : hi]} ticks={ticks.map((t) => ({ value: t, label: `${t}%` }))} readoutKey="Finishes"
        keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
        label={`Sustained slowdown by course, one dot per course, from ${pct(v[0] / 100)} to ${pct(v[v.length - 1] / 100)}; choose a dot to read it`} />
    ),
    values: (
      <Values id={id} caption="Sustained slowdown by course" columns={[{ key: 'c', label: 'Course', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'e', label: 'Editions' }, { key: 'n', label: 'Finishes' }]}
        rows={sorted.map((c) => [courseName(c.label), pct(c.slowdown_pct / 100), c.edition_n, count(c.n)])} reading={focus ? sorted.indexOf(focus) : undefined} />
    ),
  };
}

/** A start-temperature band in the reader's units: "41–50°F", "below 41°F", "68°F or warmer". */
export function bandWordsOf(g: Pick<AllFinisherGroup, 'lower_c' | 'upper_c'>, u: UnitSystem): string {
  if (g.lower_c == null) return `below ${temp(g.upper_c!, u)}`;
  if (g.upper_c == null) return `${temp(g.lower_c, u)} or warmer`;
  return `${temp(g.lower_c, u).replace(/°[CF]$/, '')}–${temp(g.upper_c, u)}`;
}

/**
 * Sustained slowdown by start temperature, one column per band with 100 finishes or more. The band followed is the
 * signal; the example's is the fewest among bands with five or more races (the H1's band), or among every band shown
 * when fewer than two have five, as the H2 picks its end (October 22, 2026: Chicago had one such band, which the label
 * called the fewest while the H2 named a cooler one). A band with fewer races is hollow and keyed.
 */
export function bandColumns(groups: AllFinisherGroup[], units: UnitSystem, { id, subject }: { id: string; subject?: string }): AnswerParts | null {
  const bands = groups.filter((g) => g.n >= 100 && Number.isFinite(g.slowdown_pct)).sort((a, b) => (a.upper_c ?? Infinity) - (b.upper_c ?? Infinity));
  if (!bands.length) return null;
  const steady = bands.filter((g) => g.edition_n >= 5);
  const low = (steady.length >= 2 ? steady : bands).reduce<AllFinisherGroup | undefined>((a, b) => (!a || b.slowdown_pct < a.slowdown_pct ? b : a), undefined);
  const focus = bands.find((g) => g.id === subject) ?? low;
  const top = Math.ceil(Math.max(...bands.map((g) => g.slowdown_pct)) / 10) * 10 + 5;
  return {
    kicker: `By start temperature, ${units === 'mi' ? '°F' : '°C'}`,
    chart: (
      <Columns items={bands.map((g) => ({ id: g.id, label: bandShort(g, units, false), value: g.slowdown_pct, display: pct(g.slowdown_pct / 100), tone: g === focus ? 'signal' : g.edition_n < 5 ? 'hollow' : 'ink' }))}
        max={top} keys={bands.some((g) => g.edition_n < 5) ? [{ label: 'Fewer than five races', mark: 'hollow' }] : undefined}
        label={`Sustained slowdown by start temperature, from ${bands.map((g) => `${bandWordsOf(g, units)} ${pct(g.slowdown_pct / 100)}`).join(', ')}${low ? `; the fewest at ${bandWordsOf(low, units)}` : ''}${focus && focus !== low ? `; following ${bandWordsOf(focus, units)}` : ''}`} />
    ),
    values: (
      <Values id={id} caption="Sustained slowdown by start temperature" columns={[{ key: 't', label: 'At the start', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'r', label: 'Races' }, { key: 'n', label: 'Finishes' }]}
        rows={bands.map((g) => [cap(bandWordsOf(g, units)), pct(g.slowdown_pct / 100), g.edition_n, count(g.n)])} reading={focus ? bands.indexOf(focus) : undefined} />
    ),
  };
}
