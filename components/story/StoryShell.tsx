import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import { STORIES, storyHref, type StoryDefinition } from '@/lib/stories';
import PageFeedback from '@/components/PageFeedback';

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

export function StoryNav({ current, available }: { current: string; available: Set<string> }) {
  const list = STORIES.filter((s) => available.has(s.file));
  const i = list.findIndex((s) => s.slug === current);
  const prev = i > 0 ? list[i - 1] : null;
  const next = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  return (
    <>
      <PageFeedback />
      <nav className="analysis-pagination story-pagination" aria-label="More stories">
        {prev ? <Link href={storyHref(prev)}><span>Previous story</span><strong>{prev.title}</strong></Link> : null}
        {next ? <Link href={storyHref(next)}><span>Next story</span><strong>{next.title}</strong></Link> : <Link href="/analyses"><span>Make it personal</span><strong>Ten questions for your next race</strong></Link>}
      </nav>
    </>
  );
}
