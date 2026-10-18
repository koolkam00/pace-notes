import ChapterEnd from '@/components/ChapterEnd';
import ReportView from '@/components/report/ReportView';
import RunnerCrumbs from '@/components/report/RunnerCrumbs';
import { readingOf } from '@/lib/nuggets';
import { pageMetadata } from '@/lib/seo';
import { reportData } from '@/lib/split-check-server';

// One race's nine times live in this page's own address: noindex, follow (lib/seo-routes NOINDEX), no canonical, no
// structured data, no share card of its own, out of the sitemap, and never recorded (REPLAY_BLOCKED_PAGES).
export const metadata = pageMetadata({
  title: 'Race report | Pace Notes',
  description: 'One marathon on one page from its nine mat times: section paces, sustained slowdown, pacing type and finishes at the same time, to print, save or share.',
  path: '/report',
  noindex: true,
});

export default function ReportPage() {
  // The race is read from the address in the browser (s, course, g and via); the build supplies only the verified file
  // hashes, the opening groups, the pacing-type cohort and the course names. The closing stack leads on to chapter 11
  // and back to /runners; it is not a tracked section here (the page's one section is `report`, docs/ANALYTICS.md).
  return <div className="report-page">
    <ReportView data={reportData()} crumbs={<RunnerCrumbs path="/report" />} />
    <ChapterEnd path="/report" readingOf={readingOf} track={false} />
  </div>;
}
