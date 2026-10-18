import Link from 'next/link';
import Arrow from '@/components/ui/Arrow';

/**
 * The explorer's one action (every Make it yours form): inert until a setting differs from the selection on screen, so
 * tapping it always shows something. Inert is aria-disabled rather than disabled, so it keeps its place in the tab order
 * and its hint says why; a tap or an Enter in a field does nothing then (the click's default, the form's submission, is
 * prevented before the sheet hears it).
 */
export function ExploreSubmit({ ready, id }: { ready: boolean; id: string }) {
  return (
    <div className="explore-submit">
      <button type="submit" className="btn btn-secondary is-compact" aria-disabled={ready ? undefined : true} aria-describedby={ready ? undefined : `${id}-why`}
        onClick={(event) => { if (!ready) event.preventDefault(); }}>Update comparison</button>
      {ready ? null : <p className="field-hint explore-submit-hint" id={`${id}-why`}>Change a setting to compare</p>}
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
