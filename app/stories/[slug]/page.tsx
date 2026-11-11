import { notFound } from 'next/navigation';
import { STORIES, storyHref, storyPublished, type StoryDefinition } from '@/lib/stories';
import { JsonLd, articleLd, breadcrumbs, pageMetadata, sitemapLastmod } from '@/lib/seo';
import { placeOf, chapterNumber } from '@/lib/chapters';
import PacingTypesBody from '@/components/story/bodies/PacingTypesBody';
import RoundNumbersBody from '@/components/story/bodies/RoundNumbersBody';
import ReplayBody from '@/components/story/bodies/ReplayBody';
import PlacesBody from '@/components/story/bodies/PlacesBody';
import DemographicsBody from '@/components/story/bodies/DemographicsBody';
import CoursesBody from '@/components/story/bodies/CoursesBody';
import KickBody from '@/components/story/bodies/KickBody';
import RaceMorningBody from '@/components/story/bodies/RaceMorningBody';
import HalfToFullBody from '@/components/story/bodies/HalfToFullBody';

// Each story's body is a server component: it reads its data at build and hands its client islands only what they draw.
// The islands of every story share this route's one page chunk (about 5 KB gzipped; every story loads 161.7 KB in all
// against the 197.4 KB budget). Splitting them further would take a route folder per story.
const BODIES: Record<string, () => JSX.Element> = {
  'pacing-types': PacingTypesBody, 'round-numbers': RoundNumbersBody, 'race-replay': ReplayBody, places: PlacesBody,
  'who-holds-pace': DemographicsBody, courses: CoursesBody, 'final-kick': KickBody, 'race-morning': RaceMorningBody,
  'half-to-full': HalfToFullBody,
};

/** The stories built here: those with a body whose data file is in their verified manifest (a half story's is the half one). */
function available() {
  return STORIES.filter((s) => BODIES[s.slug] && storyPublished(s));
}

/** Search and social text for a story: its SEO fields, or the visible title and dek. */
function storySeo(story: StoryDefinition) {
  const path = storyHref(story);
  const description = story.seoDescription ?? story.dek;
  // The same date as the story's sitemap lastmod (the later of its CONTENT_DATES entry and the insights as_of day), so
  // dateModified, article:modified_time and the sitemap agree; never earlier than the day the story was first published.
  const modified = [story.published, sitemapLastmod(path)].filter((date): date is string => !!date).sort().pop()!;
  return { path, title: story.seoTitle ?? `${story.title} | Pace Notes`, description, published: story.published, modified };
}

export function generateStaticParams() {
  return available().map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const story = available().find((s) => s.slug === params.slug);
  if (!story) return {};
  const seo = storySeo(story);
  return pageMetadata({ title: seo.title, description: seo.description, path: seo.path, type: 'article', publishedTime: seo.published, modifiedTime: seo.modified });
}

export default function StoryPage({ params }: { params: { slug: string } }) {
  const story = available().find((s) => s.slug === params.slug);
  if (!story) notFound();
  const seo = storySeo(story);
  // The headline is the page's H1: the heading every story body hands StoryHero (until November 9, 2026 it was the
  // display title, "Round numbers" where the page opens on its finding). verify-seo's article check compares the two.
  const article = articleLd({ headline: story.heading ?? story.title, description: seo.description, path: seo.path, published: seo.published, modified: seo.modified });
  const place = placeOf(seo.path);
  const crumb = place ? `Chapter ${chapterNumber(place.chapter)} · ${place.chapter.title}` : 'Stories';
  const Body = BODIES[story.slug];
  return (
    <>
      <Body />
      <JsonLd data={[article, breadcrumbs([['Pace Notes', '/'], [crumb, place ? '/research' : '/stories'], [story.title]])]} />
    </>
  );
}
