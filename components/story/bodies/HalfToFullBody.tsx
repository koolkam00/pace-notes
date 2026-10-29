import { getNugget } from '@/lib/nuggets';
import { STORIES } from '@/lib/stories';
import { ScopeTag } from '@/components/tools/EvidenceTag';
import { StoryHero, StoryPage, rich } from '../StoryPage';

const PATH = '/stories/half-to-full';

/**
 * From the half to the marathon (chapter 11's opener): the marathons that followed a half 3 to 16 weeks before, for
 * records linked by name (public/data/half/linked.json). Every figure is a linked one, so the page carries the scope
 * chip once, after the dek, and its root says so (data-half-scope="linked"). Words and figures are the half nuggets
 * (lib/nuggets/half.ts); the page types no number.
 */
export default function HalfToFullBody() {
  const story = STORIES.find((s) => s.slug === 'half-to-full')!;
  const extra = getNugget('half.extra');
  const figure = extra.figure;
  return (
    <StoryPage path={PATH} halfScope="linked">
      <StoryHero path={PATH} title={story.heading ?? story.title} stacked fallback={!extra.guard}
        dek={<>{rich('Halves and marathons of records linked by name, the half 3 to 16 weeks before.', { linked: true })} <ScopeTag /></>}
        figure={figure ? { value: figure.value, unit: figure.unit, sr: figure.sr } : undefined} unitLine={figure ? extra.key : undefined} />
    </StoryPage>
  );
}
