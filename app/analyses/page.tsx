import { PageList } from '@/components/ui/ChapterList';
import { getNugget, readingOf, type NuggetId } from '@/lib/nuggets';
import { CHAPTERS, livePages } from '@/lib/chapters';
import { pageMetadata } from '@/lib/seo';

/** The analyses the page lists (every live analysis page in the chapters), so the title counts what the list shows. */
const listed = CHAPTERS.flatMap((c) => livePages(c)).filter((p) => p.kind === 'analysis' && p.href.startsWith('/analyses/')).length;

export const metadata = pageMetadata({
  title: `Marathon Pacing: ${listed} Analyses | Pace Notes`,
  description: `${listed} marathon pacing questions answered with recorded 5 km splits: fast starts, checkpoints, courses, weather, hills, finish times and age.`,
  path: '/analyses',
});

/**
 * A page's reading only once its nugget is the analysis's own verified finding: a bootstrap placeholder shows no
 * figure, so the list is one rhythm (every row a title, or a title and its finding), never half and half by accident.
 */
const verifiedReadingOf = (id: NuggetId) => (getNugget(id).placeholder ? null : readingOf(id));

/** The analyses: the contents filtered to them, in race order, each with its chapter and reading (spec 7.2, cut 3 of 00). */
export default function AnalysesPage() {
  return (
    <div className="contents-page">
      <header className="contents-hero">
        <h1 className="t-title">Analyses</h1>
        <p className="contents-dek">Each one answers a pacing question, then lets you set it to your course and time.</p>
      </header>
      <section className="contents-body" aria-label="Every analysis">
        <PageList kind="analysis" prefix="/analyses/" readingOf={verifiedReadingOf} label="Analyses" />
      </section>
    </div>
  );
}
