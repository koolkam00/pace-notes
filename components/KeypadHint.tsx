/**
 * "Tap . for :" beside a clock-style time field, whose dot key types a colon (lib/keypad.ts). Shown on touch screens only
 * (`.keypad-hint` in app/globals.css, by `pointer: coarse`), so it is there from the first paint and nothing moves. Hidden
 * from screen readers: a typed colon or dot both work, so there is nothing to announce, and the field's label is unchanged.
 * Inline (a span) at the end of a field's existing help text, kept on one line so the colon never wraps alone; `block` as
 * a help line of its own where a field has none.
 */
export default function KeypadHint({ block = false }: { block?: boolean }) {
  const text = <>Tap <kbd>.</kbd> for <kbd>:</kbd></>;
  return block
    ? <p className="keypad-hint is-block" aria-hidden="true">{text}</p>
    : <>{' '}<span className="keypad-hint" aria-hidden="true">{text}</span></>;
}
