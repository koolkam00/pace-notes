/**
 * The chart spec of the Top 100 charts (/charts). analysis/build_charts.py writes one spec per chart into
 * public/data/charts/NNN.json under `plot`; components/charts draws it as one server SVG on a fixed 340-unit-wide
 * canvas, the same drawing on the page and on the 1080 × 1350 card. Values are raw, in the nugget convention: times and
 * gaps in seconds, shares from 0 to 1, paces in seconds per km, temperatures in °C. Only the renderer formats them, so a
 * number is never typed into a spec.
 */

/** How a value reads. Every duration is in seconds; every share or change is a fraction. */
export type Fmt =
  | 'hm' //        12345 s → "3:25"
  | 'hms' //       12345 s → "3:25:45"
  | 'ms' //        162 s → "2:42"
  | 'delta' //     signed seconds → "+2:42", "−0:45"
  | 'mins' //      seconds → "12 min"
  | 'dmins' //     signed seconds → "+12 min"
  | 'share' //     0.473 → "47%"
  | 'share1' //    0.473 → "47.3%"
  | 'dpct' //      signed change 0.032 → "+3%"
  | 'dpct1' //     signed change 0.032 → "+3.2%"
  | 'count' //     15856 → "15,856"
  | 'ratio' //     1.73 → "1.7×"
  | 'ratio2' //    1.734 → "1.73×"
  | 'int' //       42 → "42"
  | 'num1' //      0.83 → "0.8"
  | 'num2' //      0.834 → "0.83"
  | 'year' //      2019 → "2019"
  | 'yy' //        2019 → "’19"
  | 'pace' //      s/km, the reader's units
  | 'temp' //      °C, the reader's units
  | 'dtemp'; //    a °C gap, the reader's units

export type Tone = 'signal' | 'ink' | 'ink2' | 'quiet' | 'faint' | 'o1' | 'o2' | 'o3' | 'o4';

export type Axis = {
  min: number;
  max: number;
  /** Tick values; the renderer picks round ones when absent. */
  ticks?: number[];
  fmt: Fmt;
  title?: string;
  /** Categorical labels for integer positions 0…n−1 (mats, years, age groups); replaces `fmt` for the ticks. */
  cats?: string[];
  /** Draw the axis from max (top/left) to min. */
  invert?: boolean;
  /** Gridlines at the ticks (default true on the value axis). */
  grid?: boolean;
};

/** A note in data coordinates: `{v}` in `text` is `value` in `fmt`. */
export type Note = {
  x?: number;
  y?: number;
  /** A row form's row (index), in place of y. */
  row?: number;
  text: string;
  value?: number;
  fmt?: Fmt;
  tone?: 'signal' | 'ink' | 'quiet';
  anchor?: 'start' | 'middle' | 'end';
  /** Offset of the text from the point, px. */
  dx?: number;
  dy?: number;
  /** Draw a leader from the text to the point. */
  leader?: boolean;
};

export type Ref = { axis: 'x' | 'y'; value: number; label?: string; tone?: 'signal' | 'ink' | 'quiet' };
export type Band = { axis: 'x' | 'y'; from: number; to: number; label?: string; tone?: 'signal' | 'quiet' };
export type KeyItem = { label: string; tone: Tone; mark: 'dot' | 'line' | 'dash' | 'square' | 'ring' | 'band' };

type Common = {
  /** Plot height, units (the canvas is 340 wide); forms with rows size themselves. */
  height?: number;
  notes?: Note[];
  key?: KeyItem[];
};

export type Row = { label: string; tone?: Tone };

export type BarsSpec = Common & {
  form: 'bars';
  rows: (Row & { value: number; note?: string })[];
  x: Axis;
  fmt: Fmt;
  /** Bars grow left or right from zero. */
  diverging?: boolean;
  ref?: Ref;
};

export type DumbbellSpec = Common & {
  form: 'dumbbell';
  rows: (Row & { a: number; b: number })[];
  x: Axis;
  fmt: Fmt;
  a: string;
  b: string;
  /** An arrowhead from a to b (a change) instead of two dots (a gap). */
  arrow?: boolean;
  /** Print b − a at the right of each row in this format. */
  gap?: Fmt;
};

export type RangeSpec = Common & {
  form: 'range';
  rows: (Row & { lo: number; q1?: number; mid: number; q3?: number; hi: number })[];
  x: Axis;
  fmt: Fmt;
  /** Names of the ends and the middle, for the key ("10th", "Median", "90th percentile"). */
  legend: { lo: string; mid: string; hi: string; box?: string };
};

export type ColumnsSpec = Common & {
  form: 'columns';
  cols: (Row & { value: number })[];
  y: Axis;
  fmt: Fmt;
  /** Which columns print their value: every one, the toned ones (default) or none. */
  values?: 'all' | 'toned' | 'none';
  ref?: Ref;
};

