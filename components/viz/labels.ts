/**
 * Direct labels without collisions (the redesign spec, section 3.5, Annotation). Charts are drawn once on the server and
 * stretch to any width, so labels are placed for the narrowest phone plot (`REF_WIDTH`, a 320 px screen less its
 * gutters): horizontal gaps only grow on wider screens while text keeps its size, so a placement that is clear there is
 * clear everywhere wider. Below it (200% zoom), each label carries the narrowest width it still fits as a class
 * (`w240` … `w320`), and a container query hides it there; it stays in the Values table.
 *
 * placeLabels: highest priority first, each label tries above, then below, then the clear side, nudged in 4 px steps;
 * a label that fits nowhere is dropped. A label never overlaps another label or a mark it is told to avoid, and never
 * leaves the plot.
 */

export const REF_WIDTH = 288;
/** The widths below the reference where a label may stop fitting, narrowest first (classes w240, w288). */
export const WIDTH_STEPS = [160, 200, 240] as const;

/** Approximate advance widths of Inter at 1 em, by character class; deliberately generous. */
export function textWidth(text: string, size = 14, weight = 600): number {
  let em = 0;
  for (const ch of text) {
    if (ch === ' ') em += 0.28;
    else if (/[0-9]/.test(ch)) em += 0.62;
    else if (/[.,:;'’|!]/.test(ch)) em += 0.3;
    else if (/[–—−×%+]/.test(ch)) em += 0.66;
    else if (/[A-Z]/.test(ch)) em += 0.7;
    else if (/[mwMW]/.test(ch)) em += 0.86;
    else if (/[ijlft]/.test(ch)) em += 0.34;
    else em += 0.57;
  }
  return em * size * (weight >= 600 ? 1.04 : 1);
}

export type LabelItem = {
  id: string;
  text: string;
  /** The anchor point, as plot fractions (y from the top). */
  x: number;
  y: number;
  /** Higher is placed first: the subject and the finding before extremes, extremes before context. */
  priority: number;
  size?: number;
  /**
   * Where to try first. `above-left` puts the text above the point and ending at it, first: on a rising curve that
   * place stays clear of the line at every plot width (the line left of the point is lower, and it climbs away to the
   * right), where a label beside the point, clear on a phone, can meet the flatter line of a wide screen.
   */
  prefer?: 'above' | 'below' | 'right' | 'left' | 'above-left';
  /** Gap between the point and the text, px. */
  gap?: number;
  tone?: 'ink' | 'signal' | 'quiet';
  /** The label sits on a reference line, which breaks under it: a wide halo of the surface knocks the line out. */
  knockout?: boolean;
  /**
   * The scrubber point this label names: while the needle sits on it the label hides (the readout says it), through
   * `data-scrub-i` and the Scrubber's is-under class. `under` marks the one the chart opens on, for the first paint.
   */
  at?: number;
  under?: boolean;
  /**
   * Only above the point, and over it (the text spans the point's x): for a label lifted on a leader, which must sit
   * where its leader meets it, never beside an empty spot.
   */
  only?: 'above';
};

export type PlacedLabel = LabelItem & {
  anchor: 'start' | 'middle' | 'end';
  /** Offsets from the anchor point, px. */
  dx: number;
  dy: number;
  /** The narrowest plot width it fits (0 = always shown); null when dropped. */
  minWidth: number | null;
};

export type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box, pad = 2) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

function boxAt(l: LabelItem, anchor: PlacedLabel['anchor'], dx: number, dy: number, width: number, height: number): Box {
  const size = l.size ?? 14;
  const w = textWidth(l.text, size);
  const ax = l.x * width + dx;
  const x0 = anchor === 'middle' ? ax - w / 2 : anchor === 'end' ? ax - w : ax;
  const base = l.y * height + dy;
  return { x0, x1: x0 + w, y0: base - size * 0.78, y1: base + size * 0.22 };
}

const inside = (b: Box, width: number, height: number) => b.x0 >= 0 && b.x1 <= width && b.y0 >= 0 && b.y1 <= height;

/** Candidate placements, in order of preference. */
function candidates(l: LabelItem): { anchor: PlacedLabel['anchor']; dx: number; dy: number }[] {
  const size = l.size ?? 14;
  const gap = l.gap ?? 8;
  const above = -gap, below = gap + size * 0.78;
  const nudges = [0, 4, -4, 8, -8, 12, -12, 16, -16];
  const vertical = (dy: number) => (['middle', 'start', 'end'] as const).flatMap((anchor) => nudges.map((n) => ({ anchor, dx: n + (anchor === 'start' ? -4 : anchor === 'end' ? 4 : 0), dy })));
  const side = (dir: 1 | -1) => [0, -6, 6, -12, 12].map((n) => ({ anchor: dir > 0 ? ('start' as const) : ('end' as const), dx: dir * gap, dy: size * 0.35 + n }));
  const aboveLeft = [0, -4, -8, -12, -16].map((n) => ({ anchor: 'end' as const, dx: 4 + n, dy: above }));
  const order = { above: [vertical(above), vertical(below), side(1), side(-1)], below: [vertical(below), vertical(above), side(1), side(-1)], right: [side(1), side(-1), vertical(above), vertical(below)], left: [side(-1), side(1), vertical(above), vertical(below)],
    'above-left': [aboveLeft, side(-1), vertical(above), vertical(below), side(1)] };
  if (l.only === 'above') {
    const w = textWidth(l.text, size);
    return vertical(above).filter((c) => {
      const x0 = c.anchor === 'middle' ? c.dx - w / 2 : c.anchor === 'end' ? c.dx - w : c.dx;
      return x0 <= -4 && x0 + w >= 4;
    });
  }
  return order[l.prefer ?? 'above'].flat();
}

/**
 * Places labels greedily at the reference width and records the narrowest width each still fits. `avoid` lists marks
 * (fractions, with a radius in px) that labels must not cover.
 */
export function placeLabels(items: LabelItem[], bounds: { height: number; width?: number; avoid?: { x: number; y: number; r: number }[]; boxes?: { x0: number; x1: number; y0: number; y1: number; pad?: number }[] }): PlacedLabel[] {
  const width = bounds.width ?? REF_WIDTH;
  const { height } = bounds;
  // Marks to keep clear of: dots (a centre and a radius in px) and boxes (bars and stems, in plot fractions).
  const marks: Box[] = [
    ...(bounds.avoid ?? []).map((m) => ({ x0: m.x * width - m.r, x1: m.x * width + m.r, y0: m.y * height - m.r, y1: m.y * height + m.r })),
    ...(bounds.boxes ?? []).map((b) => ({ x0: b.x0 * width - (b.pad ?? 1), x1: b.x1 * width + (b.pad ?? 1), y0: b.y0 * height, y1: b.y1 * height })),
  ];
  const placed: (PlacedLabel & { box: Box })[] = [];
  const order = [...items].sort((a, b) => b.priority - a.priority);
  for (const l of order) {
    let chosen: (PlacedLabel & { box: Box }) | null = null;
    for (const c of candidates(l)) {
      const box = boxAt(l, c.anchor, c.dx, c.dy, width, height);
      if (!inside(box, width, height)) continue;
      if (placed.some((p) => p.minWidth !== null && overlaps(box, p.box))) continue;
      if (marks.some((m) => overlaps(box, m, 0))) continue;
      chosen = { ...l, ...c, minWidth: 0, box };
      break;
    }
    placed.push(chosen ?? { ...l, anchor: 'middle', dx: 0, dy: 0, minWidth: null, box: { x0: 0, x1: 0, y0: 0, y1: 0 } });
  }
  // The narrowest width at which each kept label is still clear of every higher-priority kept label and the plot edges.
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    if (p.minWidth === null) continue;
    let min = 0;
    for (const w of WIDTH_STEPS) {
      const box = boxAt(p, p.anchor, p.dx, p.dy, w, height);
      const clash = !inside(box, w, height) || placed.slice(0, i).some((q) => q.minWidth !== null && q.minWidth <= w && overlaps(box, boxAt(q, q.anchor, q.dx, q.dy, w, height)));
      if (clash) min = WIDTH_STEPS.find((s) => s > w) ?? width;
    }
    p.minWidth = min;
  }
  const byId = new Map(placed.map((p) => [p.id, p]));
  return items.map((l) => {
    const { box: _box, ...rest } = byId.get(l.id)!;
    return rest;
  });
}

