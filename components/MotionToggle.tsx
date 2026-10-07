'use client';
import { setSiteMotionOff, useSiteMotionOff } from './art/useTicker';

/** Site-wide control that pauses every animated figure and illustration. */
export default function MotionToggle() {
  const off = useSiteMotionOff();
  return <button type="button" className="motion-toggle" onClick={() => setSiteMotionOff(!off)}>
    <span aria-hidden="true">{off ? '▶' : '❚❚'}</span>{off ? 'Play animations' : 'Pause all animations'}
  </button>;
}
