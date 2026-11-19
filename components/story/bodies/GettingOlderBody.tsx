import { getNugget } from '@/lib/nuggets';
import { AGE_PATH, ageBandWords, linkedFiles, signedPct, signedPoints } from '@/lib/nuggets/linked';
import { count, pct } from '@/lib/nuggets/format';
import { STORIES } from '@/lib/stories';
import LineProfile from '@/components/viz/LineProfile';
import Dumbbell from '@/components/viz/Dumbbell';
import Values from '@/components/ui/Values';
import IntervalRows from '@/components/linked/IntervalRows';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';
import { againRow, pointTicks } from './RecordedBestsBody';

const LINKED_HREF = '/methodology#linked-records';

/**
 * Getting older: the same linked runner from one recorded marathon to the next, as a change per year, by age band, for
 * runners with three or more recorded marathons who kept racing (age.json's main column; an age from an age group is
 * never used). The reading is the 50 to 54 band (the contract's example); then the recorded men against different men
 * of the same age (the cross-section); then who is recorded at another marathon by age at the race. The survivorship
 * check is one sentence on /methodology, not here. "Not a prediction".
 */
export default function GettingOlderBody() {
  const story = STORIES.find((s) => s.slug === 'getting-older')!;
  const age = linkedFiles.age(), again = linkedFiles.again();
  const fifty = getNugget('age.fifty'), across = getNugget('age.across'), byAge = getNugget('again.age');
  // A band shows its rate only under its own verdict; a band without one shows its count in All numbers and no rate.
  const bands = age.bands.filter((b) => b.verdict === 'stated');
  const words = (b: { age_from: number; age_to: number }) => ageBandWords(b);
  const i50 = bands.findIndex((b) => b.age_from === 50);
  const lo = Math.floor(Math.min(0, ...bands.map((b) => b.median_pct_per_year))), hi = Math.ceil(Math.max(...bands.map((b) => b.median_pct_per_year)));
  const men = age.bands.filter((b) => b.age_from >= 45 && b.verdict === 'stated' && b.by_sex.M && b.cross_section.M);
  const ageRows = again.by_age_band.map((r) => againRow(r, ageBandWords({ age_from: r.age_from!, age_to: r.age_to! })));
  const scale = pointTicks(ageRows);

  return (
    <StoryPage path={AGE_PATH} numbers={[
      <Values key="bands" bare id="go-bands" caption="Change per year from one recorded marathon to the next, linked runners with three or more who kept racing (plus is slower)"
        columns={[{ key: 'a', label: 'Age', text: true }, { key: 'm', label: 'Typical per year' }, { key: 's', label: 'Same race' }, { key: 'p', label: 'Pairs' }]}
        rows={age.bands.map((b) => [words(b), b.verdict ? signedPct(b.median_pct_per_year) : '—', b.verdict ? signedPct(b.same_race.median_pct_per_year) : '—', count(b.pairs)])} />,
      <Values key="men" bare id="go-men" caption="Recorded men: the same men a year later, and different men of the same age"
        columns={[{ key: 'a', label: 'Age', text: true }, { key: 'f', label: 'Same men, per year' }, { key: 'x', label: 'Different men, per year' }]}
        rows={men.map((b) => [words(b), signedPct(b.by_sex.M!.median_pct_per_year), signedPct(b.cross_section.M!.pct_per_year)])} />,
      <Values key="again" bare id="go-again" caption="Recorded at another marathon within two years, by age at the race, against the other finishes of the same races"
        columns={[{ key: 'a', label: 'Age', text: true }, { key: 's', label: 'Recorded again' }, { key: 'e', label: 'Other finishes, same races' }, { key: 'd', label: 'Difference' }, { key: 'n', label: 'Finishes' }]}
        rows={again.by_age_band.map((r) => [ageBandWords({ age_from: r.age_from!, age_to: r.age_to! }), pct(r.share), pct(r.expected_share), r.verdict ? signedPoints(r.difference_points) : 'No reading', count(r.finishes)])} />,
    ]}>
      <StoryHero path={AGE_PATH} title={story.heading ?? story.title} stacked
        figure={fifty.figure ? { ...fifty.figure } : undefined} fallback={!fifty.guard}
        unitLine={fifty.guard
          ? <>slower per year at 50 to 54: the typical change from one recorded marathon to the next, for runners whose <Link href={LINKED_HREF} className="term-link">records are linked by name</Link>, with three or more, who kept racing. Not a prediction.</>
          : undefined}
        sentence={fifty.guard ? undefined : <Say nugget={fifty} />}
        instrument={bands.length >= 3 ? (
          <LineProfile x={bands.map((_, i) => i)} xDomain={[0, bands.length - 1]} yDomain={[lo, hi]}
            layers={[{ id: 'age', label: 'Per year', series: [{ id: 'a', values: bands.map((b) => b.median_pct_per_year), fillAbove: 0, fillTone: 'quiet' }],
              points: i50 >= 0 && fifty.guard ? [{ x: i50, y: bands[i50].median_pct_per_year, kind: 'reading' }] : [] }]}
            refs={[{ value: 0, label: 'No change' }]}
            xTicks={bands.map((b, i) => ({ value: i, label: b.age_to >= 85 ? `${b.age_from}+` : String(b.age_from), priority: i === i50 ? 3 : i === 0 || i === bands.length - 1 ? 2 : 1 }))}
            yTicks={[{ value: hi, label: `+${hi}%` }]}
            axisTitle={{ start: 'Younger', end: 'Older' }}
            scrub={{ label: 'Age', follow: 'a', initial: Math.max(0, i50), detents: i50 >= 0 ? [i50] : [0],
              points: { x: bands.map((_, i) => i / (bands.length - 1)), keys: bands.map((b) => `Aged ${words(b)}, per year`), values: bands.map((b) => signedPct(b.median_pct_per_year)),
                side: [{ label: 'Pairs', values: bands.map((b) => count(b.pairs)) }] } }}
            label={`Typical change per year from one recorded marathon to the next, by age, linked runners who kept racing: ${bands.map((b) => `${words(b)} ${signedPct(b.median_pct_per_year)}`).join(', ')}.`} />
        ) : undefined} />

      <Beat id="across" track="chapter-1" label="Same men, different men" title={across}
        dek="Recorded men, per year of age: the same men a year later, and different men of the same age.">
        <Dumbbell rows={men.map((b) => ({ id: String(b.age_from), label: words(b), a: b.cross_section.M!.pct_per_year, b: b.by_sex.M!.median_pct_per_year,
          display: `${signedPct(b.cross_section.M!.pct_per_year)} · ${signedPct(b.by_sex.M!.median_pct_per_year)}` }))}
          domain={[0, Math.ceil(Math.max(...men.map((b) => b.by_sex.M!.median_pct_per_year)))]}
          ticks={[0, 1, 2, 3].filter((t) => t <= Math.ceil(Math.max(...men.map((b) => b.by_sex.M!.median_pct_per_year)))).map((t) => ({ value: t, label: t === 0 ? '0%' : `+${t}%` }))}
          keyLabels={{ a: 'Different men', b: 'Same men' }} keyFirst
          label={`Recorded men per year of age, different men against the same men: ${men.map((b) => `${words(b)} ${signedPct(b.cross_section.M!.pct_per_year)} against ${signedPct(b.by_sex.M!.median_pct_per_year)}`).join('; ')}.`} />
      </Beat>

      <Beat id="again" track="chapter-2" label="Recorded again" title={byAge}
        dek="Another recorded marathon within two years, by age at the race, against the other finishes of the same races.">
        <IntervalRows rows={ageRows} domain={scale.domain} ticks={scale.ticks} zeroLabel="Other finishes of the same races (points)"
          label={`Recorded at another marathon within two years, by age, against the other finishes of the same races: ${ageRows.map((r) => `${r.label} ${r.words}`).join('; ')}.`} />
      </Beat>
    </StoryPage>
  );
}
