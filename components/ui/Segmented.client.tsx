'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A segmented control for 2 to 5 options (spec section 3.5): buttons in role="group" with aria-pressed (the pattern
 * the verifiers read), on a --paper-sunk track with a raised thumb that springs to the pressed option. Controlled with
 * `value` and `onChange`, or uncontrolled with `defaultValue`. Inside .night it takes the night look.
 */
export type SegmentedOption<T extends string = string> = { value: T; label: ReactNode; disabled?: boolean };

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function Segmented<T extends string = string>({ options, value, defaultValue, onChange, label, block = false, className }: {
  options: SegmentedOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  label: string;
  block?: boolean;
  className?: string;
}) {
  const [own, setOwn] = useState<T>(defaultValue ?? options[0]?.value);
  const current = value ?? own;
  const ref = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const root = ref.current;
    const pressed = root?.querySelector<HTMLButtonElement>('.seg-btn[aria-pressed="true"]');
    if (!root || !pressed) return;
    root.style.setProperty('--thumb-x', `${pressed.offsetLeft}px`);
    root.style.setProperty('--thumb-w', `${pressed.offsetWidth}px`);
    root.classList.add('is-ready');
  }, []);

  useIsoLayoutEffect(place, [current, place]);
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(place);
    ro.observe(root);
    return () => ro.disconnect();
  }, [place]);

  const pick = (next: T) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };

  return (
    <div ref={ref} className={`seg${block ? ' is-block' : ''}${className ? ` ${className}` : ''}`} role="group" aria-label={label}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.value} type="button" className="seg-btn" aria-pressed={o.value === current} disabled={o.disabled} aria-disabled={o.disabled || undefined} onClick={() => pick(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
