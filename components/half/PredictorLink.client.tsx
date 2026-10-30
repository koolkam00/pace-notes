'use client';

import { useEffect, useRef, useState } from 'react';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { NOT_A_PREDICTION } from '@/lib/tools/half-to-full';

type Pace = { gap: string; word: 'slower' | 'quicker' };

/**
 * The lines under the flagship's half-by-half chart that follow its needle: the typical marathon's pace against the half
 * at the scrubbed half (in the reader's units), "Not a prediction." on its own line, and the link into the predictor at
 * that half (the half's whole minute, `t=H:MM:00`). Every string arrives built (lib/tools/half-to-full.ts), one per
 * scrub point.
 *
 * The chart itself stays on the server: this sits after it in the same wrapper and reads the needle from the chart's
 * slider (`aria-valuenow`, which the Scrubber sets as it moves). Drawing the profile here instead, through a callback,
 * made LineProfile and its label placement client code on every story page (+7.7 KB of initial script on each, S8,
 * October 30, 2026).
 */
export default function PredictorLink({ halves, paces, initial }: {
  /** The half at each scrub point, h:mm. */
  halves: string[];
  /** How much slower (or quicker) per mile and per km the typical marathon's pace was than that half's ("55 s/mi"). */
  paces: Record<'mi' | 'km', Pace[]>;
  /** The scrub point the chart opens on. */
  initial: number;
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
  return (
    <div ref={foot} className="half-after-foot">
      {pace ? <p className="half-pace-gap">Typical marathon pace: <b>{pace.gap}</b> {pace.word} than the half.</p> : null}
      <p className="half-not">{NOT_A_PREDICTION}</p>
      <p className="half-predictor">
        <Link href={`/tools/predictor?d=half&t=${half}:00`} className="half-predictor-link">Your own half in the Finish-time predictor<Arrow /></Link>
      </p>
    </div>
  );
}
