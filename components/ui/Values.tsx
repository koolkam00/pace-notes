import { Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import Arrow from './Arrow';
import ScrollCue from './ScrollCue.client';
import { UnitLink as Link } from '@/components/UnitsProvider';

/**
 * The page's one deep link to its methods, at the foot of its numbers (round 6: a "How we know" in the closing row and the
 * footer's were two paths to /methodology on one phone screen): the method sits with the figures it explains.
 */
export function HowLink({ href }: { href: string }) {
  return <p className="values-how"><Link href={href} className="values-how-link">How these were measured<Arrow /></Link></p>;
}

/**
 * Values: a chart's table twin, in a disclosure (spec section 3.5). The summary reads "All numbers" and the row count,
 * the one name every table fold on the site carries (a page's foot gathers its tables under the same name, AllNumbers);
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
  /** One table of a page's "All numbers" (AllNumbers): its caption and table without a disclosure of its own. */
  bare?: boolean;
  /** The page's /methodology anchor, linked at the foot of the open fold ("How these were measured"). */
  how?: string;
  children?: ReactNode;
  className?: string;
};

export default function Values({ id, caption, columns, rows, reading, count, open = false, bare = false, how, children, className }: Props) {
  const n = count ?? rows?.length;
  const captionId = `${id}-caption`;
  const body = (
    <>
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
    </>
  );
  if (bare) return <section className={`values-table${className ? ` ${className}` : ''}`} id={id}>{body}</section>;
  return (
    <details className={`values${className ? ` ${className}` : ''}`} id={id} open={open || undefined}>
      <summary>
        <span>All numbers{typeof n === 'number' ? <span className="values-count">{n.toLocaleString('en-US')} {n === 1 ? 'row' : 'rows'}</span> : null}</span>
        <span className="values-glyph" aria-hidden="true" />
      </summary>
      <div className="values-body">{body}{how ? <HowLink href={how} /> : null}</div>
    </details>
  );
}

/**
 * "All numbers" (the redesign spec, section 00, cut 7, the course pages' pattern): a page's tables in one disclosure at
 * its foot, each with its caption, instead of a Values row under every chart. Pass the tables as `<Values bare …/>`
 * (or a ByUnits pair of them); empty entries are skipped and nothing renders without a table.
 */
export function AllNumbers({ tables, id = 'all-numbers', className, how }: { tables: ReactNode[]; id?: string; className?: string; how?: string }) {
  const list = tables.filter(Boolean);
  if (!list.length) return null;
  return (
    <details className={`values all-numbers${className ? ` ${className}` : ''}`} id={id}>
      <summary>
        <span>All numbers<span className="values-count">{list.length} {list.length === 1 ? 'table' : 'tables'}</span></span>
        <span className="values-glyph" aria-hidden="true" />
      </summary>
      <div className="values-body all-numbers-body">{list.map((t, i) => <Fragment key={i}>{t}</Fragment>)}{how ? <HowLink href={how} /> : null}</div>
    </details>
  );
}

/**
 * A Values element with the page's methods link at the foot of its fold (`how`); anything else is returned as it is. For
 * a table built elsewhere (an explorer's parts, a chart's frame) that becomes the page's "All numbers": every page with
 * one carries its methods there, and its closing row is the way back alone (release, October 20, 2026).
 */
export function withHow(node: ReactNode, how: string | null | undefined): ReactNode {
  return how && isValidElement(node) && node.type === Values ? cloneElement(node as ReactElement<Props>, { how }) : node;
}
