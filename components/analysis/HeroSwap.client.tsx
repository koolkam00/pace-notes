'use client';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { HERO_EVENT, type HeroDetail } from './hero-event';

/** The selection the page's explorer last sent (null: the page's own example). */
function useHeroDetail(): HeroDetail {
  const [detail, setDetail] = useState<HeroDetail>(null);
  useEffect(() => {
    const on = (event: Event) => setDetail((event as CustomEvent<HeroDetail>).detail ?? null);
    window.addEventListener(HERO_EVENT, on);
    return () => window.removeEventListener(HERO_EVENT, on);
  }, []);
  return detail;
}

/**
 * The answer card's kicker and chart, which Make it yours takes over: the page draws its one chart once, and a visitor's
 * selection redraws that chart (its course or group, its readout, in the answer's own grammar) instead of drawing a
 * second copy under the form (critic round 5). The server's example renders until the explorer sends a selection; the
 * example set again sends null and it returns. `slot="values"` is the same swap for the card's "All numbers", which
 * sits on paper under the card (AnswerCard `values`). Inside the page's masked .analysis-layout, like the explorer.
 */
export default function HeroSwap({ kicker, slot = 'chart', children }: { kicker?: ReactNode; slot?: 'chart' | 'values' | 'scope'; children?: ReactNode }) {
  const detail = useHeroDetail();
  if (slot === 'values') return <>{detail ? <Fragment key={detail.kicker}>{detail.values ?? null}</Fragment> : children}</>;
  // Under the dek while a selection is shown: what the card now draws, and that the H1 is the example's.
  if (slot === 'scope') return detail?.scope ? <span className="reading-scope">{detail.scope}</span> : null;
  // A selection always names itself ("Berlin · 4:00"), even on a card whose example needs no kicker.
  const named = detail ? detail.kicker : kicker;
  return (
    <>
      {named != null ? <p className="answer-kicker t-kicker">{named}</p> : null}
      {/* Keyed by the selection, so a new selection's scrubber opens on its own reading. */}
      {detail ? <Fragment key={detail.kicker}>{detail.chart}</Fragment> : children}
    </>
  );
}
