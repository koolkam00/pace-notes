import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import { getInsightsManifest } from '@/lib/insights-server';
import { STORIES, storyHref } from '@/lib/stories';
import { count } from '@/lib/viz/format';

export const metadata = { title: 'Stories from the data | Pace Notes', description: 'Interactive stories from millions of recorded marathon finishes: pacing types, round-number finishes, race replays, places, the final kick, gender and age, and course fingerprints with race-morning weather.' };

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
              <span className="story-card-number">{s.number}</span>
              <span className="story-card-kicker">{s.kicker}</span>
              <span className="story-card-title">{s.title}</span>
              <span className="story-card-dek">{s.dek}</span>
              <span className="story-card-go">Read the story <span aria-hidden="true">→</span></span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
