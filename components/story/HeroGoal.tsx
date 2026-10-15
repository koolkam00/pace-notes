'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DurationField } from '@/components/tools/ui';
import { useUnits } from '@/components/UnitsProvider';
import { GOAL_MAX, GOAL_MIN, isAnalysisGoal } from '@/lib/analysis-profile';
import { unitHref } from '@/lib/unit-preference';
import { formatHM } from '@/lib/tools/time';

const INPUT_ID = 'hero-goal-time';
const RANGE = `${formatHM(GOAL_MIN * 60)} to ${formatHM(GOAL_MAX * 60)}`;

/**
 * The home page's "make it yours" way in (experiment home-hero-v1): a marathon time, then how finishes near it paced.
 * The time leaves the page only in the next page's address, as whole minutes (`/analyses/pacing-pattern?goal=227`),
 * which analytics never keeps. Nothing here is sent, and recordings mask the whole form (`.hero-goal`,
 * lib/replay-policy.ts). A time the analysis would not read (outside 1:30–12:00) stays here with a hint.
 */
export default function HeroGoal() {
  const router = useRouter();
  const { units, resolved } = useUnits();
  const [seconds, setSeconds] = useState<number | null>(null);
  // The range hint waits until the visitor leaves the field or presses the button, so it does not flash while typing.
  const [checked, setChecked] = useState(false);
  const minutes = seconds === null ? null : Math.round(seconds / 60);
  const ready = minutes !== null && isAnalysisGoal(minutes);
  const error = !checked || ready ? undefined : minutes === null ? 'Type a time such as 4:15.' : `Choose a time from ${RANGE}.`;
  return (
    <form className="hero-goal" action="/analyses/pacing-pattern" noValidate onBlur={() => { if (seconds !== null) setChecked(true); }}
      onSubmit={(event) => {
        event.preventDefault();
        setChecked(true);
        if (!ready) { document.getElementById(INPUT_ID)?.focus(); return; }
        const href = `/analyses/pacing-pattern?goal=${minutes}`;
        router.push(resolved ? unitHref(href, units) : href);
      }}>
      <DurationField id={INPUT_ID} label="Your marathon time" value={seconds} onChange={setSeconds} placeholder="e.g. 4:15"
        hint="A finish time or a goal, as h:mm" error={error} />
      <button type="submit" className="button-accent">See how finishers near your time paced <span aria-hidden="true">→</span></button>
    </form>
  );
}
