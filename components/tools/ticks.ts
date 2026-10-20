/** One label along a chart's distance axis, placed in pixels. */
export interface AxisTick { x: number; label: string; anchor: 'start' | 'middle' }

/**
 * Distance labels along a chart's foot: the first starts at its mark, the rest are centred on theirs, and any that would
 * touch the label before it or run past the chart's right edge is left out (a phone at 200% text keeps "Start" and
 * "20K"). Widths are estimated for 12 px sans text.
 */
export function fitTicks(ticks: { x: number; label: string }[], width: number, charW = 6.8, gap = 8): AxisTick[] {
  const out: AxisTick[] = [];
  let lastRight = -Infinity;
  ticks.forEach((t, i) => {
    const w = t.label.length * charW;
    const anchor = i === 0 ? 'start' : 'middle';
    const left = anchor === 'start' ? t.x : t.x - w / 2;
    if (left < lastRight + gap || left + w > width - 1) return;
    out.push({ x: t.x, label: t.label, anchor });
    lastRight = left + w;
  });
  return out;
}
