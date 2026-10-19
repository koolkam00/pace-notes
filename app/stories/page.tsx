import { PageList } from '@/components/ui/ChapterList';
import { getInsightsManifest } from '@/lib/insights-server';
import { CHAPTERS, livePages } from '@/lib/chapters';
import { readingOf } from '@/lib/nuggets';
import { countWord } from '@/lib/nuggets/format';
import { STORIES, capital } from '@/lib/stories';
import { finishesM, pageMetadata } from '@/lib/seo';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** The stories as the contents list them (their chapter names, in race order), chapter 01's /finish-times among them, so
 *  the list is an honest cut of the chain a reader follows (round 5). */
const storyPages = () => CHAPTERS.flatMap(livePages).filter((p) => p.kind === 'story');
/** A story's name inside a sentence: lower case, except a name that starts with a proper noun. */
const inSentence = (name: string) => name.replace(/^The /, 'the ').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());

export function generateMetadata() {
  const manifest = getInsightsManifest();
  const published = STORIES.filter((s) => manifest.files[s.file]).length;
  // The topic list names the stories as the page lists them, so it is used only when all of them are published; when
  // every name does not fit 155 characters, the first two and the last two.
  const names = storyPages().map((p) => inSentence(p.short));
  const list = (n: string[]) => `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  const lead = `${WORDS[published]} data stories from ${finishesM()} million recorded marathon finishes`;
  const full = `${lead}: ${list(names)}.`;
  const short = `${lead}, from ${names.slice(0, 2).join(' and ')} to ${names.slice(-2).join(' and ')}.`;
  const description = published === STORIES.length && WORDS[published] && names.length >= 4
    ? (full.length <= 155 ? full : short)
    : `Data stories from ${finishesM()} million recorded marathon finishes, each starting with one finding and the evidence to explore.`;
  return pageMetadata({ title: `Marathon Data Stories from ${finishesM()}M Finishes | Pace Notes`, description, path: '/stories' });
}

/** The stories: the contents filtered to them, in race order, each with its chapter and reading (spec 7.2, cut 3 of 00). */
export default function StoriesPage() {
  const count = storyPages().length;
  return (
    <div className="contents-page">
      <header className="contents-hero">
        <h1 className="t-title">Stories</h1>
        <p className="contents-dek">{capital(countWord(count))} stories, one finding each.</p>
      </header>
      <section className="contents-body" aria-label="Every story">
        <PageList kind="story" readingOf={readingOf} label="Stories" />
      </section>
    </div>
  );
}
