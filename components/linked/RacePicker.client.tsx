'use client';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * A race picker over server-drawn panels (the chapter "Over the years"): one labelled select, and the page's panels as
 * children, each a `[data-race]` element of which only the chosen one is shown. Without JavaScript the default race's
 * panel shows and the select is hidden (.js-only). A link may open it on a race (`?race=<label>`, a registry label, never
 * a typed value); a choice is not written back to the address and is not sent anywhere.
 */
export default function RacePicker({ options, initial, label, children }: {
  options: { value: string; label: string }[];
  initial: string;
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [race, setRace] = useState(initial);

  useEffect(() => {
    try {
      const asked = new URLSearchParams(window.location.search).get('race');
      if (asked && options.some((o) => o.value === asked)) setRace(asked);
    } catch { /* no address to read: keep the default */ }
  }, [options]);

  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>('[data-race]').forEach((panel) => { panel.hidden = panel.dataset.race !== race; });
  }, [race]);

  return (
    <div className="linked-picker" ref={root}>
      <div className="field linked-picker-field js-only">
        <label htmlFor={id} className="field-label">{label}</label>
        <select id={id} className="select" value={race} onChange={(e) => setRace(e.target.value)}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      {children}
    </div>
  );
}
