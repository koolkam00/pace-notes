'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Chips for more than 5 options, or a wrapping set (spec section 3.5): 44 px pills with aria-pressed in role="group".
 * A row that overflows scrolls sideways with snap and a 24 px fade on the side that has more (data-more); the
 * selected chip is scrolled into view inside the row only, never by scrolling the page. `wrap` lets the set wrap.
 */
export type ChipOption<T extends string = string> = { value: T; label: ReactNode; disabled?: boolean };

export default function Chips<T extends string = string>({ options, value, defaultValue, onChange, label, wrap = false, className }: {
  options: ChipOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  label: string;
  wrap?: boolean;
  className?: string;
}) {
  const [own, setOwn] = useState<T>(defaultValue ?? options[0]?.value);
  const current = value ?? own;
  const root = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = row.current, host = root.current;
    if (!el || !host || wrap) return;
    const update = () => {
      // The row's 3 px focus-ring padding can leave a snapped row at scrollLeft 3: still the start.
      const start = el.scrollLeft > 4;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      host.dataset.more = start && end ? 'both' : start ? 'start' : end ? 'end' : 'none';
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [wrap]);

  // Keep the selected chip in view inside the row (horizontal only).
  useEffect(() => {
    const el = row.current;
    const chip = el?.querySelector<HTMLElement>('.chip[aria-pressed="true"]');
    if (!el || !chip || wrap) return;
    const left = chip.offsetLeft, right = left + chip.offsetWidth;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.hasAttribute('data-motion-off');
    const behavior: ScrollBehavior = still ? 'auto' : 'smooth';
    // Out of view, the chip is brought to the middle of the row, so a neighbour peeks (faded) on either side: the cue
    // that the row scrolls both ways.
    if (left < el.scrollLeft + 24 || right > el.scrollLeft + el.clientWidth - 24) {
      el.scrollTo({ left: Math.max(0, Math.min(el.scrollWidth - el.clientWidth, left - (el.clientWidth - chip.offsetWidth) / 2)), behavior });
    }
  }, [current, wrap]);

  const pick = (next: T) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };

  return (
    <div ref={root} className={`chips${wrap ? ' is-wrap' : ''}${className ? ` ${className}` : ''}`}>
      <div ref={row} className="chips-row" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" className="chip" aria-pressed={o.value === current} disabled={o.disabled} aria-disabled={o.disabled || undefined} onClick={() => pick(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
