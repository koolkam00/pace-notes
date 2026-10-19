import Link from 'next/link';
import Arrow from '@/components/ui/Arrow';

/**
 * The explorer's one action (every Make it yours form), shown only once a setting differs from the selection on screen,
 * so it is never an inert button with a line saying why, and tapping it always shows something.
 */
export function ExploreSubmit({ ready }: { ready: boolean }) {
  if (!ready) return null;
  return (
    <div className="explore-submit">
      <button type="submit" className="btn btn-secondary is-compact">Update comparison</button>
    </div>
  );
}

/**
 * What the explorer shows when the visitor sets the page's own example again: one line back to the answer, which already
 * draws it, rather than the same headline and chart a second time.
 */
export function AnswerAbove() {
  return (
    <p className="explore-same">
      <Link href="#answer" prefetch={false} className="explore-same-link">That’s the answer above <Arrow dir="up" /></Link>
    </p>
  );
}

/**
 * What the explorer shows under its headline when the selection is drawn on the page's answer card (HeroSwap): one line
 * back up to it, so the visitor sees where the comparison went rather than a second chart here.
 */
export function AnswerRedrawn() {
  return (
    <p className="explore-same">
      <Link href="#answer" prefetch={false} className="explore-same-link">Drawn in the answer above <Arrow dir="up" /></Link>
    </p>
  );
}
