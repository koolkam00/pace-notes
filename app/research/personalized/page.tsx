import Link from 'next/link';
import PersonalizedGuide from '@/components/PersonalizedGuide';
import { getPersonalSummary } from '@/lib/personalized-data';
import { pageMetadata } from '@/lib/seo';

export function generateMetadata() {
  const summary = getPersonalSummary();
  const count = summary?.analyses ? `${summary.analyses} archived` : 'Archived';
  return pageMetadata({
    title: 'Personal Marathon Comparisons: Research Archive | Pace Notes',
    description: `${count} marathon comparisons for a chosen course, age group and target time: race shape, openings, checkpoints, terrain, weather and repeat races.`,
    path: '/research/personalized',
  });
}

export default function ResearchGuidePage() {
  const summary = getPersonalSummary();
  return <><p className="archive-intro">Research archive · For a focused introduction, <Link href="/analyses">explore the ten essential analyses</Link>.</p>{summary ? <PersonalizedGuide summary={summary} /> : <p>The comparison data is unavailable.</p>}</>;
}
