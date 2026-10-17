import type { ReactNode } from 'react';
import Axis from './Axis';
import { extent, linear, pc } from './scale';

/**
 * A dumbbell list (the redesign spec, section 3.6): one 44 px row per group, the label on the left, a hollow mark for
 * the typical or other value and a filled one for the observed or subject value, joined by a line; the gap is signal
 * only on the row the sentence is about. Each row shows its values, so nothing hides behind a tap.
 */
export type DumbbellRow = { id: string; label: string; a: number; b: number; display: string; highlight?: boolean };

export default function Dumbbell({ rows, domain, ticks, label, keyLabels, values }: {
  rows: DumbbellRow[]; domain?: [number, number]; ticks: { value: number; label: string }[]; label: string;
  /** What the hollow and the filled marks are ("Typical", "Observed"). */
  keyLabels: { a: string; b: string }; values?: ReactNode;
}) {
  const x = linear(domain ?? extent(rows.flatMap((r) => [r.a, r.b])));
  return (
    <figure className="viz viz-frame dumbbell">
      <ul className="dumbbell-rows" role="img" aria-label={label}>
        {rows.map((r) => {
          const xa = x(r.a), xb = x(r.b);
          return (
            <li key={r.id} className={r.highlight ? 'is-highlight' : undefined}>
              <span className="dumbbell-label">{r.label}</span>
              <svg className="dumbbell-track" width="100%" height="44" aria-hidden="true">
                <rect className="grid-line" x="0" y="22" width="100%" height="1" transform="translate(0 -0.5)" />
                <rect className={r.highlight ? 'dumbbell-gap is-signal' : 'dumbbell-gap'} x={pc(Math.min(xa, xb))} y="21" width={pc(Math.abs(xb - xa))} height="2" />
                <circle className="m-hollow" cx={pc(xa)} cy="22" r="5" />
                <circle className={r.highlight ? 'm-signal' : 'm-ink'} cx={pc(xb)} cy="22" r="5.5" />
              </svg>
              <span className="dumbbell-value">{r.display}</span>
            </li>
          );
        })}
      </ul>
      <div className="dumbbell-axis"><span /><Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} refWidth={150} /><span /></div>
      <ul className="viz-key" aria-hidden="true">
        <li><i className="viz-key-mark is-hollow" />{keyLabels.a}</li>
        <li><i className="viz-key-mark" />{keyLabels.b}</li>
      </ul>
      {values}
    </figure>
  );
}
