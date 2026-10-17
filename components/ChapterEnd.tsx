import Arrow from './ui/Arrow';
import ChapterLink from './ChapterLink';
import NextCard, { FinishCard } from './NextCard';
import PageFeedback from './PageFeedback';
import { UnitLink as Link } from './UnitsProvider';
import { cleanPath, howWeKnowOf, nextOf, placeOf, prevOf, type ReadingOf } from '@/lib/chapters';

/**
 * The closing stack of every page in the race (the redesign spec, section 2.6), in one phone screen: "Also in this
 * chapter" (when the chapter has off-chain pages), the next card (or, on /tools/plan, the finish card), a row with
 * "← previous" and "How we know", then "Was this useful?". Nobody is dropped at a footer.
 *
 * - `readingOf` resolves the next page's reading (lib/nuggets); without it the card shows no figure.
 * - `variant`: the card sits in nav.analysis-pagination on analyses (S2 and S3 follow `.analysis-pagination a`) and in
 *   nav.story-pagination elsewhere.
 * - `track` (default true) marks the stack as the page's `related` section; a course page renders it inside its own
 *   #other-courses section with `track={false}`, so the page keeps one. `feedback={false}` leaves PageFeedback to a
 *   page that places its own.
 */
export default function ChapterEnd({ path, readingOf, variant = 'story', track = true, feedback = true }: {
  path: string; readingOf?: ReadingOf; variant?: 'story' | 'analysis'; track?: boolean; feedback?: boolean;
}) {
  const place = placeOf(path);
  if (!place) return feedback ? <PageFeedback /> : null;
  const here = cleanPath(path);
  const next = nextOf(path), prev = prevOf(path), how = howWeKnowOf(path);
  const reading = next && readingOf ? readingOf(next.opensChapter ? next.chapter.lead : next.page.nugget) : null;
  const also = (place.chapter.also ?? []).filter((a) => a.href !== here);
  return (
    <div className="chapter-end" {...(track ? { 'data-track-section': 'related' } : {})}>
      {also.length ? (
        <div className="chapter-also">
          <p className="t-kicker">Also in this chapter</p>
          <ul>{also.map((a) => <li key={a.href}><ChapterLink href={a.href} className="chapter-also-link">{a.label}<Arrow /></ChapterLink></li>)}</ul>
        </div>
      ) : null}
      <nav className={`chapter-next ${variant}-pagination`} aria-label={next ? 'Next page' : 'Finish'}>
        {next ? <NextCard next={next} reading={reading} /> : <FinishCard />}
      </nav>
      {prev || how ? (
        <p className="chapter-end-links">
          {prev ? <ChapterLink href={prev.href} className="chapter-prev"><Arrow dir="left" /><span><span className="sr-only">Previous: </span>{prev.short}</span></ChapterLink> : <span />}
          {how ? <Link href={how} className="chapter-how">How we know<Arrow dir="up-right" /></Link> : null}
        </p>
      ) : null}
      {feedback ? <PageFeedback /> : null}
    </div>
  );
}
