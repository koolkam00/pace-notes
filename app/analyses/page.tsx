import AnalysisIndex from '@/components/AnalysisIndex';
import WeatherIndex from '@/components/WeatherIndex';
import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import { TEN_ANALYSES } from '@/lib/ten-analyses';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: `Marathon Race Planning: ${TEN_ANALYSES.length} Pacing Questions | Pace Notes`,
  description: `${TEN_ANALYSES.length} marathon pacing questions answered with recorded 5 km splits: fast starts, checkpoints, courses, weather, hills, finish times and age.`,
  path: '/analyses',
});
export default function AnalysesPage() {
  return <section className="analyses-directory">
    <header className="night night-grain bleed story-hero directory-hero">
      <div className="container">
        <p className="eyebrow">Plan your race · the essential ten</p>
        <h1 className="story-title">Find your next question.</h1>
        <p className="hero-dek">Ten marathon pacing questions in priority order. Pick a course, a finish time and an age group and every answer recalculates from millions of eligible finishes. Weather questions that passed a separate evidence check follow below.</p>
      </div>
      <RunnerLane dark height={96} runners={[{ finishMinutes: 180, label: '3:00' }, { finishMinutes: 240, label: '4:00' }, { finishMinutes: 300, label: '5:00' }]} />
    </header>
    <div className="directory-body"><AnalysisIndex /></div>
    <WeatherIndex />
    <section className="analysis-request-callout"><div><p className="eyebrow">Your next question</p><h2>What else should we explore?</h2><p>Tell Andrew what you would like to learn from the marathon data.</p></div><Link className="text-link" href="/request-analysis">Request an analysis <span aria-hidden="true">↗</span></Link></section>
  </section>;
}
