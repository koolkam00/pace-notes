import { UnitLink as Link } from '@/components/UnitsProvider';
import { storyHref, type StoryDefinition } from '@/lib/stories';

/** Data story cards (the home page's teaser and the research hub), each linking to its story; styles in app/story.css. */
export default function StoryCards({ stories, className }: { stories: StoryDefinition[]; className?: string }) {
  return (
    <ol className={className ? `story-grid ${className}` : 'story-grid'}>
      {stories.map((s) => (
        <li key={s.slug}>
          <Link href={storyHref(s)} className="story-card" style={{ ['--story' as string]: s.accent }}>
            <span className="story-card-number" aria-hidden="true">{s.number}</span>
            <span className="story-card-kicker">{s.kicker}</span>
            <h3 className="story-card-title">{s.title}</h3>
            <span className="story-card-dek">{s.dek}</span>
            <span className="story-card-go" aria-hidden="true">Read the story <span>→</span></span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
