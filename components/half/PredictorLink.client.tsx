'use client';

import { useEffect, useRef, useState } from 'react';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';

type Pace = { gap: string; word: 'slower' | 'quicker' };

/**
 * The lines under the flagship's half-by-half chart that follow its needle: at the scrubbed half, one sentence with the
 * typical marathon's minutes over double the half, its pace against the half (in the reader's units) and how many in
 * 100 came in under double there ("Typical: double the half plus 24 min (55 s/mi slower than the half); 5 in 100 came
 * in under double."), so the H1's "double it plus 21 minutes" reads as a typical value that moves with the half; "Not a
 * prediction." on its own line; and the link into the predictor at that half (the half's whole minute, `t=H:MM:00`).
 * Every value arrives built on the server, one per scrub point, and so does "Not a prediction." (`not`, the page's
 * NOT_A_PREDICTION): importing lib/tools/half-to-full.ts here put the whole module in every story page's first-load
 * script (S8, round 4 review, October 30, 2026).
 *
 * The chart itself stays on the server: this sits after it in the same wrapper and reads the needle from the chart's
 * slider (`aria-valuenow`, which the Scrubber sets as it moves). Drawing the profile here instead, through a callback,
 * made LineProfile and its label placement client code on every story page (+7.7 KB of initial script on each, S8,
 * October 30, 2026).
 */
export default function PredictorLink({ halves, paces, extras, under, initial, not }: {
  /** The half at each scrub point, h:mm. */
  halves: string[];
  /** How much slower (or quicker) per mile and per km the typical marathon's pace was than that half's ("55 s/mi"). */
  paces: Record<'mi' | 'km', Pace[]>;
  /** The window's typical marathon as printed minus double its half, whole minutes, at each point (24), so it adds up. */
  extras: number[];
  /** How many in 100 marathons came in under double the half at each point ("5 in 100"). */
  under: string[];
  /** The scrub point the chart opens on. */
  initial: number;
  /** "Not a prediction." (lib/tools/half-to-full.ts NOT_A_PREDICTION, passed from the server). */
  not: string;
}) {
  const [index, setIndex] = useState(initial);
  const { units } = useUnits();
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const slider = foot.current?.parentElement?.querySelector<HTMLElement>('[role="slider"][aria-valuenow]');
    if (!slider || typeof MutationObserver === 'undefined') return;
    const read = () => {
      const i = Number(slider.getAttribute('aria-valuenow'));
      if (Number.isInteger(i) && i >= 0 && i < halves.length) setIndex(i);
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(slider, { attributes: true, attributeFilter: ['aria-valuenow'] });
    return () => observer.disconnect();
  }, [halves.length]);
  const half = halves[index] ?? halves[initial];
  const pace = paces[units === 'km' ? 'km' : 'mi'][index];
  const extra = extras[index];
  return (
    <div ref={foot} className="half-after-foot">
      {pace && extra !== undefined ? (
        <p className="half-pace-gap">
          Typical: double the half {extra >= 0 ? 'plus' : 'minus'} <b>{Math.abs(extra)} min</b> (<b>{pace.gap}</b> {pace.word} than the half){under[index] ? <>; <b>{under[index]}</b> came in under double.</> : '.'}
        </p>
      ) : null}
      <p className="half-not">{not}</p>
      <p className="half-predictor arrow-line">
        {/* ArrowTail's markup written out: its module would add to every story page's first-load script (S8). */}
        <Link href={`/tools/predictor?d=half&t=${half}:00`}>Your own half in the Finish-time <span className="arrow-tail">predictor<Arrow /></span></Link>
      </p>
    </div>
  );
}
