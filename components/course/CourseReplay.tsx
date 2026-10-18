import HeroReplay, { type ReplayChoice } from '@/components/story/HeroReplay';
import type { CoursePageData } from '@/lib/course-page';
import { CourseSection } from './Fact';

/** "#replay" (untracked; only for a course with a replayed edition): the race on one clock, the field or on the route. */
export default function CourseReplay({ page, choices }: { page: CoursePageData; choices: ReplayChoice[] }) {
  if (!choices.length) return null;
  return (
    <CourseSection id="replay" beat="Replay" className="course-replay-beat" title={<>Watch <em>{page.display} {choices[0].year}</em> unfold.</>}>
      <div className="course-replay night"><HeroReplay choices={choices} initial={choices[0].slug} /></div>
    </CourseSection>
  );
}
