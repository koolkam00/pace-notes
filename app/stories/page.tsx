import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import { getInsightsManifest } from '@/lib/insights-server';
import { STORIES, storyHref } from '@/lib/stories';
import { finishesM, pageMetadata } from '@/lib/seo';
import { count } from '@/lib/viz/format';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

export function generateMetadata() {
  const manifest = getInsightsManifest();
  const published = STORIES.filter((s) => manifest.files[s.file]).length;
  // The topic list names every story, so it is used only when all of them are published.
  const description = published === STORIES.length && WORDS[published]
    ? `${WORDS[published]} data stories from ${finishesM()} million recorded marathon finishes: pacing types, the 3:59 effect, race replays, places, the final kick, age and courses.`
    : `Data stories from ${finishesM()} million recorded marathon finishes, each starting with one finding and the evidence to explore.`;
  return pageMetadata({ title: `Marathon Data Stories from ${finishesM()}M Finishes | Pace Notes`, description, path: '/stories' });
}

export default function StoriesPage() {
  const manifest = getInsightsManifest();
  const stories = STORIES.filter((s) => manifest.files[s.file]);
  return (
    <div className="stories-page">
      <section className="night night-grain bleed story-hero">
        <div className="container">
          <p className="eyebrow">Stories from the data</p>
          <h1 className="story-title">What {count(manifest.analysis_n)} marathon finishes show.</h1>
          <p className="hero-dek">Each story starts with one finding you can say out loud, then hands you the evidence to explore. Every number is recalculated from the same verified race records and can be downloaded.</p>
        </div>
        <RunnerLane dark height={100} runners={[{ finishMinutes: 170, label: '2:50' }, { finishMinutes: 230, label: '3:50' }, { finishMinutes: 290, label: '4:50' }, { finishMinutes: 350, label: '5:50' }]} />
      </section>
      <ol className="story-grid">
        {stories.map((s) => (
          <li key={s.slug}>
            <Link href={storyHref(s)} className="story-card" style={{ ['--story' as string]: s.accent }}>
              <span className="story-card-number" aria-hidden="true">{s.number}</span>
              <span className="story-card-kicker">{s.kicker}</span>
              <h2 className="story-card-title">{s.title}</h2>
              <span className="story-card-dek">{s.dek}</span>
              <span className="story-card-go" aria-hidden="true">Read the story →</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
