'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { useUnits } from '@/components/UnitsProvider';
import ExplorerChart from './ExplorerChart';
import type { GuideAnswer } from '@/lib/personalized';

/** What the explorer sends when the visitor's selection should take over the answer card (`pn:hero`); null puts it back. */
export type HeroDetail = { id: string; answer: GuideAnswer; goal: number; kicker: string } | null;
export const HERO_EVENT = 'pn:hero';

/**
 * The answer card's kicker and chart, which Make it yours can take over (finish-time context): the page draws its one
 * chart once, and a visitor's selection moves that chart (the needle to their time, ringed "You") instead of drawing a
 * second copy under the form. The server's example renders until the explorer sends a selection; the example set again
 * sends null and it returns. Inside the page's masked .analysis-layout, like the explorer.
 */
export default function HeroSwap({ kicker, children }: { kicker: string; children: ReactNode }) {
  const { units } = useUnits();
  const [detail, setDetail] = useState<HeroDetail>(null);
  useEffect(() => {
    const on = (event: Event) => setDetail((event as CustomEvent<HeroDetail>).detail ?? null);
    window.addEventListener(HERO_EVENT, on);
    return () => window.removeEventListener(HERO_EVENT, on);
  }, []);
  return (
    <>
      <p className="answer-kicker t-kicker">{detail ? detail.kicker : kicker}</p>
      {detail ? <ExplorerChart key={`${detail.kicker}-${detail.goal}`} id={detail.id} answer={detail.answer} goal={detail.goal} units={units} valuesId="hero-yours" yours /> : children}
    </>
  );
}
