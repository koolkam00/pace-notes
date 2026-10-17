import { notFound } from 'next/navigation';
import QualifyingRace, { type CourseLink } from '@/components/tools/QualifyingRace';
import { pageDescription, pageTitle, raceName, racePath, standardByKey } from '@/components/tools/QualifyingRaceText';
import { getCourseNames, slugifyCity } from '@/lib/course-data';
import { pageMetadata } from '@/lib/seo';
import { QUALIFYING_COURSE, STANDARDS } from '@/lib/tools/qualifying';

/**
 * One page per race in lib/tools/qualifying.ts, at its own key: /tools/qualifying/boston, /nyc, /london, …
 * No `dynamicParams = false`: with output 'export' only these keys are exported (any other key calls notFound()), and
 * Next 14.2's dev server answers every race page with a 500 once the route recompiles.
 */
export function generateStaticParams() {
  return STANDARDS.map((s) => ({ race: s.key }));
}

export function generateMetadata({ params }: { params: { race: string } }) {
  const s = standardByKey(params.race);
  if (!s) return { title: 'Race not found | Pace Notes', robots: { index: false, follow: true } };
  return pageMetadata({ title: pageTitle(s), description: pageDescription(s), path: racePath(s) });
}

/** The race's course page, where Pace Notes has one. */
function courseLink(key: string, race: string): CourseLink {
  const city = QUALIFYING_COURSE[key];
  if (!city || !getCourseNames().includes(city)) return null;
  return { href: `/courses/${slugifyCity(city)}`, label: `${race} course and pacing` };
}

export default function QualifyingRacePage({ params }: { params: { race: string } }) {
  const s = standardByKey(params.race);
  if (!s) notFound();
  return <QualifyingRace s={s} others={STANDARDS.filter((o) => o.key !== s.key)} course={courseLink(s.key, raceName(s))} />;
}
