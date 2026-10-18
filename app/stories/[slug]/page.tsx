import { notFound } from 'next/navigation';
import { getInsightsManifest } from '@/lib/insights-server';
import { STORIES, storyHref, type StoryDefinition } from '@/lib/stories';
import { JsonLd, absoluteUrl, breadcrumbs, pageMetadata } from '@/lib/seo';
import { sitemapEntries } from '@/lib/seo-routes';
import { DEFAULT_OG_IMAGE, ogImageFor } from '@/lib/og-paths';
import { placeOf, chapterNumber } from '@/lib/chapters';
import PacingTypesBody from '@/components/story/bodies/PacingTypesBody';
import RoundNumbersBody from '@/components/story/bodies/RoundNumbersBody';
import ReplayBody from '@/components/story/bodies/ReplayBody';
import PlacesBody from '@/components/story/bodies/PlacesBody';
import DemographicsBody from '@/components/story/bodies/DemographicsBody';
import CoursesBody from '@/components/story/bodies/CoursesBody';
import KickBody from '@/components/story/bodies/KickBody';
import RaceMorningBody from '@/components/story/bodies/RaceMorningBody';

// Each story's body is a server component: it reads its data at build and hands its client islands only what they draw.
// The islands of every story share this route's one page chunk (about 5 KB gzipped; every story loads 161.7 KB in all
// against the 197.4 KB budget). Splitting them further would take a route folder per story.
const BODIES: Record<string, () => JSX.Element> = {
  'pacing-types': PacingTypesBody, 'round-numbers': RoundNumbersBody, 'race-replay': ReplayBody, places: PlacesBody,
  'who-holds-pace': DemographicsBody, courses: CoursesBody, 'final-kick': KickBody, 'race-morning': RaceMorningBody,
};

function available() {
  const manifest = getInsightsManifest();
  return STORIES.filter((s) => BODIES[s.slug] && manifest.files[s.file]);
}

/** The sitemap's lastmod for each story (the later of its CONTENT_DATES entry and the insights as_of day), read once per build. */
let lastmods: Map<string, string | undefined> | null = null;
const sitemapLastmod = (path: string) => (lastmods ??= new Map(sitemapEntries().map((entry) => [entry.path, entry.lastmod]))).get(path);

/** Search and social text for a story: its SEO fields, or the visible title and dek. */
function storySeo(story: StoryDefinition) {
  const path = storyHref(story);
  const description = story.seoDescription ?? story.dek;
  // The same date as the story's sitemap lastmod, so dateModified, article:modified_time and the sitemap agree;
  // never earlier than the day the story was first published.
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
  const image = ogImageFor(seo.path) ?? DEFAULT_OG_IMAGE;
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: story.title,
    description: seo.description,
    url: absoluteUrl(seo.path),
    mainEntityOfPage: absoluteUrl(seo.path),
    image: [/^https?:\/\//.test(image) ? image : absoluteUrl(image)],
    datePublished: seo.published,
    dateModified: seo.modified,
    inLanguage: 'en',
    author: [{ '@type': 'Person', name: 'Andrew Kam' }],
    publisher: { '@type': 'Person', name: 'Andrew Kam' },
  };
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
