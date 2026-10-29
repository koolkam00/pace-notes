import { getNugget, sentenceOf } from '@/lib/nuggets';
import { StoryHero } from '@/components/story/StoryPage';
import HalfPage, { HALF_PATH, HalfCrumbs } from './HalfPage';

/**
 * /half, "The half marathon": where half marathon finish times sit, from half finishes in verified results (field.json,
 * women.json; no scope chip). Off the chapter chain like the Top 100 charts: no rail and no reading bar. Every sentence
 * and figure is a half nugget (lib/nuggets/half.ts); the page types no number.
 */
export default function HalfBody() {
  const field = getNugget('half.field');
  const figure = field.figure;
  return (
    <HalfPage scope="verified" how="/methodology#half-field">
      <StoryHero path={HALF_PATH} crumbs={<HalfCrumbs />} title={sentenceOf(field)} stacked fallback={!field.guard}
        figure={figure ? { value: figure.value, unit: figure.unit, sr: figure.sr } : undefined} />
    </HalfPage>
  );
}
