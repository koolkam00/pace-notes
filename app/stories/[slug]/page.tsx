import { notFound } from 'next/navigation';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { Archetypes, CourseGeometry, Courses, Demographics, FinishTimes, Positions, ReplayIndex } from '@/lib/insights';
import { STORIES } from '@/lib/stories';
import { StoryHeader, StoryNav } from '@/components/story/StoryShell';
import PacingTypesBody from '@/components/story/bodies/PacingTypesBody';
import RoundNumbersBody from '@/components/story/bodies/RoundNumbersBody';
import ReplayBody from '@/components/story/bodies/ReplayBody';
import PlacesBody from '@/components/story/bodies/PlacesBody';
import DemographicsBody from '@/components/story/bodies/DemographicsBody';
import CoursesBody from '@/components/story/bodies/CoursesBody';

const BODIES: Record<string, true> = { 'pacing-types': true, 'round-numbers': true, 'race-replay': true, places: true, 'who-holds-pace': true, courses: true };

function available() {
  const manifest = getInsightsManifest();
  return STORIES.filter((s) => BODIES[s.slug] && manifest.files[s.file]);
}

export function generateStaticParams() {
  return available().map((s) => ({ slug: s.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const story = STORIES.find((s) => s.slug === params.slug);
  return story ? { title: `${story.title} | Pace Notes`, description: story.dek } : {};
}

export default function StoryPage({ params }: { params: { slug: string } }) {
  const story = available().find((s) => s.slug === params.slug);
  if (!story) notFound();
  const manifest = getInsightsManifest();
  const files = new Set(available().map((s) => s.file));
  let body;
  if (story.slug === 'pacing-types') body = <PacingTypesBody data={readInsight<Archetypes>('archetypes.json')} manifest={manifest} />;
  else if (story.slug === 'round-numbers') body = <RoundNumbersBody data={readInsight<FinishTimes>('finish-times.json')} manifest={manifest} />;
  else if (story.slug === 'who-holds-pace') body = <DemographicsBody data={readInsight<Demographics>('demographics.json')} manifest={manifest} />;
  else if (story.slug === 'courses') body = <CoursesBody data={readInsight<Courses>('courses.json')} geometry={readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses} manifest={manifest} />;
  else if (story.slug === 'places') body = <PlacesBody data={readInsight<Positions>('positions.json')} manifest={manifest} />;
  else body = <ReplayBody data={readInsight<ReplayIndex>('replay.json')} geometry={readInsight<{ courses: CourseGeometry[] }>('course-geometry.json').courses} manifest={manifest} />;
  return (
    <article className="story-page" style={{ ['--story' as string]: story.accent }}>
      <StoryHeader story={story} />
      {body}
      <StoryNav current={story.slug} available={files} />
    </article>
  );
}
