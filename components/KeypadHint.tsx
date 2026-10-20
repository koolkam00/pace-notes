'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * "Tap . for :" beside a clock-style time field, whose dot key types a colon (lib/keypad.ts). One rule everywhere (the
 * home goal set it first): the hint shows only on a touch screen and only while a field it belongs to has focus, that
 * is while the keypad is up, so no first screen carries it as stray punctuation. Its fields are the inputs of the
 * nearest container that holds one (a field's own box, or the split check's nine boxes, which share one hint).
 * Hidden from screen readers: a typed colon or dot both work, so there is nothing to announce, and the field's label is
 * unchanged. Inline (a span) at the end of a field's existing help text, kept on one line so the colon never wraps
 * alone; `block` as a help line of its own where a field has none.
 */
export default function KeypadHint({ block = false }: { block?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia?.('(pointer: coarse)').matches) return;
    let scope = el.parentElement;
    while (scope && !scope.querySelector('input')) scope = scope.parentElement;
    if (!scope) return;
    const area = scope;
    // focusout fires before the next element takes focus, so the check waits a frame: moving between the nine boxes
    // keeps the hint up.
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const active = document.activeElement;
        setOn(active instanceof HTMLInputElement && area.contains(active));
      });
    };
    area.addEventListener('focusin', update);
    area.addEventListener('focusout', update);
    update();
    return () => { cancelAnimationFrame(frame); area.removeEventListener('focusin', update); area.removeEventListener('focusout', update); };
  }, []);
  const text = <>Tap <kbd>.</kbd> for <kbd>:</kbd></>;
  const cls = `keypad-hint${block ? ' is-block' : ''}${on ? ' is-on' : ''}`;
  return block
    ? <p ref={ref as RefObject<HTMLParagraphElement>} className={cls} aria-hidden="true">{text}</p>
    : <>{' '}<span ref={ref as RefObject<HTMLSpanElement>} className={cls} aria-hidden="true">{text}</span></>;
}