export type HistogramSpec = Common & {
  form: 'histogram';
  /** `v` is the bar height (a share or a count of finishes); never `n`. */
  bins: { x0: number; x1: number; v: number; tone?: Tone }[];
  x: Axis;
  y: Axis;
  /** A comparison curve over the bars (a smooth expectation, another group). */
  overlay?: { points: [number, number][]; label?: string; tone?: Tone };
  bands?: Band[];
  refs?: Ref[];
};

export type Series = {
  label: string;
  points: [number, number][];
  tone: Tone;
  dash?: boolean;
  width?: number;
  /** Fill down to the x axis. */
  area?: boolean;
  /** Where the direct label goes (default end). */
  labelAt?: 'end' | 'start' | 'none';
  dots?: boolean;
};

export type LinesSpec = Common & {
  form: 'lines';
  series: Series[];
  x: Axis;
  y: Axis;
  bands?: Band[];
  refs?: Ref[];
};

export type SlopeSpec = Common & {
  form: 'slope';
  rows: (Row & { a: number; b: number })[];
  left: string;
  right: string;
  fmt: Fmt;
  y?: Axis;
};

export type ScatterSpec = Common & {
  form: 'scatter';
  points: { x: number; y: number; tone?: Tone; label?: string; r?: number }[];
  x: Axis;
  y: Axis;
  fit?: { x0: number; y0: number; x1: number; y1: number; label?: string };
  refs?: Ref[];
};

export type HeatmapSpec = Common & {
  form: 'heatmap';
  rows: string[];
  cols: string[];
  /** cells[row][col]; null is an empty cell (under 100 finishes). */
  cells: (number | null)[][];
  fmt: Fmt;
  domain: [number, number];
  /** [row, col] cells drawn in the signal ring. */
  highlight?: [number, number][];
  rowTitle?: string;
  colTitle?: string;
  values?: boolean;
};

export type StackedSpec = Common & {
  form: 'stacked';
  rows: (Row & { parts: number[] })[];
  parts: { label: string; tone: Tone }[];
  fmt: Fmt;
};

export type WaffleSpec = Common & {
  form: 'waffle';
  /** Shares lit in order, each in its tone; the rest of the 100 squares stay unlit. */
  parts: { share: number; tone: Tone; label: string }[];
  rest?: string;
};

export type BigSpec = Common & {
  form: 'big';
  value: number;
  fmt: Fmt;
  /** A line under the figure ("more finishes at 3:59 than at 4:00"). */
  caption: string;
  /** Bars under the figure, each with its value. */
  compare?: { label: string; value: number; tone: Tone }[];
  compareFmt?: Fmt;
};

export type FlowSpec = Common & {
  form: 'flow';
  left: string[];
  right: string[];
  /** flows[i][j]: the share of all finishes from left i to right j. */
  flows: number[][];
  leftTitle: string;
  rightTitle: string;
  highlight?: [number, number][];
};

export type StripSpec = Common & {
  form: 'strip';
  groups: { label: string; dots: { v: number; tone?: Tone; label?: string }[] }[];
  x: Axis;
  /** Dot radius, units. */
  r?: number;
  refs?: Ref[];
};

export type MultiplesSpec = Common & {
  form: 'multiples';
  panels: { label: string; series: { points: [number, number][]; tone: Tone; dash?: boolean }[]; tone?: Tone }[];
  x: Axis;
  y: Axis;
  cols: number;
  refs?: Ref[];
};

export type PyramidSpec = Common & {
  form: 'pyramid';
  rows: { label: string; left: number; right: number; tone?: Tone }[];
  left: string;
  right: string;
  fmt: Fmt;
  max: number;
};

export type RidgelineSpec = Common & {
  form: 'ridgeline';
  rows: (Row & { points: [number, number][] })[];
  x: Axis;
  /** How far a peak rises over the rows above it, in row heights (default 1.6). */
  overlap?: number;
  refs?: Ref[];
};

export type ChartSpec =
  | BarsSpec | DumbbellSpec | RangeSpec | ColumnsSpec | HistogramSpec | LinesSpec | SlopeSpec | ScatterSpec
  | HeatmapSpec | StackedSpec | WaffleSpec | BigSpec | FlowSpec | StripSpec | MultiplesSpec | PyramidSpec
  | RidgelineSpec;

export type Form = ChartSpec['form'];

export const FORMS: readonly Form[] = [
  'bars', 'dumbbell', 'range', 'columns', 'histogram', 'lines', 'slope', 'scatter', 'heatmap', 'stacked', 'waffle',
  'big', 'flow', 'strip', 'multiples', 'pyramid', 'ridgeline',
];

/** Formats whose text depends on the reader's units: a spec using one is drawn twice. */
export const UNIT_FMTS: readonly Fmt[] = ['pace', 'temp', 'dtemp'];
