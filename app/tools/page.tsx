import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import ToolIcon from '@/components/tools/ToolIcon';
import { EvidenceBadge } from '@/components/tools/ToolShell';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { TOOLS, toolHref, type ToolGroup } from '@/lib/tools/registry';

export const metadata = {
  title: 'Runner tools | Pace Notes',
  description: 'Free marathon tools built on millions of real finishes: pace calculator and chart, honest finish-time predictor, course-aware pace band, race-day projector, weather match, course chooser, split check and qualifying checker.',
};

const GROUPS: { group: ToolGroup; title: string }[] = [
  { group: 'Plan', title: 'Plan the race' },
  { group: 'Race day', title: 'On race day' },
  { group: 'Afterwards', title: 'After the race' },
  { group: 'Qualify', title: 'Qualify' },
];

export default function ToolsPage() {
  const manifest = getInsightsManifest();
  const available = TOOLS.filter((t) => !t.file || manifest.files[t.file]);
  const cohort = manifest.files['tools/projector.json'] ? readInsight<{ cohort_n: number }>('tools/projector.json').cohort_n : null;
  return (
    <div className="tools-page">
      <section className="night night-grain bleed tools-hero">
        <div className="container">
          <p className="eyebrow">Runner tools</p>
          <h1 className="story-title">Tools that know how marathons <em>really</em> go.</h1>
          <p className="hero-dek">
            Most calculators assume you will hold your pace to the finish. Most runners don’t. These tools pair exact arithmetic and published
            research with what {cohort ? `${(cohort / 1e6).toFixed(2)} million` : 'millions of'} recorded finishes actually did, and say plainly which is which.
          </p>
        </div>
        <RunnerLane dark height={100} runners={[{ finishMinutes: 180, label: '3:00' }, { finishMinutes: 210, label: '3:30' }, { finishMinutes: 240, label: '4:00' }, { finishMinutes: 300, label: '5:00' }]} />
      </section>
      <div className="container tools-index">
        {GROUPS.map(({ group, title }) => {
          const tools = available.filter((t) => t.group === group);
          if (!tools.length) return null;
          return (
            <section key={group} className="tools-group" aria-labelledby={`tools-${group.replace(/\s+/g, '-').toLowerCase()}`}>
              <h2 id={`tools-${group.replace(/\s+/g, '-').toLowerCase()}`}>{title}</h2>
              <ul className="tools-grid">
                {tools.map((t) => (
                  <li key={t.slug}>
                    <Link href={toolHref(t)} className="tool-card" style={{ ['--tool' as string]: t.accent }}>
                      <ToolIcon slug={t.slug} className="tool-card-icon" />
                      <h3>{t.title}</h3>
                      <p>{t.dek}</p>
                      <span className="tool-badges">{t.evidence.map((e) => <EvidenceBadge key={e} kind={e} compact />)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <div className="tools-principles">
          <div><b>Arithmetic is labelled as arithmetic</b><p>Even-pace splits, mile rows and pace charts are exact maths, not observations.</p></div>
          <div><b>Data is what finishes did</b><p>Shares describe complete finishes in the data, never your personal chance. Runners who stopped are not in it.</p></div>
          <div><b>Research is cited</b><p>Prediction and heat formulas come from published studies, kept apart from Pace Notes results.</p></div>
          <div><b>Your inputs stay with you</b><p>Everything runs in your browser. Birth dates are never put in links or analytics.</p></div>
        </div>
      </div>
    </div>
  );
}
