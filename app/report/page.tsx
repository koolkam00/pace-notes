import ChainFrame from '@/components/ChainFrame';
import ChapterEnd from '@/components/ChapterEnd';
import ReportView from '@/components/report/ReportView';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
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
  // From 1180 px it sits in the chain's frame beside chapter 10's rail, so the chapter keeps one left edge from the
  // split check to the report (round 5: the report dropped to the page's own edge).
  return <ChainFrame path="/report"><div className="report-page">
    <ReportView data={reportData()} crumbs={<ChapterCrumbs path="/report" />} />
    <ChapterEnd path="/report" readingOf={readingOf} track={false} />
  </div></ChainFrame>;
}