/** A placed label's text box at the reference width, in plot fractions (for a second placement pass to keep clear of). */
export function placedBox(l: PlacedLabel, height: number, pad = 2): { x0: number; x1: number; y0: number; y1: number; pad: number } {
  const b = boxAt(l, l.anchor, l.dx, l.dy, REF_WIDTH, height);
  return { x0: (b.x0 - pad) / REF_WIDTH, x1: (b.x1 + pad) / REF_WIDTH, y0: (b.y0 - pad) / height, y1: (b.y1 + pad) / height, pad: 0 };
}

/**
 * Raises each placed label's narrowest width past the widths where it would meet a fixed box (`at(width)`, in px at
 * that plot width), for a mark drawn outside placeLabels whose text keeps its px offset while the labels move with the
 * plot (LineProfile's bracket label at the plot's edge). Below that width the label hides; the Values table keeps it.
 */
export function keepClearOf(placed: PlacedLabel[], at: (width: number) => Box, height: number) {
  for (const p of placed) {
    if (p.minWidth === null) continue;
    for (const w of WIDTH_STEPS) {
      if (w >= p.minWidth && overlaps(boxAt(p, p.anchor, p.dx, p.dy, w, height), at(w))) p.minWidth = Math.max(p.minWidth, WIDTH_STEPS.find((s) => s > w) ?? REF_WIDTH);
    }
  }
}

