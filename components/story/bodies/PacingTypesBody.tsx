import type { Archetypes } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { evenestType, typeName } from '@/lib/nuggets/stories';
import { countWord, hm, pct } from '@/lib/nuggets/format';
import TypeGlyph from '@/components/viz/TypeGlyph';
import Values from '@/components/ui/Values';
import TypeRiver from '../charts/TypeRiver';
import { Beat, Moved, Say, StoryHero, StoryPage, rich } from '../StoryPage';
import { WhichArchetype } from '../ArchetypeStory';
import { classifyTimes, parseClock } from '@/lib/pacing-type';

const PATH = '/stories/pacing-types';
/** The mat times the type finder opens on: an even-ish 3:51 that fades late. */
const EXAMPLE = ['0:25:30', '0:51:00', '1:16:40', '1:42:30', '2:08:50', '2:36:10', '3:05:00', '3:36:00', '3:51:00'];

/**
 * Six ways to run the same race (the redesign spec, section 7.5, under section 00): the reading (the two most common
 * types and their share together, the H1's finding) with the six shapes and their shares as its instrument, in share
 * order so the list reads in the H1's order, under one line that continues the home page's guess (how few ran a faster
 * second 20K); then who runs which shape as the clock runs, and the reader's own type. The animated six-runner race,
 * the barcode and the habits beat are cut (the habits are chapter 11's subject), and so is the women-and-men beat
 * (chapter 07 is about recorded gender, and its finding was given away here); their anchors land on these beats.
 */
export default function PacingTypesBody() {
  const data = readInsight<Archetypes>('archetypes.json');
  const story = STORIES.find((s) => s.slug === 'pacing-types')!;
  const lead = getNugget('types.top'), river = getNugget('types.river'), second = getNugget('types.second20k');
  const types = data.archetypes;
  const all = types.flatMap((t) => t.profile);
  const domain: [number, number] = [Math.min(...all), Math.max(...all)];
  const even = evenestType(types);
  // The legend in share order (the H1 names the two most common first); each type keeps its own index for its colour.
  const ranked = types.map((t, i) => ({ t, i })).sort((a, b) => b.t.share - a.t.share);
  const bands = data.river;
  const width = bands.length > 1 ? bands[1].lo_min - bands[0].lo_min : 15;
  // The type finder's heading is its example's reading, from the same classifier the finder runs on a reader's times.
  const example = classifyTimes(EXAMPLE.map(parseClock), data.classifier);
  const exampleType = example ? types[example.best] : null;
  const finishSeconds = parseClock(EXAMPLE[8]);
  // The example's mat times are the finder's starting point, not a recorded finish, so the beat says it is an example
  // where it is read (round 6: "This 3:51" read as someone's race): the H2 gives its type, the dek what it is.
  const youTitle = exampleType
    ? `These splits make ${/^[AEIOU]/i.test(exampleType.name) ? 'an' : 'a'} *${typeName(exampleType.name)}*, the shape of ${pct(exampleType.share)} of finishes.`
    : 'Your pacing type, from your splits.';
  const youDek = exampleType && finishSeconds !== null ? `An example race, finished in ${hm(Math.floor(finishSeconds / 60))}.` : undefined;

  return (
    <StoryPage path={PATH} numbers={[
      <Values key="river" bare id="pt-river" caption="Each type's share of finishes, by finish time"
        columns={[{ key: 'b', label: 'Finish time' }, ...types.map((t) => ({ key: t.slug, label: t.name }))]}
        rows={bands.map((b) => [b.label, ...b.shares.map((s) => pct(s))])} />,
    ]}>
      {/* The H1 names the two most common types; the line under it continues the home page's guess; the figure gives
          the two types' share together, its unit line what that is out of (every finish, six types), and the legend
          marks the two in ink among the six. */}
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={second.guard ? <Say nugget={second} /> : undefined}
        figure={lead.figure ? { ...lead.figure } : undefined} unitLine={lead.figure ? `of finishes, the two most common of ${countWord(types.length)} pacing types` : undefined} fallback={!lead.guard}
        // The figure and its unit line say the finding; only with no figure does the sentence stand in for them.
        sentence={lead.figure ? undefined : <Say nugget={lead} />}
        instrument={(
          <ul className={`type-legend${lead.guard ? ' has-lead' : ''}`} aria-label={`The ${types.length} pacing types and their shares of finishes`}>
            {ranked.map(({ t, i }) => (
              <li key={t.slug} className={lead.guard && (t.name === lead.values.first || t.name === lead.values.second) ? 'is-lead' : undefined}>
                <TypeGlyph profile={t.profile} index={i} domain={domain} /><span>{t.name}</span><b>{pct(t.share)}</b>
              </li>
            ))}
          </ul>
        )} />

      <Beat id="river" track="chapter-1" label="Who runs which way" title={river} aliases={['six', 'barcode', 'courses']}>
        <TypeRiver bands={bands.map((b) => ({ x: b.lo_min + width / 2, shares: b.shares }))}
          types={types.map((t, i) => ({ id: t.slug, name: t.name, index: i }))} subject={even}
          ticks={[180, 240, 300, 360].filter((v) => v > bands[0].lo_min && v < bands[bands.length - 1].lo_min + width).map((v) => ({ value: v, label: hm(v) }))}
          label={`Each pacing type's share of finishes, by finish time. ${types[even].name}s: ${pct(bands[0].shares[even])} of ${bands[0].label} finishes, ${pct(bands[bands.length - 1].shares[even])} of ${bands[bands.length - 1].label}.`} />
      </Beat>

      {/* The women-and-men beat is chapter 07's: an old link to it lands on this line, which shows only then. */}
      <Moved id="gender" href="/stories/who-holds-pace">Women and men, at the same finish times, are now chapter 07: Who holds pace.</Moved>

      <Beat id="you" track="chapter-2" label="Your type" title={rich(youTitle)} dek={youDek} aliases={['habits']}>
        <WhichArchetype initial={EXAMPLE}
          data={{ types: types.map((t) => ({ name: t.name, share: t.share, profile: t.profile })), domain,
            classifier: { clip_lo: data.classifier.clip_lo, clip_hi: data.classifier.clip_hi, weights: data.classifier.weights, centroids: data.classifier.centroids } }} />
      </Beat>
    </StoryPage>
  );
}
