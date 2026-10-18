import type { Archetypes } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { evenestType } from '@/lib/nuggets/stories';
import { hm, pct } from '@/lib/nuggets/format';
import Dumbbell from '@/components/viz/Dumbbell';
import TypeGlyph from '@/components/viz/TypeGlyph';
import Values from '@/components/ui/Values';
import TypeRiver from '../charts/TypeRiver';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';
import { WhichArchetype } from '../ArchetypeStory';

const PATH = '/stories/pacing-types';
/** The mat times the type finder opens on: an even-ish 3:51 that fades late. */
const EXAMPLE = ['0:25:30', '0:51:00', '1:16:40', '1:42:30', '2:08:50', '2:36:10', '3:05:00', '3:36:00', '3:51:00'];

/**
 * Six ways to run the same race (the redesign spec, section 7.5, under section 00): the reading (the evenest shape's
 * share of finishes, the page's reading on the contents too) with the six shapes as glyphs and that one marked, then
 * three beats: who runs which shape as the clock runs, the
 * type that men's finishes ran most often against women's, and the reader's own type. The animated six-runner race,
 * the barcode and the habits beat are cut (the habits are chapter 11's subject); their anchors land on these beats.
 */
export default function PacingTypesBody() {
  const data = readInsight<Archetypes>('archetypes.json');
  const story = STORIES.find((s) => s.slug === 'pacing-types')!;
  const lead = getNugget('types.metronome'), river = getNugget('types.river'), gender = getNugget('types.gender');
  const types = data.archetypes;
  const all = types.flatMap((t) => t.profile);
  const domain: [number, number] = [Math.min(...all), Math.max(...all)];
  const even = evenestType(types);
  const w = data.gender.women.standardized_shares, m = data.gender.men.standardized_shares;
  const subject = types.findIndex((t) => t.name === gender.values.type);
  const hiShare = Math.ceil(Math.max(...w, ...m) * 10) / 10;
  const bands = data.river;
  const width = bands.length > 1 ? bands[1].lo_min - bands[0].lo_min : 15;

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={lead.figure ? { ...lead.figure } : undefined} sentence={<Say nugget={lead} />} fallback={!lead.guard}
        instrument={(
          <ul className="type-legend" aria-label={`The ${types.length} pacing types and their shares of finishes`}>
            {types.map((t, i) => (
              <li key={t.slug} className={i === even ? 'is-reading' : undefined}><TypeGlyph profile={t.profile} index={i} domain={domain} /><span>{t.name}</span><b>{pct(t.share)}</b></li>
            ))}
          </ul>
        )} />

      <Beat id="river" track="chapter-1" label="Who runs which way" title={river} aliases={['six', 'barcode', 'courses']}>
        <TypeRiver bands={bands.map((b) => ({ x: b.lo_min + width / 2, shares: b.shares }))}
          types={types.map((t, i) => ({ id: t.slug, name: t.name, index: i }))} initial={types[even].slug}
          ticks={[180, 240, 300, 360].filter((v) => v > bands[0].lo_min && v < bands[bands.length - 1].lo_min + width).map((v) => ({ value: v, label: hm(v) }))}
          label={`Each pacing type's share of finishes, by finish time. ${types[even].name}s: ${pct(bands[0].shares[even])} of ${bands[0].label} finishes, ${pct(bands[bands.length - 1].shares[even])} of ${bands[bands.length - 1].label}.`}
          values={(
            <Values id="pt-river" caption="Each type's share of finishes, by finish time"
              columns={[{ key: 'b', label: 'Finish time' }, ...types.map((t) => ({ key: t.slug, label: t.name }))]}
              rows={bands.map((b) => [b.label, ...b.shares.map((s) => pct(s))])} />
          )} />
      </Beat>

      {/* The H2 is about recorded men (the filled dots), so the key above the rows and each row's values read men first. */}
      <Beat id="gender" track="chapter-2" label="Women and men" title={gender} className="pt-gender">
        <Dumbbell rows={types.map((t, i) => ({ id: t.slug, label: t.name, a: w[i], b: m[i], display: `${pct(m[i])} · ${pct(w[i])}`, highlight: i === subject }))}
          domain={[0, hiShare]} ticks={[0, hiShare / 2, hiShare].map((v) => ({ value: v, label: pct(v) }))}
          keyLabels={{ a: 'Recorded women', b: 'Recorded men' }}
          label={`Each type's share of recorded women's and men's finishes at the same finish times. ${gender.values.type}s: ${pct(Number(gender.values.women), 1)} of women's, ${pct(Number(gender.values.men), 1)} of men's.`}
          values={(
            <Values id="pt-gender" caption="Share of recorded men’s and women’s finishes by type, at the same finish times"
              columns={[{ key: 't', label: 'Type', text: true }, { key: 'm', label: 'Men' }, { key: 'w', label: 'Women' }]}
              rows={types.map((t, i) => [t.name, pct(m[i], 1), pct(w[i], 1)])} reading={subject} />
          )} />
      </Beat>

      <Beat id="you" track="chapter-3" label="Your type" title={<>Which runner <em>were you</em>?</>} aliases={['habits']}>
        <WhichArchetype initial={EXAMPLE}
          data={{ types: types.map((t) => ({ name: t.name, share: t.share, profile: t.profile })), domain,
            classifier: { clip_lo: data.classifier.clip_lo, clip_hi: data.classifier.clip_hi, weights: data.classifier.weights, centroids: data.classifier.centroids } }} />
      </Beat>
    </StoryPage>
  );
}
