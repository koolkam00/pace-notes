import PageFeedback from '@/components/PageFeedback';
import ReportView from '@/components/report/ReportView';
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
  // hashes, the opening groups, the pacing-type cohort and the course names.
  return <div className="container report-page">
    <ReportView data={reportData()} />
    <PageFeedback className="report-feedback" />
  </div>;
}
