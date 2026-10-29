'use client';

import { useState, type ComponentProps } from 'react';
import LineProfile from '@/components/viz/LineProfile';
import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { NOT_A_PREDICTION } from '@/lib/tools/half-to-full';

type Profile = ComponentProps<typeof LineProfile>;

/**
 * The flagship's half-by-half chart with the lines that follow its needle: the typical marathon's pace against the half
 * at the scrubbed half, "Not a prediction." on its own line, and the link into the predictor at that half (the half's
 * whole minute, `t=H:MM:00`). The chart is the server's props drawn here, so the scrubber can say where it is
 * (LineProfile's `scrub.onIndex`); every string arrives built (lib/tools/half-to-full.ts), one per scrub point.
 */
export default function PredictorLink({ chart, halves, paces }: {
  /** The profile, its scrub without a callback (this wrapper adds it). */
  chart: Omit<Profile, 'scrub'> & { scrub: NonNullable<Profile['scrub']> };
  /** The half at each scrub point, h:mm. */
  halves: string[];
  /** How much slower (or quicker) per mile or km the typical marathon's pace was than that half's ("55 s/mi", "slower"). */
  paces: { gap: string; word: 'slower' | 'quicker' }[];
}) {
  const [index, setIndex] = useState(chart.scrub.initial);
  const half = halves[index] ?? halves[chart.scrub.initial];
  return (
    <>
      <LineProfile {...chart} scrub={{ ...chart.scrub, onIndex: setIndex }} />
      {paces[index] ? <p className="half-pace-gap">Typical marathon pace: <b>{paces[index].gap}</b> {paces[index].word} than the half.</p> : null}
      <p className="half-not">{NOT_A_PREDICTION}</p>
      <p className="half-predictor">
        <Link href={`/tools/predictor?d=half&t=${half}:00`} className="half-predictor-link">Your own half in the Finish-time predictor<Arrow /></Link>
      </p>
    </>
  );
}
