import ArrowTail from '@/components/ui/ArrowTail';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { STORIES, halfManifest, storyPublished } from '@/lib/stories';

/**
 * The figure-free ways into the half pages (spec 3.4): one line each on the home guide, /research, /about, the finish
 * times story and who holds pace, with no figure of their own. Each shows only when the page it opens is in this
 * build: /half with its verified field file, the half story when `storyPublished` says so.
 */
export function halfLive(): boolean {
  return !!halfManifest()?.files['field.json'];
}

export function halfStoryLive(): boolean {
  const story = STORIES.find((s) => s.slug === 'half-to-full');
  return !!story && storyPublished(story);
}

/**
 * "Running a half? The half marathon →": a sentence whose last words link to /half (or to the half story), laid out as
 * text with the arrow after the last word. `reading` marks a link into the linked story for verify-half's reading-link
 * rules (`data-half-link`: one link to a linked page, no chip, no half figure of its own).
 */
export function HalfWay({ className, lead, href = '/half', reading = false, children }: { className: string; lead?: string; href?: string; reading?: boolean; children: string }) {
  if (href === '/half' ? !halfLive() : !halfStoryLive()) return null;
  return (
    <p className={`${className} arrow-line`}>{lead ? `${lead} ` : null}
      <Link href={href} {...(reading ? { 'data-half-link': 'linked' } : {})}><ArrowTail text={children} /></Link>
    </p>
  );
}
