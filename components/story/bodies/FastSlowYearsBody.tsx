import { getLinkedEditions } from '@/lib/linked-server';
import type { LinkedEditionRow } from '@/lib/linked-types';
import { getNugget } from '@/lib/nuggets';
import { linkedFiles, signedPct, YEARS_PATH } from '@/lib/nuggets/linked';
import { pct, temp } from '@/lib/nuggets/format';
import { STORIES } from '@/lib/stories';
import { inline, tierWords } from '@/lib/tiers';
import type { UnitSystem } from '@/lib/units';
import YearStrip, { type YearPoint } from '@/components/viz/YearStrip';
import LineProfile from '@/components/viz/LineProfile';
import Scatter from '@/components/viz/Scatter';
import Values from '@/components/ui/Values';
import ByUnits from '@/components/ui/ByUnits.client';
import RacePicker from '@/components/linked/RacePicker.client';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';

const LINKED_HREF = '/methodology#linked-records';
const REVIEW_HREF = '/methodology#linked-reviews';
const UNITS: UnitSystem[] = ['mi', 'km'];
const WORDS = { slow: 'Slow year', fast: 'Fast year', usual: 'Usual year' } as const;

/** The years a page may read: chip- or net-timed editions with a verdict (a year without one states nothing). */
const readable = (years: Record<string, LinkedEditionRow>) => Object.entries(years)
  .filter(([, r]) => r.basis === 'chip_or_net' && r.verdict !== null)
  .map(([year, r]) => ({ year: Number(year), r }))
  .sort((a, b) => a.year - b.year);

/**
 * Fast years and slow years (chapter 10's opener): each year of a race against the race's other years, for runners
 * whose records are linked by name. The reading is the share of race-years more than 2% off (the contract's one
 * finding); its instrument is the race picker over every race's years (default: the race with the most readings).
 * Then two beats of evidence beside the readings, never a cause: warm race windows, and the whole field's sustained
 * slowdowns in the same years (the check that no person link enters).
 */
