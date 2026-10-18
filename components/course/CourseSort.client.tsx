'use client';

import { useState, type ReactNode } from 'react';
import Chips from '@/components/ui/Chips.client';

/**
 * The /courses list's sort (the redesign spec, section 7.10): chips for the orders the server worked out, and the rows
 * (server markup) placed in the chosen order. The list carries the order's name, so each row shows the figure the
 * order is by. The `foot` rows (courses with fewer than three editions) are left out of the range the reading gives, so
 * under that order (`footSort`) they follow under their own hairline and title; under every other order (a climb or a
 * finish count has nothing to do with editions) they stand in their sorted place, drawn quieter. Data sorts only:
 * nothing here ranks a course.
 */
export type SortKey = 'slowdown' | 'climb' | 'finishes' | 'temp' | 'az';

export default function CourseSort({ options, orders, rows, initial = 'slowdown', foot = [], footTitle, footSort = 'slowdown' }: {
  options: { value: SortKey; label: string }[];
  orders: Record<SortKey, string[]>;
  rows: { id: string; node: ReactNode }[];
  initial?: SortKey;
  foot?: string[];
  footTitle?: string;
  /** The order under which the foot rows follow apart. */
  footSort?: SortKey;
}) {
  const [sort, setSort] = useState<SortKey>(initial);
  const byId = new Map(rows.map((r) => [r.id, r.node]));
  const list = (ids: string[], className: string) => {
    // Rows per column at two and three columns, and the rows that open a column (they carry its top rule).
    const n = ids.length, r2 = Math.ceil(n / 2), r3 = Math.ceil(n / 3);
    return (
      <ol className={className} data-sort={sort} style={{ ['--rows-2' as string]: r2, ['--rows-3' as string]: r3 }}>
        {ids.map((id, i) => <li key={id} className={[i % r2 === 0 ? 'is-top-2' : '', i % r3 === 0 ? 'is-top-3' : '', foot.includes(id) ? 'is-few' : ''].filter(Boolean).join(' ') || undefined}>{byId.get(id)}</li>)}
      </ol>
    );
  };
  const apart = sort === footSort ? orders[sort].filter((id) => foot.includes(id)) : [];
  return (
    <div className="course-sort">
      <Chips label="Sort the courses" options={options} value={sort} onChange={(v) => setSort(v)} />
      {list(orders[sort].filter((id) => !apart.includes(id)), 'course-index')}
      {apart.length ? <><p className="course-index-foot">{footTitle}</p>{list(apart, 'course-index is-foot')}</> : null}
    </div>
  );
}
