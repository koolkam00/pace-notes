import { notFound } from 'next/navigation';
import QualifyingRace from '@/components/tools/QualifyingRace';
import { pageDescription, pageTitle, racePath, standardByKey } from '@/components/tools/QualifyingRaceText';
import { pageMetadata } from '@/lib/seo';
import { STANDARDS } from '@/lib/tools/qualifying';

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

export default function QualifyingRacePage({ params }: { params: { race: string } }) {
  const s = standardByKey(params.race);
  if (!s) notFound();
  return <QualifyingRace s={s} />;
}
