import DotStrip from '@/components/viz/DotStrip';
import { getNugget } from '@/lib/nuggets';
import { MIN_EDITIONS } from '@/lib/nuggets/courses';
import { pct } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import { CourseSection, Said } from './Fact';

/**
 * "#slowdown": every course on one strip by its share of finishes with a sustained slowdown (the same courses.json
 * share each course page leads with), this one in signal and named on its dot; courses with fewer than three editions
 * hollow (the key names both kinds), the extremes among the rest labelled. The H2 says this course's share and where it
 * sits among the other courses with three or more editions (course.among), so the readout opens on a prompt rather than
 * repeating it, and a tap reads out a course; this course's dot is drawn on top of its stack, so its leader crosses no
 * other dot.
 */
export default function CourseSlowdown({ page }: { page: CoursePageData }) {
  const { city, display, field } = page;
  const n = getNugget('course.among', { city });
  // Room past the highest share (to the next 2 points, at least 8 points on), so a name labelled at the right end of
  // the strip stays inside it on the narrowest phone, also where this course's own label pushes it along.
  const top = Math.ceil((Math.max(...field.map((c) => c.slowdown)) + 0.08) * 50) / 50;
  const ticks = Array.from({ length: Math.floor(top * 10) }, (_, i) => (i + 1) / 10).map((v) => ({ value: v, label: pct(v) }));
  return (
    <CourseSection id="slowdown" track="chapter-5" beat="Slowdowns" title={<Said nugget={n} />}>
      <DotStrip items={field.map((c) => ({ id: c.slug, label: c.display, value: c.slowdown, display: pct(c.slowdown), hollow: c.editions < MIN_EDITIONS, subject: c.city === city }))}
        domain={[0.1, top]} ticks={ticks.filter((t) => t.value >= 0.1)} keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
        labelSubject subjectOnTop prompt="Choose a dot to read its course"
        label={`Sustained slowdown on every course, ${display} among them`} />
    </CourseSection>
  );
}