export default function FastSlowYearsBody() {
  const story = STORIES.find((s) => s.slug === 'fast-and-slow-years')!;
  const editions = getLinkedEditions().data;
  const checks = linkedFiles.checks();
  const beyond = getNugget('years.beyond'), heat = getNugget('years.heat'), field = getNugget('years.field');

  // The races a reader can pick: those with at least one readable year, in label order; the default has the most
  // readings (every edition row of the file), the first in label order on a tie.
  const labels = Object.keys(editions.races).sort((a, b) => a.localeCompare(b, 'en'));
  const pickable = labels.filter((l) => readable(editions.races[l]).length > 0);
  const initial = pickable.reduce((best, l) => (Object.keys(editions.races[l]).length > Object.keys(editions.races[best]).length ? l : best), pickable[0]);

  const panel = (label: string) => {
    const years = readable(editions.races[label]);
    const points: YearPoint[] = years.map(({ year, r }) => ({
      year, value: r.reading_pct, display: signedPct(r.reading_pct),
      side: [`${signedPct(r.lo_pct)} to ${signedPct(r.hi_pct)}`, `${WORDS[r.verdict!]}${r.reviewed_release ? ', after review' : ''}`],
    }));
    const lo = Math.min(-3, ...years.map(({ r }) => Math.floor(r.reading_pct))), hi = Math.max(3, ...years.map(({ r }) => Math.ceil(r.reading_pct)));
    // The strip opens on its highest year, an extreme whose own label then hides under the needle (a label beside the
    // resting needle crossed it at 195 px).
    const latest = years.reduce((a, b) => (b.r.reading_pct > a.r.reading_pct ? b : a)).year;
    const reviewed = years.filter(({ r }) => r.reviewed_release);
    // A label that holds two races (a series note): each series with its first and last year in the file.
    const series = [...new Set(Object.values(editions.races[label]).map((r) => r.series).filter((x): x is string => !!x))].map((name) => {
      const ys = Object.entries(editions.races[label]).filter(([, r]) => r.series === name).map(([y]) => Number(y));
      return `the ${name}, ${Math.min(...ys)}–${Math.max(...ys)}`;
    });
    return (
      <div key={label} data-race={label} hidden={label !== initial} className="linked-panel">
        <YearStrip editions={points} selected={latest} valueDomain={[lo, hi]} average={0} averageLabel="Its other years" averageOnLine
          gaps="no reading" sideLabels={['Interval', 'Verdict']} height={150} heightMd={200}
          label={`${label}: each year with a reading, for linked runners, against the race’s other years. Plus is slower.`} />
        {reviewed.length ? (
          <p className="linked-panel-note">{reviewed.map(({ year }) => year).join(', ')}: {inline(tierWords('held_for_review'))}, then released by a <Link href={REVIEW_HREF}>written review</Link>.</p>
        ) : null}
        {series.length > 1 ? <p className="linked-panel-note">Two races under one name, {series.join(' and ')}: each year is read against its own race’s other years.</p> : null}
      </div>
    );
  };

  // #heat: the five temperature bands of the race window, each the mean of its years against their race's own mean.
  const bands = checks.temperature.bands.filter((b) => b.mean_pct !== null && b.editions >= 3);
  const bandName = (b: (typeof bands)[number], u: UnitSystem) => (b.temp_from === null ? `Under ${temp(b.temp_to!, u)}` : b.temp_to === null ? `${temp(b.temp_from, u)}+` : `${temp(b.temp_from, u)}–${temp(b.temp_to, u)}`);
  const span = Math.max(2, ...bands.map((b) => Math.ceil(Math.abs(b.mean_pct!)))) + 1;
  const heatChart = (u: UnitSystem) => (
    <LineProfile x={bands.map((_, i) => i)} xDomain={[0, bands.length - 1]} yDomain={[-span, span]}
      layers={[{ id: 'heat', label: 'Years', series: [{ id: 'h', values: bands.map((b) => b.mean_pct!), fillAbove: 0, fillTone: 'quiet' }],
        points: heat.guard ? [{ x: bands.length - 1, y: bands[bands.length - 1].mean_pct!, kind: 'compare' }] : [],
        labels: heat.guard ? [{ x: bands.length - 1, y: bands[bands.length - 1].mean_pct!, text: signedPct(bands[bands.length - 1].mean_pct!, 0), tone: 'ink', priority: 3, prefer: 'above' }] : [] }]}
      refs={[{ value: 0, label: 'The race’s usual' }]}
      xTicks={bands.map((b, i) => ({ value: i, label: bandName(b, u) }))}
      scrub={{ label: 'Race temperature', points: { x: bands.map((_, i) => i / (bands.length - 1)), keys: bands.map((b) => `Years at ${bandName(b, u)}`), values: bands.map((b) => signedPct(b.mean_pct!)),
        side: [{ label: 'Race-years', values: bands.map((b) => String(b.editions)) }] }, initial: bands.length - 1, detents: [0, bands.length - 1], follow: 'h' }}
      label={`Linked runners’ years against their race’s usual, by the race’s temperature: ${bands.map((b) => `${bandName(b, u)} ${signedPct(b.mean_pct!)}`).join(', ')}.`} />
  );

  // #field: one race, year by year (the default race): its readable years against the whole field's sustained-slowdown
  // share that year, a share of finishes that no person link enters. The H2 is the check over every race.
  const fieldPoints = checks.slowdown.points.filter((p) => p.label === initial && p.basis === 'chip_or_net');
  const fieldYears = readable(editions.races[initial]).filter(({ year }) => fieldPoints.some((p) => p.year === year));
  const sharesOf = new Map(fieldPoints.map((p) => [p.year, p.slow / p.eligible]));
  const xs = fieldYears.map(({ year }) => sharesOf.get(year)!), ys = fieldYears.map(({ r }) => r.reading_pct);
  const x0 = Math.floor(Math.min(...xs) * 20) / 20, x1 = Math.ceil(Math.max(...xs) * 20) / 20;
  const y0 = Math.min(-2, Math.floor(Math.min(...ys))), y1 = Math.max(2, Math.ceil(Math.max(...ys)));
  const xTicks = [] as { value: number; label: string }[];
  for (let v = x0; v <= x1 + 1e-9; v += 0.05) xTicks.push({ value: v, label: pct(v) });

  const all = labels.flatMap((l) => readable(editions.races[l]).map(({ year, r }) => [l, String(year), signedPct(r.reading_pct), `${signedPct(r.lo_pct)} to ${signedPct(r.hi_pct)}`, WORDS[r.verdict!]]));

  return (
    <StoryPage path={YEARS_PATH} numbers={[
      <Values key="years" bare id="fy-years" caption="Each year with a reading against the race’s other years, for linked runners (plus is slower)"
        columns={[{ key: 'r', label: 'Race', text: true }, { key: 'y', label: 'Year' }, { key: 'v', label: 'Reading' }, { key: 'i', label: 'Interval' }, { key: 'w', label: 'Verdict', text: true }]}
        rows={all} />,
      <ByUnits key="heat" {...Object.fromEntries(UNITS.map((u) => [u, (
        <Values key={u} bare id={`fy-heat-${u}`} caption="Years against their race’s usual, by the race’s temperature"
          columns={[{ key: 't', label: 'Race temperature', text: true }, { key: 'v', label: 'Against usual' }, { key: 'n', label: 'Race-years' }]}
          rows={bands.map((b) => [bandName(b, u), signedPct(b.mean_pct!), String(b.editions)])} />
      )])) as { mi: JSX.Element; km: JSX.Element }} />,
    ]}>
      <StoryHero path={YEARS_PATH} title={story.heading ?? story.title} stacked
        figure={beyond.figure ? { ...beyond.figure } : undefined} fallback={!beyond.guard}
        unitLine={beyond.guard
          ? <>of race-years, runners whose <Link href={LINKED_HREF} className="term-link">records are linked by name</Link> finished more than 2% faster or slower than in the race’s other years</>
          : undefined}
        sentence={beyond.guard ? undefined : <Say nugget={beyond} />}
        instrument={(
          <RacePicker label="Race" initial={initial} options={pickable.map((l) => ({ value: l, label: l }))}>
            {pickable.map(panel)}
          </RacePicker>
        )} />

      <Beat id="heat" track="chapter-1" label="Warm years" title={heat}
        dek="Each year against its race’s usual, by the race’s temperature. No weather enters the readings.">
        <ByUnits mi={heatChart('mi')} km={heatChart('km')} />
      </Beat>

      <Beat id="field" track="chapter-2" label="The whole field" title={field}
        dek={`${initial}, year by year: linked runners’ reading against the share of the whole field with a sustained slowdown.`}>
        <Scatter points={fieldYears.map(({ year, r }, i) => ({ id: String(year), x: xs[i], y: r.reading_pct, label: String(year), key: `${initial} ${year}`, value: signedPct(r.reading_pct) }))}
          xDomain={[x0, x1]} yDomain={[y0, y1]} pairLine={false} labelAll={false}
          xTicks={xTicks} yTicks={[{ value: y1, label: signedPct(y1, 0) }, { value: 0, label: '0%' }, { value: y0, label: signedPct(y0, 0) }]}
          axisTitle={{ start: 'Fewer sustained slowdowns', end: 'More' }}
          side={[{ label: 'Whole field, sustained slowdown', values: xs.map((v) => pct(v)) }]}
          prompt="Choose a year to read it."
          label={`${initial}: each year’s reading for linked runners against the whole field’s sustained-slowdown share that year.`} />
      </Beat>
    </StoryPage>
  );
}
