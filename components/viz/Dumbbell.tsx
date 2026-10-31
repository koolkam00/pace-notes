import type { ReactNode } from 'react';
import Axis from './Axis';
import { extent, linear, pc } from './scale';

/**
 * A dumbbell list (the redesign spec, section 3.6): one 44 px row per group, the label on the left, a hollow mark for
 * the typical or other value and a filled one for the observed or subject value, joined by a line; the gap is signal
 * only on the row the sentence is about. Each row shows its values, so nothing hides behind a tap.
 */
export type DumbbellRow = { id: string; label: string; a: number; b: number; display: string; highlight?: boolean;
  /** A quiet second line under the label, saying what the row pools ("6 years"). */
  note?: string };

export default function Dumbbell({ rows, domain, ticks, label, keyLabels, values, bare = false, keyFirst = false }: {
  rows: DumbbellRow[]; domain?: [number, number]; ticks: { value: number; label: string }[]; label: string;
  /** What the hollow and the filled marks are ("Typical", "Observed"). */
  keyLabels: { a: string; b: string }; values?: ReactNode;
  /** No value column: the label takes its own width and the track the rest, for small gaps (Values holds the numbers). */
  bare?: boolean;
  /** The key above the rows, in the order each row prints its two values, for a list whose rows say "a · b" (the
   *  reader needs the order before the first row, not after the last). */
  keyFirst?: boolean;
}) {
  const x = linear(domain ?? extent(rows.flatMap((r) => [r.a, r.b])));
  const key = (
    <ul className={`viz-key${keyFirst ? ' is-first' : ''}`} aria-hidden="true">
      <li><i className="viz-key-mark is-hollow" />{keyLabels.a}</li>
      <li><i className="viz-key-mark" />{keyLabels.b}</li>
    </ul>
  );
  return (
    <figure className={`viz viz-frame dumbbell${bare ? ' is-bare' : ''}`}>
      {keyFirst ? key : null}
      <ul className="dumbbell-rows" role="img" aria-label={label}>
        {rows.map((r) => {
          const xa = x(r.a), xb = x(r.b);
          return (
            <li key={r.id} className={r.highlight ? 'is-highlight' : undefined}>
              <span className="dumbbell-label">{r.label}{r.note ? <span className="dumbbell-note">{r.note}</span> : null}</span>
              <svg className="dumbbell-track" width="100%" height="44" aria-hidden="true">
                <rect className="grid-line" x="0" y="22" width="100%" height="1" transform="translate(0 -0.5)" />
                <rect className={r.highlight ? 'dumbbell-gap is-signal' : 'dumbbell-gap'} x={pc(Math.min(xa, xb))} y="21" width={pc(Math.abs(xb - xa))} height="2" />
                <circle className="m-hollow" cx={pc(xa)} cy="22" r="5" />
                <circle className={r.highlight ? 'm-signal' : 'm-ink'} cx={pc(xb)} cy="22" r="5.5" />
              </svg>
              {bare ? null : <span className="dumbbell-value">{r.display}</span>}
            </li>
          );
        })}
      </ul>
      <div className="dumbbell-axis"><span /><Axis ticks={ticks.map((t) => ({ x: x(t.value), label: t.label }))} refWidth={bare ? 240 : 150} />{bare ? null : <span />}</div>
      {keyFirst ? null : key}
      {values}
    </figure>
  );
}
