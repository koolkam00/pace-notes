import { PageList } from '@/components/ui/ChapterList';
import { CHAPTERS, livePages, type PageKind } from '@/lib/chapters';
import { getNugget, readingOf } from '@/lib/nuggets';
import { countWord } from '@/lib/nuggets/format';
import { STORIES, capital, storyHref, storyPublished } from '@/lib/stories';
import { finishesM, pageMetadata } from '@/lib/seo';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];

/** The kinds of page this list holds: the stories, and chapter 05's opener on the story template (/slowdown, the page
 *  that says what a sustained slowdown is; round 6: it was on neither /stories nor /analyses). */
const KINDS: PageKind[] = ['story', 'explainer'];
/** The stories as the contents list them (their chapter names, in race order), chapter 01's /finish-times and chapter
 *  05's /slowdown among them, so the list is an honest cut of the chain a reader follows (round 5). */
const storyPages = () => CHAPTERS.flatMap(livePages).filter((p) => KINDS.includes(p.kind));
/** A story's name inside a sentence: lower case, except a name that starts with a proper noun. */
const inSentence = (name: string) => name.replace(/^The /, 'the ').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());

export function generateMetadata() {
  // The count the page's own line gives (every page it lists), so search and share copy never disagree with it.
  const published = storyPages().length;
  const allPublished = STORIES.every(storyPublished);
  // The topic list names the stories as the page lists them, so it is used only when all of them are published; when
  // every name does not fit 155 characters, the first two and the last two.
  const names = storyPages().map((p) => inSentence(p.short));
  const list = (n: string[]) => `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  // A half-marathon story is not one of the marathon finishes' stories, so with one listed the count says "most".
  const half = STORIES.some((s) => s.source === 'half' && storyPages().some((p) => p.href === storyHref(s)));
  const lead = `${WORDS[published]} data stories${half ? ', most' : ''} from ${finishesM()} million recorded marathon finishes`;
  const full = `${lead}: ${list(names)}.`;
  const short = `${lead}, from ${names.slice(0, 2).join(' and ')} to ${names.slice(-2).join(' and ')}.`;
  const description = allPublished && WORDS[published] && names.length >= 4
    ? (full.length <= 155 ? full : short)
    : `Data stories from ${finishesM()} million recorded marathon finishes, each starting with one finding and the evidence to explore.`;
  return pageMetadata({ title: `Marathon Data Stories from ${finishesM()}M Finishes | Pace Notes`, description, path: '/stories' });
}

/** The stories: the contents filtered to them, in race order, each with its chapter and reading (spec 7.2, cut 3 of 00).
 *  The line promises a finding for each only while every listed story states one (its nugget's guard holds): a story
 *  whose reading fell back shows a neutral figure in its row, such as chapter 11's count of pairs (post-merge review,
 *  round 2, October 31, 2026). */
export default function StoriesPage() {
  const count = storyPages().length;
  const found = storyPages().every((p) => getNugget(p.nugget).guard);
  return (
    <div className="contents-page">
      <header className="contents-hero">
        <h1 className="t-title">Stories</h1>
        <p className="contents-dek">{capital(countWord(count))} stories{found ? ', one finding each' : ''}.</p>
      </header>
      <section className="contents-body" aria-label="Every story">
        <PageList kind={KINDS} readingOf={readingOf} label="Stories" />
      </section>
    </div>
  );
}
