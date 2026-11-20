import { getLinkedRaces } from '@/lib/linked-server';
import { getNugget } from '@/lib/nuggets';
import { raceReadings, RACES_PATH, signedPct } from '@/lib/nuggets/linked';
import { count } from '@/lib/nuggets/format';
import { STORIES } from '@/lib/stories';
import ShareBar from '@/components/viz/ShareBar';
import Values from '@/components/ui/Values';
import IntervalRows, { type IntervalRow } from '@/components/linked/IntervalRows';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { Beat, Say, StoryHero, StoryPage } from '../StoryPage';

const LINKED_HREF = '/methodology#linked-records';
const WORDS = { faster: 'Faster', slower: 'Slower', about_the_same: 'About the same' } as const;

/**
 * Race to race: how linked runners' times at one race compare with their times at the other races of the same years,
 * each race with its interval, in label order (never ranked, never a time to convert). The reading counts the races by
 * verdict; the beat lists every race. A race without a verdict shows its interval and the words "No reading", never a
 * number. Trail and mountain courses (the registry's flag) are set apart at the end.
 */
export default function RaceToRaceBody() {
  const story = STORIES.find((s) => s.slug === 'race-to-race')!;
  const races = getLinkedRaces().data;
  const faster = getNugget('races.faster');
  const v = faster.values as Record<string, number>;

  const readings = raceReadings(races);
  const road = readings.filter((x) => !x.row.trail_or_mountain), trail = readings.filter((x) => x.row.trail_or_mountain);
  // A label that holds two reviewed series reads each series as its own race (D29): its row names that race and the
  // years it covers, from the file (Warsaw's row is the Orlen Warsaw Marathon alone, 2015–2018: the PZU Warsaw
  // Marathon has no reading here), so it never reads as the whole label (re-review m5, November 20, 2026).
  const span = ([a, b]: [number, number]) => (a === b ? String(a) : `${a}–${b}`);
  const name = (x: (typeof readings)[number]) => (x.series ? `${x.label} · ${x.series}, ${span(x.row.years)}` : x.label);
  const rows: IntervalRow[] = [...road, ...trail].map((x) => {
    const r = x.row;
    return {
      id: x.series ? `${x.label}|${x.series}` : x.label, label: name(x), lo: r.lo_pct, hi: r.hi_pct,
      value: r.verdict ? r.reading_pct : null,
      words: r.verdict ? `${WORDS[r.verdict]} · ${signedPct(r.reading_pct)}` : 'No reading',
      tone: r.verdict === 'about_the_same' ? 'quiet' : r.verdict ? 'ink' : 'none',
    };
  });
  const groups = trail.length ? { [trail[0].series ? `${trail[0].label}|${trail[0].series}` : trail[0].label]: 'Trail and mountain courses' } : undefined;
  const lo = Math.floor(Math.min(...rows.map((r) => r.lo)) / 5) * 5, hi = Math.ceil(Math.max(...rows.map((r) => r.hi)) / 5) * 5;
  const ticks = [] as { value: number; label: string }[];
  for (let t = lo; t <= hi; t += 5) ticks.push({ value: t, label: t === 0 ? '0' : signedPct(t, 0) });

  const segments = [
    { id: 'faster', label: 'Faster', share: v.faster / v.readings, display: count(v.faster), tone: 1 as const },
    { id: 'same', label: 'About the same', share: v.about_the_same / v.readings, display: count(v.about_the_same), tone: 3 as const },
    { id: 'slower', label: 'Slower', share: v.slower / v.readings, display: count(v.slower), tone: 2 as const },
    { id: 'none', label: 'No reading', share: v.no_verdict / v.readings, display: count(v.no_verdict), tone: 'quiet' as const },
  ];

  return (
    <StoryPage path={RACES_PATH} numbers={[
      <Values key="races" bare id="rr-races" caption="Each race against the other races of the same years, for linked runners (minus is faster), in alphabetical order"
        columns={[{ key: 'r', label: 'Race', text: true }, { key: 'v', label: 'Reading' }, { key: 'i', label: 'Interval' }, { key: 'w', label: 'Verdict', text: true }, { key: 'e', label: 'Years' }, { key: 'f', label: 'Results' }]}
        rows={readings.map((x) => [name(x), x.row.verdict ? signedPct(x.row.reading_pct) : '—', `${signedPct(x.row.lo_pct)} to ${signedPct(x.row.hi_pct)}`, x.row.verdict ? WORDS[x.row.verdict] : 'No reading', String(x.row.editions), count(x.row.finishes)])} />,
    ]}>
      <StoryHero path={RACES_PATH} title={story.heading ?? story.title} stacked
        figure={faster.figure ? { ...faster.figure } : undefined} fallback={!faster.guard}
        unitLine={faster.guard
          ? <>races where runners whose <Link href={LINKED_HREF} className="term-link">records are linked by name</Link> finished faster than at the other races of the same years</>
          : undefined}
        sentence={faster.guard ? undefined : <Say nugget={faster} />}
        instrument={faster.guard ? <ShareBar segments={segments} labels="under" label={`Of ${count(v.readings)} races: ${segments.map((s) => `${s.label.toLowerCase()} ${s.display}`).join(', ')}.`} /> : undefined} />

      <Beat id="races" track="chapter-1" label="Every race" title="Every race, against the other races of its years"
        dek="Not a ranking, and not a time converter. Minus is faster; races in alphabetical order.">
        <IntervalRows rows={rows} domain={[lo, hi]} ticks={ticks} groups={groups} zeroLabel="Other races of the same years"
          label={`Each race's reading for linked runners against the other races of the same years, with its interval, in alphabetical order. ${count(v.faster)} faster, ${count(v.slower)} slower, ${count(v.about_the_same)} about the same, ${count(v.no_verdict)} without a reading.`} />
      </Beat>
    </StoryPage>
  );
}
