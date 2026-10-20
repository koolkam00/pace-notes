/**
 * The reading figure (spec section 3.5): a value already formatted by lib/nuggets/format.ts, an optional unit suffix
 * (%, ×, min, ft) at 0.36 em in --ink-3, and a spoken twin. A fraction's words ("1" and "in 25") are part of the
 * figure: set at half size in the figure's own face and colour, so "1 in 25" never reads as "1". Bricolage with proportional figures; it never wraps.
 * `size="auto"` picks xl for 5 glyphs or fewer ("1.73×", "4:10", "30%"), l for 6 to 8 ("+5:00", "20% · 45%") and m beyond.
 * The visible figure is hidden from screen readers and the sr-only twin says it in full ("1.73 times").
 */
export type BigNumberSize = 'xl' | 'l' | 'm' | 's' | 'auto';
export type BigNumberTone = 'ink' | 'signal' | 'night' | 'quiet';

export function autoSize(value: string, unit = ''): Exclude<BigNumberSize, 'auto'> {
  const glyphs = Array.from(`${value}${unit}`.replace(/\s+/g, '')).length;
  return glyphs <= 5 ? 'xl' : glyphs <= 8 ? 'l' : 'm';
}

/** A % inside the value ("20% · 44%") takes the unit's small size too, so a pair reads like a single figure. */
function suffixed(value: string) {
  if (!value.includes('%')) return value;
  return value.split(/(%)/).map((part, i) => (part === '%' ? <span key={i} className="big-number-unit">%</span> : part));
}

export default function BigNumber({ value, unit, size = 'auto', tone = 'ink', sr, className }: {
  value: string; unit?: string; size?: BigNumberSize; tone?: BigNumberTone; sr: string; className?: string;
}) {
  const s = size === 'auto' ? autoSize(value, unit) : size;
  const cls = `big-number is-${s}${tone === 'ink' ? '' : ` is-${tone}`}${className ? ` ${className}` : ''}`;
  return (
    <span className={cls}>
      <span aria-hidden="true">{suffixed(value)}{unit ? <span className={`big-number-unit${/^\s*in\s/.test(unit) ? ' is-words' : ''}`}>{unit}</span> : null}</span>
      <span className="sr-only">{sr}</span>
    </span>
  );
}