/** The class that hides a label or tick below its narrowest width ('' when it always shows). */
export function widthClass(minWidth: number | null): string {
  return minWidth ? `w${minWidth}` : '';
}

/** Container widths a width class can name (chart-frame.css hides `wN` below N px). */
export const FIT_STEPS = [160, 200, 240, 288, 320, 360, 420, 480, 600, 720] as const;

/** The width class for something that needs `width` px of plot to fit: the smallest step at or above it. */
export function fitClass(width: number): string {
  if (width <= FIT_STEPS[0] - 1) return '';
  const step = FIT_STEPS.find((s) => s >= width);
  return step ? `w${step}` : 'w-never';
}

/** `group`: ticks that show and hide together (the quarter hours between half hours), so the steps stay even. `from`:
 *  a figure width (one of FIT_STEPS) below which the tick hides even where it would fit. `turn`: a tick centred at the
 *  reference width that, below it, turns to start (or end) at the plot's edge rather than hiding where centred it would
 *  run past the edge (a first tick a little in from the edge, on a phone at 200% zoom). `markGroup`: the group whose
 *  ticks this tick's mark shows and hides with, while its label keeps its own width (a quarter that gives way to the
 *  end label keeps its mark among the other quarters). */
export type Tick = { x: number; label: string; priority?: number; group?: string; from?: number; turn?: 'start' | 'end'; markGroup?: string };
/** `turned`: the anchor below the reference width (Axis gives it a class a container query applies). `markWidth`: the
 *  narrowest width of the tick's mark, where it differs from its label's (`markGroup`). */
export type LaidTick = Tick & { anchor: 'start' | 'middle' | 'end'; minWidth: number | null; turned?: 'start' | 'end'; markWidth?: number | null };

/**
 * Axis ticks: each keeps its label clear of higher-priority ticks (the ends and the marks named first) and inside the
 * axis; the anchor turns to start or end near an edge. A tick that cannot fit even at the reference width is dropped
 * (minWidth null); one that stops fitting below it carries its width class. `gap` is the clear space kept between two
 * labels, in px of the generous width estimate (6 by default).
 */
