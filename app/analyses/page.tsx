import { PageList } from '@/components/ui/ChapterList';
import { readingOf } from '@/lib/nuggets';
import { TEN_ANALYSES } from '@/lib/ten-analyses';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: `Marathon Race Planning: ${TEN_ANALYSES.length} Pacing Questions | Pace Notes`,
  description: `${TEN_ANALYSES.length} marathon pacing questions answered with recorded 5 km splits: fast starts, checkpoints, courses, weather, hills, finish times and age.`,
  path: '/analyses',
});

/** The analyses: the contents filtered to them, in race order, each with its chapter and reading (spec 7.2, cut 3 of 00). */
export default function AnalysesPage() {
  return (
    <div className="contents-page">
      <header className="contents-hero">
        <h1 className="t-display">Analyses</h1>
        <p className="contents-dek">Answers first. Then make each one yours.</p>
      </header>
      <section className="contents-body" aria-label="Every analysis">
        <PageList kind="analysis" prefix="/analyses/" readingOf={readingOf} label="Analyses" />
      </section>
    </div>
  );
}
