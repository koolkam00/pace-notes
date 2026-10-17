'use client';
import { setSiteMotionOff, useSiteMotionOff } from './art/useTicker';

/** The site-wide Motion switch (the footer): off pauses every animated figure and the replay, and stays off in this browser. */
export default function MotionToggle() {
  const off = useSiteMotionOff();
  return (
    <button type="button" role="switch" aria-checked={!off} className="motion-toggle" onClick={() => setSiteMotionOff(!off)}>
      <span className="motion-toggle-track" aria-hidden="true" />Motion
    </button>
  );
}