export function layoutTicks(ticks: Tick[], size = 12, ref = REF_WIDTH, centred = false, gap = 6): LaidTick[] {
  // Centred ticks (years under stems, where a label slid off its tick reads as the next year's) never turn at an edge:
  // one that does not fit centred hides below the width it fits.
  const anchorOf = (t: Tick): LaidTick['anchor'] => {
    if (centred) return 'middle';
    const half = textWidth(t.label, size, 500) / 2;
    return t.x * ref < half ? 'start' : (1 - t.x) * ref < half ? 'end' : 'middle';
  };
  const box = (t: Tick, anchor: LaidTick['anchor'], w: number): Box => {
    const tw = textWidth(t.label, size, 500);
    const ax = t.x * w;
    const x0 = anchor === 'middle' ? ax - tw / 2 : anchor === 'end' ? ax - tw : ax;
    // An end-anchored tick ends exactly at its x: summing x0 + tw back can land a hair past the edge in floating point,
    // which hid a tick at the right end (a dumbbell's 40%) below 600 px.
    return { x0, x1: anchor === 'end' ? ax : x0 + tw, y0: 0, y1: size };
  };
  const order = ticks.map((t, i) => ({ t, i, p: t.priority ?? (i === 0 || i === ticks.length - 1 ? 2 : 1) })).sort((a, b) => b.p - a.p || a.t.x - b.t.x);
  // Each tick, highest priority first, takes the narrowest width from which it is clear at every wider width, of the
  // edges and of every tick already shown there: so a tick that shows from some width shows at all widths above it.
  // Widths are the figure's; an axis narrower than its figure (`ref` below the reference) scales them down.
  const scale = ref / REF_WIDTH;
  const widths = [...new Set<number>([...WIDTH_STEPS, REF_WIDTH, ...FIT_STEPS])].sort((a, b) => a - b);
  type Kept = { i: number; t: Tick; anchor: LaidTick['anchor']; turned?: 'start' | 'end'; at: (fw: number) => LaidTick['anchor']; min: number | null };
  const kept: Kept[] = [];
  for (const { t, i } of order) {
    const anchor = anchorOf(t);
    // A turning tick is placed with its turned anchor below the reference figure width, where chart-frame.css turns it.
    const turned = !centred && t.turn && anchor === 'middle' ? t.turn : undefined;
    const at = (fw: number) => (turned && fw < REF_WIDTH ? turned : anchor);
    const clash = (fw: number) => { const w = fw * scale; const b = box(t, at(fw), w); return !inside(b, w, size) || kept.some((k) => k.min !== null && k.min <= fw && overlaps(b, box(k.t, k.at(fw), w), gap)); };
    let min: number | null = null;
    for (let s = 0; s < widths.length; s++) {
      if (widths.slice(s).every((w) => !clash(w))) { min = s === 0 ? 0 : widths[s]; break; }
    }
    kept.push({ i, t, anchor, turned, at, min });
  }
  // A group shows from the widest of its members' widths (and not at all if one never fits), so no step goes missing
  // alone. Ticks outside the group were placed clear of every member at its own width, so they stay clear.
  const groupMin = (g: string) => {
    const mins = kept.filter((k) => k.t.group === g).map((k) => k.min);
    return mins.some((m) => m === null) ? null : Math.max(...(mins as number[]));
  };
  return ticks.map((t, i) => {
    const k = kept.find((x) => x.i === i)!;
    const own = t.group ? groupMin(t.group) : k.min;
    const min = own === null || !t.from ? own : Math.max(own, t.from);
    // A mark that follows a group shows from the group's width; its label never shows before its mark.
    const mark = t.markGroup ? groupMin(t.markGroup) : undefined;
    const label = mark === undefined || min === null ? min : mark === null ? null : Math.max(min, mark);
    return { ...t, anchor: k.anchor, ...(k.turned ? { turned: k.turned } : {}), minWidth: label, ...(mark !== undefined ? { markWidth: mark } : {}) };
  });
}
