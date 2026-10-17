'use client';
import { useEffect, useState } from 'react';
import { isAnalysisGoal } from '@/lib/analysis-goal';
import { firstFiveAt } from '@/lib/fast-start';

/** The goal in the address (goal=240 or goal=4:00), whole minutes, else the 4:00 example. */
function goalOf(search: string): number {
  const raw = new URLSearchParams(search).get('goal') || '';
  const m = /^(?:(\d{1,2}):(\d\d)|(\d{2,3}))$/.exec(raw);
  const minutes = m ? (m[3] ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2])) : NaN;
  return isAnalysisGoal(minutes) ? minutes : 240;
}
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
const ms = (s: number) => { const t = Math.round(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/**
 * The goal line under the starting-pace receipt (the redesign spec, section 3.5): the band's edge as a first-5K time for
 * the reader's goal, worked out by lib/fast-start.ts. The goal is the one in the address (carried from page to page,
 * never stored), else the 4:00 example; it sits inside the page's masked .analysis-layout.
 */
export default function GoalLine({ band, edge }: { band: string; edge: number }) {
  const [goal, setGoal] = useState(240);
  useEffect(() => {
    const read = () => setGoal(goalOf(window.location.search));
    read(); window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  // One span: the goal line is a flex row (for a Change button), and a bare text run would split into items.
  return <span>For a <strong>{hm(goal)}</strong> goal, {band} is a first 5K under <strong>{ms(firstFiveAt(goal, edge))}</strong>. Even pace: {ms(firstFiveAt(goal))}.</span>;
}
