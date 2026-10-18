import { PageList } from '@/components/ui/ChapterList';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getInsightsManifest } from '@/lib/insights-server';
import { CHAPTERS, livePages } from '@/lib/chapters';
import { readingOf } from '@/lib/nuggets';
import { countWord } from '@/lib/nuggets/format';
import { STORIES, capital } from '@/lib/stories';
import { finishesM, pageMetadata } from '@/lib/seo';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export function generateMetadata() {
  const manifest = getInsightsManifest();
  const published = STORIES.filter((s) => manifest.files[s.file]).length;
  // The topic list names every story, so it is used only when all of them are published.
  const description = published === STORIES.length && WORDS[published]
    ? `${WORDS[published]} data stories from ${finishesM()} million recorded marathon finishes: pacing types, ${STORIES.find((st) => st.slug === 'round-numbers')!.title.replace(/^The /, 'the ')}, race replays, places, the final kick, age and courses.`
    : `Data stories from ${finishesM()} million recorded marathon finishes, each starting with one finding and the evidence to explore.`;
  return pageMetadata({ title: `Marathon Data Stories from ${finishesM()}M Finishes | Pace Notes`, description, path: '/stories' });
}

/** The stories: the contents filtered to them, in race order, each with its chapter and reading (spec 7.2, cut 3 of 00). */
export default function StoriesPage() {
  const count = CHAPTERS.flatMap(livePages).filter((p) => p.kind === 'story' && p.href.startsWith('/stories/')).length;
  return (
    <div className="contents-page">
      <header className="contents-hero">
        <h1 className="t-display">Stories</h1>
        {/* The term's first use on the page (the rows' keys sit inside their links), so it links to its definition. */}
        <p className="contents-dek">{capital(countWord(count))} stories from the race, the <Link href="/methodology#sustained-slowdown" className="term-link">sustained slowdown</Link> among them.</p>
      </header>
      <section className="contents-body" aria-label="Every story">
        <PageList kind="story" prefix="/stories/" readingOf={readingOf} label="Stories" />
      </section>
    </div>
  );
}
