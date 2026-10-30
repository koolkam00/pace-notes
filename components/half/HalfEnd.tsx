import Arrow from '@/components/ui/Arrow';
import PageFeedback from '@/components/PageFeedback';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { ToolHandoffs } from '@/components/tools/Handoffs';
import { CHAPTERS, chapterNumber } from '@/lib/chapters';
import { settledReadingOf } from '@/lib/nuggets';
import { STORIES, storyHref, storyPublished } from '@/lib/stories';
import HalfNext from './HalfNext';

/** The story /half hands on to: the half and the marathon after it, chapter 11's opener. */
const NEXT_SLUG = 'half-to-full';

/**
 * /half's closing stack, in a phone screen as a chapter end is: one night card to the half-to-full story (its reading,
 * once the half data has it published), the half's tools as plain rows (no figures and no badges: the tools carry their
 * own), the way back to the contents, then "Was this useful?". Its methods are the foot of the page's All numbers.
 */
export default function HalfEnd() {
  const story = STORIES.find((s) => s.slug === NEXT_SLUG);
  const href = story ? storyHref(story) : null;
  const page = href ? CHAPTERS.flatMap((c) => c.pages).find((p) => p.href === href) : undefined;
  const chapter = href ? CHAPTERS.find((c) => c.pages.some((p) => p.href === href)) : undefined;
  const reading = story && page && storyPublished(story) ? settledReadingOf(page.nugget) : null;
  return (
    <div className="chapter-end half-end" data-track-section="related">
      {story && href && page && storyPublished(story) ? (
        <nav className="chapter-next half-pagination" aria-label="Next page">
          {/* The kicker names the chapter the story opens and the title is the story's name in the chain, so the card
              never names one page twice (review, October 30, 2026: the story's title over its chain name read as the
              same words twice since the H1 fell back to the title). */}
          <HalfNext href={href} kicker={chapter ? `Chapter ${chapterNumber(chapter)} · ${chapter.title}` : 'Next'} title={page.short}
            reading={reading ? { ...reading, key: reading.key ?? chapter?.key } : null} />
        </nav>
      ) : null}
      <ToolHandoffs label="For your half" links={[
        { href: '/tools/predictor?d=half', title: 'Finish-time predictor', text: 'A marathon range from a half' },
        { href: '/tools/half-marathon-pace-chart', title: 'Half marathon pace chart', text: 'Every time from 1:10 to 3:00' },
        { href: '/tools/pace-calculator?d=half', title: 'Pace calculator', text: 'Splits for any half time' },
      ]} />
      <p className="chapter-end-links">
        <Link href="/research" className="chapter-prev"><Arrow dir="left" /><span><span className="sr-only">Back: </span>The race, start to finish</span></Link>
      </p>
      <PageFeedback />
    </div>
  );
}
