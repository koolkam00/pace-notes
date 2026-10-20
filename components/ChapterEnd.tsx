import Arrow from './ui/Arrow';
import ChapterLink from './ChapterLink';
import NextCard, { FinishCard } from './NextCard';
import PageFeedback from './PageFeedback';
import { UnitLink as Link } from './UnitsProvider';
import { howWeKnowOf, nextOf, placeOf, prevOf, type ReadingOf } from '@/lib/chapters';

/**
 * The closing stack of every page in the race (the redesign spec, section 2.6, cut under section 00), in one phone
 * screen: the next card (or, on /tools/plan, the finish card), a row with "← previous" and "How we know", then "Was
 * this useful?". One way forward and one way back: a chapter's off-chain pages are listed in the contents and the
 * menu, not here. Nobody is dropped at a footer. One way to the page's methods per screen (round 6): where the row
 * carries "How we know", the footer's own link to /methodology steps aside (footer.css); a story keeps its methods at
 * the foot of its "All numbers" (`how={false}` here), so its row is the way back alone.
 *
 * - `readingOf` resolves the next page's reading (lib/nuggets); without it the card shows no figure.
 * - `variant`: the card sits in nav.analysis-pagination on analyses (S2 and S3 follow `.analysis-pagination a`) and in
 *   nav.story-pagination elsewhere.
 * - `track` (default true) marks the stack as the page's `related` section; a course page renders it inside its own
 *   #other-courses section with `track={false}`, so the page keeps one. `feedback={false}` leaves PageFeedback to a
 *   page that places its own. `how={false}` leaves the methods link to the page's "All numbers" (AllNumbers `how`).
 */
export default function ChapterEnd({ path, readingOf, variant = 'story', track = true, feedback = true, how: withHow = true }: {
  path: string; readingOf?: ReadingOf; variant?: 'story' | 'analysis'; track?: boolean; feedback?: boolean; how?: boolean;
}) {
  const place = placeOf(path);
  if (!place) return feedback ? <PageFeedback /> : null;
  const next = nextOf(path), how = withHow ? howWeKnowOf(path) : null;
  // One way forward, one way back: a page whose way back is also its next card (the planner's off-chain tools) keeps the card only.
  const back = prevOf(path);
  const prev = back && next && back.href === next.page.href ? null : back;
  const reading = next && readingOf ? readingOf(next.opensChapter ? next.chapter.lead : next.page.nugget) : null;
  return (
    <div className="chapter-end" {...(track ? { 'data-track-section': 'related' } : {})}>
      <nav className={`chapter-next ${variant}-pagination`} aria-label={next ? 'Next page' : 'Finish'}>
        {next ? <NextCard next={next} reading={reading} /> : <FinishCard />}
      </nav>
      {prev || how ? (
        <p className="chapter-end-links">
          {prev ? <ChapterLink href={prev.href} className="chapter-prev"><Arrow dir="left" /><span><span className="sr-only">Previous: </span>{prev.short}</span></ChapterLink> : null}
          {/* An internal page, so the plain arrow (↗ is for links that leave the site); alone, it sits on the left. */}
          {how ? <Link href={how} className="chapter-how">How we know<Arrow /></Link> : null}
        </p>
      ) : null}
      {feedback ? <PageFeedback /> : null}
    </div>
  );
}
