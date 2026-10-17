import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import RunnerLane from '@/components/art/RunnerLane';
import type { StoryDefinition } from '@/lib/stories';
import ChapterEnd from '@/components/ChapterEnd';

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
    <section id={id} className="chapter story-section" aria-labelledby={`${id}-title`} data-beat={kicker.replace(/^\d+\s*·\s*/, '')}>
      <div className="chapter-head">
        <p className="chapter-num">{kicker}</p>
        <h2 id={`${id}-title`} className="chapter-title story-section-title">{title}</h2>
        {dek ? <p className="chapter-dek">{dek}</p> : null}
      </div>
      <div className="chapter-body">{children}</div>
    </section>
  );
}

/** The story's closing stack: the next card along the race, the way back and "How we know" (components/ChapterEnd.tsx). */
export function StoryNav({ current }: { current: string }) {
  return <ChapterEnd path={`/stories/${current}`} />;
}
