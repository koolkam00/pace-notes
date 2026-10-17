'use client';

import { useState, type ReactNode } from 'react';
import Chips from '@/components/ui/Chips.client';

/**
 * The /courses list's sort (the redesign spec, section 7.10): chips for the orders the server worked out, and the rows
 * (server markup) placed in the chosen order. The list carries the order's name, so each row shows the figure the
 * order is by. Data sorts only: nothing here ranks a course.
 */
export type SortKey = 'slowdown' | 'climb' | 'finishes' | 'temp' | 'az';

export default function CourseSort({ options, orders, rows, initial = 'slowdown' }: {
  options: { value: SortKey; label: string }[];
  orders: Record<SortKey, string[]>;
  rows: { id: string; node: ReactNode }[];
  initial?: SortKey;
}) {
  const [sort, setSort] = useState<SortKey>(initial);
  const byId = new Map(rows.map((r) => [r.id, r.node]));
  return (
    <div className="course-sort">
      <Chips label="Sort the courses" options={options} value={sort} onChange={(v) => setSort(v)} />
      <ol className="course-index" data-sort={sort}>
        {orders[sort].map((id) => <li key={id}>{byId.get(id)}</li>)}
      </ol>
    </div>
  );
}
