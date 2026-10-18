import type { ReactNode } from 'react';
import Arrow from './Arrow';
import ScrollCue from './ScrollCue.client';

/**
 * Values: every chart's table twin, in a disclosure (spec section 3.5). The summary reads "Values" and the row count;
 * inside, a focusable scroll region labelled by the visible caption holds the table (first column sticky, tabular
 * figures, 44 px rows). When the table is wider than the column, the right edge fades (24 px) and a "Scroll" cue shows.
 * Order the columns key first, then the finding the page's sentence names, then supporting counts, so a narrow screen
 * cuts off the counts, never the finding.
 *
 * Pass `columns` and `rows` for a plain table, or `children` for a table of your own (CourseTable keeps its classes).
 * `reading` marks one row (its index) as the row the page's sentence is about.
 */
export type ValuesColumn = { key: string; label: string; text?: boolean };

type Props = {
  id: string;
  caption: ReactNode;
  columns?: ValuesColumn[];
  rows?: (string | number)[][];
  reading?: number;
  count?: number;
  open?: boolean;
  children?: ReactNode;
  className?: string;
};

export default function Values({ id, caption, columns, rows, reading, count, open = false, children, className }: Props) {
  const n = count ?? rows?.length;
  const captionId = `${id}-caption`;
  return (
    <details className={`values${className ? ` ${className}` : ''}`} id={id} open={open || undefined}>
      <summary>
        <span>Values{typeof n === 'number' ? <span className="values-count">{n.toLocaleString('en-US')} {n === 1 ? 'row' : 'rows'}</span> : null}</span>
        <span className="values-glyph" aria-hidden="true" />
      </summary>
      <div className="values-body">
        <p className="values-caption" id={captionId}>{caption}</p>
        <div className="values-scroll"><div className="table-wrap" role="region" tabIndex={0} aria-labelledby={captionId}>
          {children ?? (columns && rows ? (
            <table className="table">
              <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.text ? 'is-text' : undefined}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={i === reading ? 'is-reading' : undefined}>
                    {row.map((cell, k) => k === 0
                      ? <th key={k} scope="row">{cell}</th>
                      : <td key={k} className={columns[k]?.text ? 'is-text' : undefined}>{cell}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null)}
        </div></div>
        <span className="values-cue" aria-hidden="true">Scroll<Arrow /></span>
        <ScrollCue target={id} />
      </div>
    </details>
  );
}
