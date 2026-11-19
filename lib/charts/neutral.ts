/**
 * A chart's drawing when its takeaway's guard does not hold on the published values (AGENTS rule 13: a fallback states
 * no reading in any slot). The page then shows the chart's numbers with nothing that marks the reading the guard
 * rejected: no signal mark, no accent series laid over a line, no note (a note is a reading), no ring on a cell, and no
 * row, column, bin or point singled out by a tone or a name. The numbers themselves are unchanged, so the table under
 * the chart is still its twin. scripts/verify-charts.cjs holds every chart in the fallback state to `readingMarks`.
 */
import type { ChartSpec, KeyItem, Ref, Band, Series, Tone } from './spec';

/** Tones a category (a part of a stack, a part of a waffle) may take in place of the signal, first free one wins. */
const CATEGORY_TONES: Tone[] = ['ink', 'ink2', 'o3', 'o1', 'o4', 'o2'];

const withoutSignal = (tone: Tone | undefined): Tone | undefined => (tone === 'signal' ? 'ink' : tone);
const refOf = (ref: Ref): Ref => ({ ...ref, tone: ref.tone === 'signal' ? 'ink' : ref.tone });
const bandOf = (band: Band): Band => ({ ...band, tone: band.tone === 'signal' ? 'quiet' : band.tone });
const keyOf = (key: KeyItem[] | undefined): KeyItem[] | undefined => key?.map((k) => ({ ...k, tone: withoutSignal(k.tone) as Tone }));

/** Parts that are categories keep telling each other apart: the signal part takes the first tone no other part has. */
function categoryTones<P extends { tone: Tone }>(parts: P[]): P[] {
  const used = new Set<Tone>(parts.map((p) => p.tone).filter((t) => t !== 'signal'));
  return parts.map((p) => {
    if (p.tone !== 'signal') return p;
    const tone = CATEGORY_TONES.find((t) => !used.has(t)) ?? 'ink';
    used.add(tone);
    return { ...p, tone };
  });
}

/**
 * The series of a line chart without its accents: a series whose every point lies on the series kept before it (a
 * lit segment, a marked point, a bracket between two line ends) is an accent and is left out; a signal line that is
 * data of its own is drawn in ink.
 */
function plainSeries(series: Series[]): Series[] {
  const at = (p: [number, number]) => `${p[0]}\u0000${p[1]}`;
  const order = series.map((s, i) => ({ s, i })).sort((a, b) => b.s.points.length - a.s.points.length || a.i - b.i);
  const drawn = new Set<string>();
  const keep = new Set<number>();
  for (const { s, i } of order) {
    if (keep.size && s.points.every((p) => drawn.has(at(p)))) continue;
    keep.add(i);
    s.points.forEach((p) => drawn.add(at(p)));
  }
  return series.filter((_, i) => keep.has(i)).map((s) => ({ ...s, tone: withoutSignal(s.tone) as Tone }));
}

/** The spec with no mark of a reading. Values, axes, labels of groups and the order of rows are the chart's own. */
export function neutralSpec(spec: ChartSpec): ChartSpec {
  const base = { ...spec, notes: undefined, key: keyOf(spec.key) };
  switch (base.form) {
    case 'bars':
      return { ...base, rows: base.rows.map(({ label, value }) => ({ label, value })), ref: base.ref && refOf(base.ref) };
    case 'dumbbell':
      return { ...base, rows: base.rows.map(({ label, a, b }) => ({ label, a, b })), ref: base.ref && refOf(base.ref) };
    case 'range':
      return { ...base, rows: base.rows.map(({ label, lo, q1, mid, q3, hi }) => ({ label, lo, q1, mid, q3, hi })) };
    case 'slope':
      return { ...base, rows: base.rows.map(({ label, a, b }) => ({ label, a, b })) };
    case 'pyramid':
      return { ...base, rows: base.rows.map(({ label, left, right }) => ({ label, left, right })) };
    case 'stacked':
      return { ...base, rows: base.rows.map(({ label, parts }) => ({ label, parts })), parts: categoryTones(base.parts) };
    case 'columns':
      return { ...base, cols: base.cols.map(({ label, value }) => ({ label, value })), ref: base.ref && refOf(base.ref) };
    case 'histogram':
      return {
        ...base, bins: base.bins.map(({ x0, x1, v }) => ({ x0, x1, v })),
        overlay: base.overlay && { ...base.overlay, tone: withoutSignal(base.overlay.tone) },
        bands: base.bands?.map(bandOf), refs: base.refs?.map(refOf),
      };
    case 'lines':
      return { ...base, series: plainSeries(base.series), bands: base.bands?.map(bandOf), refs: base.refs?.map(refOf) };
    case 'scatter':
      // The fitted line draws the association the takeaway read, so it goes with the reading; the points stay.
      return { ...base, points: base.points.map(({ x, y }) => ({ x, y })), fit: undefined, refs: base.refs?.map(refOf) };
    case 'heatmap':
      return { ...base, highlight: undefined };
    case 'waffle':
      return { ...base, parts: categoryTones(base.parts) };
    case 'big':
      return { ...base, plain: true, compare: base.compare?.map((c) => ({ ...c, tone: 'ink' as Tone })) };
    case 'flow':
      return { ...base, highlight: undefined };
    case 'strip':
      return { ...base, groups: base.groups.map((g) => ({ label: g.label, dots: g.dots.map(({ v }) => ({ v })) })), refs: base.refs?.map(refOf) };
    case 'multiples':
      return {
        ...base, panels: base.panels.map((p) => ({ label: p.label, series: p.series.map((s) => ({ ...s, tone: withoutSignal(s.tone) as Tone })) })),
        refs: base.refs?.map(refOf),
      };
    case 'ridgeline':
      return { ...base, rows: base.rows.map(({ label, points }) => ({ label, points })), refs: base.refs?.map(refOf) };
  }
}

/** What in a spec still marks a reading: a signal tone, a note, a ring on a cell or the signal figure of a big number. */
export function readingMarks(spec: ChartSpec): string[] {
  const found: string[] = [];
  const walk = (value: unknown, where: string) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${where}[${i}]`));
    else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        if ((k === 'tone' || k === 'toneLeft' || k === 'toneRight') && v === 'signal') found.push(`${where}.${k}`);
        else walk(v, `${where}.${k}`);
      }
    }
  };
  walk(spec, 'plot');
  if (spec.notes?.length) found.push('plot.notes');
  if ((spec.form === 'heatmap' || spec.form === 'flow') && spec.highlight?.length) found.push('plot.highlight');
  if (spec.form === 'big' && !spec.plain) found.push('plot.value (the figure is drawn in the signal ink)');
  return found;
}
