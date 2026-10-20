'use client';

import { useState, type ReactNode } from 'react';
import Chips from '@/components/ui/Chips.client';

/**
 * The /courses list's sort (the redesign spec, section 7.10): chips for the orders the server worked out, the chosen
 * order's key (what the row's figure is, so a runner can read the list without guessing; critic round 4), and the rows
 * (server markup) placed in that order, reading across each row of columns. The list carries the order's name, so each
 * row shows the figure the order is by. The `foot` rows (courses with fewer than three editions) are left out of the
 * range the share's order gives, so under that order (`footSort`) they follow under their own hairline and title;
 * under every other order they stand in their sorted place, their share drawn quieter. Data sorts only: nothing here
 * ranks a course.
 */
export type SortKey = 'slowdown' | 'climb' | 'finishes' | 'temp' | 'az';

export default function CourseSort({ options, orders, rows, keys, initial = 'az', foot = [], footTitle, footSort = 'slowdown' }: {
  options: { value: SortKey; label: string }[];
  orders: Record<SortKey, string[]>;
  rows: { id: string; node: ReactNode }[];
  /** Each order's key: what the figure at the row's end is. */
  keys: Record<SortKey, ReactNode>;
  initial?: SortKey;
  foot?: string[];
  footTitle?: string;
  /** The order under which the foot rows follow apart. */
  footSort?: SortKey;
}) {
  const [sort, setSort] = useState<SortKey>(initial);
  const byId = new Map(rows.map((r) => [r.id, r.node]));
  const list = (ids: string[], className: string) => (
    <ol className={className} data-sort={sort}>
      {ids.map((id) => <li key={id} className={foot.includes(id) ? 'is-few' : undefined}>{byId.get(id)}</li>)}
    </ol>
  );
  const apart = sort === footSort ? orders[sort].filter((id) => foot.includes(id)) : [];
  return (
    <div className="course-sort">
      <Chips label="Sort the courses" options={options} value={sort} onChange={(v) => setSort(v)} />
      <p className="course-index-key" aria-live="polite">{keys[sort]}</p>
      {list(orders[sort].filter((id) => !apart.includes(id)), 'course-index')}
      {apart.length ? <><p className="course-index-foot">{footTitle}</p>{list(apart, 'course-index is-foot')}</> : null}
    </div>
  );
}
