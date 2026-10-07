import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import type { InsightsManifest } from '@/lib/insights';
import { STORIES, storyHref, type StoryDefinition } from '@/lib/stories';
import { count } from '@/lib/viz/format';

export function StoryHeader({ story, children }: { story: StoryDefinition; children?: ReactNode }) {
  return (
    <section className="night night-grain bleed story-hero" style={{ ['--story' as string]: story.accent }}>
      <div className="container">
        <p className="eyebrow"><Link href="/stories">Stories</Link> · {story.number} · {story.kicker}</p>
        <h1 className="story-title">{story.title}</h1>
        <p className="hero-dek">{story.dek}</p>
        {children}
      </div>
      <RunnerLane dark height={96} crossing={18} runners={[{ finishMinutes: 200, kit: story.accent }, { finishMinutes: 260 }, { finishMinutes: 320 }]} />
    </section>
  );
}

export function StorySection({ id, kicker, title, children, dek }: { id: string; kicker: string; title: ReactNode; dek?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="chapter story-section" aria-labelledby={`${id}-title`}>
      <div className="chapter-head">
        <p className="chapter-num">{kicker}</p>
        <h2 id={`${id}-title`} className="chapter-title story-section-title">{title}</h2>
        {dek ? <p className="chapter-dek">{dek}</p> : null}
      </div>
      <div className="chapter-body">{children}</div>
    </section>
  );
}

export function StoryMethods({ manifest, files, method, caveats }: { manifest: InsightsManifest; files: string[]; method: string; caveats: string[] }) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  return (
    <section className="story-methods" aria-labelledby="methods-title">
      <div>
        <p className="eyebrow">How this was measured</p>
        <h2 id="methods-title">Method, data and limits</h2>
        <p>{method}</p>
        <p>
          The stories use {count(manifest.analysis_n)} eligible finishes: every record in the adopted release with all nine checkpoints increasing, a finish
          between 1:30 and 12:00 and every section between 2 and 20 minutes per kilometre, after the reviewed source-quality exclusions.
          {' '}{manifest.duplicate_edition_screen.map((d) => `${d.city} ${d.year}`).join(' and ')} are also left out here because their records duplicate the {manifest.duplicate_edition_screen[0]?.city} {manifest.duplicate_edition_screen[0]?.duplicate_of} field.
          {' '}Counts are race finishes, not unique runners.
        </p>
      </div>
      <div>
        <h3>Keep in mind</h3>
        <ul>{caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        <h3>Download the numbers</h3>
        <ul className="story-downloads">
          {files.map((f) => <li key={f}><a href={`${base}/data/insights/${f}`}>{f}</a> <span>{count(manifest.files[f]?.bytes ?? 0)} bytes</span></li>)}
          <li><a href={`${base}/data/insights/manifest.json`}>manifest.json</a> <span>release, cohort and checksums</span></li>
          <li><a href="https://github.com/koolkam00/htw-live-study/releases">Full race records ↗</a></li>
        </ul>
        <p className="story-method-link"><Link href="/methodology">Read the full methodology</Link></p>
      </div>
    </section>
  );
}

export function StoryNav({ current, available }: { current: string; available: Set<string> }) {
  const list = STORIES.filter((s) => available.has(s.file));
  const i = list.findIndex((s) => s.slug === current);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  return (
    <nav className="analysis-pagination story-pagination" aria-label="More stories">
      {prev ? <Link href={storyHref(prev)}><span>Previous story</span><strong>{prev.title}</strong></Link> : null}
      {next ? <Link href={storyHref(next)}><span>Next story</span><strong>{next.title}</strong></Link> : <Link href="/analyses"><span>Make it personal</span><strong>Ten questions for your next race</strong></Link>}
    </nav>
  );
}
