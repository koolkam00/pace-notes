import { notFound } from 'next/navigation';
import { getInsightsManifest, readInsight, clientArchetypes } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry, Courses, Demographics, FinishTimes, Kick, Positions, ReplayIndex } from '@/lib/insights';
import { STORIES, storyHref, type StoryDefinition } from '@/lib/stories';
import { JsonLd, absoluteUrl, breadcrumbs, pageMetadata } from '@/lib/seo';
import { sitemapEntries } from '@/lib/seo-routes';
import { DEFAULT_OG_IMAGE, ogImageFor } from '@/lib/og-paths';
import { StoryHeader, StoryNav } from '@/components/story/StoryShell';
import PacingTypesBody from '@/components/story/bodies/PacingTypesBody';
import RoundNumbersBody from '@/components/story/bodies/RoundNumbersBody';
import ReplayBody from '@/components/story/bodies/ReplayBody';
import PlacesBody from '@/components/story/bodies/PlacesBody';
import DemographicsBody from '@/components/story/bodies/DemographicsBody';
import CoursesBody from '@/components/story/bodies/CoursesBody';
import KickBody from '@/components/story/bodies/KickBody';

const BODIES: Record<string, true> = { 'pacing-types': true, 'round-numbers': true, 'race-replay': true, places: true, 'who-holds-pace': true, courses: true, 'final-kick': true };

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
  const manifest = getInsightsManifest();
  const files = new Set(available().map((s) => s.file));
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
  let body;
  if (story.slug === 'pacing-types') body = <PacingTypesBody data={clientArchetypes(readInsight<Archetypes>('archetypes.json'))} manifest={manifest} />;
  else if (story.slug === 'round-numbers') body = <RoundNumbersBody data={readInsight<FinishTimes>('finish-times.json')} manifest={manifest} />;
  else if (story.slug === 'who-holds-pace') body = <DemographicsBody data={readInsight<Demographics>('demographics.json')} manifest={manifest} />;
  else if (story.slug === 'final-kick') body = <KickBody data={readInsight<Kick>('kick.json')} manifest={manifest} />;
  else if (story.slug === 'courses') body = <CoursesBody data={readInsight<Courses>('courses.json')} geometry={readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses} manifest={manifest} />;
  else if (story.slug === 'places') body = <PlacesBody data={readInsight<Positions>('positions.json')} manifest={manifest} />;
  else body = <ReplayBody data={readInsight<ReplayIndex>('replay.json')} geometry={readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses} manifest={manifest} />;
  return (
    <article className="story-page" style={{ ['--story' as string]: story.accent }}>
      <StoryHeader story={story} />
      {body}
      <StoryNav current={story.slug} available={files} />
      <JsonLd data={[article, breadcrumbs([['Pace Notes', '/'], ['Stories', '/stories'], [story.title]])]} />
    </article>
  );
}
