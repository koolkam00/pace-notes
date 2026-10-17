import type { Archetypes, Courses } from '@/lib/insights';
import { readInsight } from '@/lib/insights-server';
import { STORIES } from '@/lib/stories';
import { getNugget } from '@/lib/nuggets';
import { evenestType, sectionName } from '@/lib/nuggets/stories';
import { count, pct } from '@/lib/nuggets/format';
import LineProfile from '@/components/viz/LineProfile';
import DotStrip from '@/components/viz/DotStrip';
import Values from '@/components/ui/Values';
import NameThatCourse, { type Round } from '../NameThatCourse.client';
import { Beat, Moved, Say, StoryHero, StoryPage } from '../StoryPage';

const PATH = '/stories/courses';
const MID = [2.5, 7.5, 12.5, 17.5, 22.5, 27.5, 32.5, 37.5, 41.1];
const MINUS = '−';
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)}%`;
const ROUNDS = 5;

/** The game's rounds: the largest edition of each course with five or more tested editions, the courses with the most
 * finishes first; the choices are the right course, the model's pick and the course whose own shape is nearest. */
function rounds(data: Courses): Round[] {
  const id = data.identification;
  const tested = new Map(id.per_course.map((p) => [p.city, p.editions]));
  const shapes = new Map(data.courses.filter((c) => c.signature?.length === 9).map((c) => [c.city, c.signature!]));
  const finishes = new Map(data.courses.map((c) => [c.city, c.finishes]));
  const dist = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
  const cities = [...tested.entries()].filter(([city, n]) => n >= 5 && shapes.has(city)).map(([city]) => city)
    .sort((a, b) => (finishes.get(b) ?? 0) - (finishes.get(a) ?? 0)).slice(0, ROUNDS);
  return cities.map((city) => {
    const e = id.editions.filter((x) => x.city === city).reduce((a, b) => (b.n > a.n ? b : a));
    const near = [...shapes.entries()].filter(([c]) => c !== city && c !== e.predicted).sort((a, b) => dist(a[1], e.signature) - dist(b[1], e.signature)).map(([c]) => c);
    const options = [...new Set([city, e.predicted, ...near])].slice(0, 3).sort((a, b) => a.localeCompare(b, 'en'));
    return { year: e.year, answer: city, model: e.predicted, options, signature: e.signature };
  });
}

/**
 * Every course has a fingerprint (the redesign spec, section 7.10, under section 00): the reading (a course named from
 * its pacing shape alone, against chance in its sentence), then the shape of a race course by course, the game, and how steady the field ran on each
 * course. The weather beats moved to /stories/race-morning and the years to /finish-times#front; their old anchors hold
 * a line that shows only when a link lands there. The matched-pace deck and the hills are cut (the course comparison
 * and hills analyses carry them).
 */
export default function CoursesBody() {
  const data = readInsight<Courses>('courses.json');
  const types = readInsight<Archetypes>('archetypes.json');
  const story = STORIES.find((s) => s.slug === 'courses')!;
  const named = getNugget('courses.named'), slowest = getNugget('courses.slowest'), steady = getNugget('courses.steady');

  // Fingerprints: the typical course, and each course's own curve against its average pace, one at a time.
  const shaped = data.courses.filter((c) => c.curve?.length === 9).sort((a, b) => b.finishes - a.finishes);
  const all = [...data.typical_curve, ...shaped.flatMap((c) => c.curve!)];
  const lo = Math.floor(Math.min(...all)), hi = Math.ceil(Math.max(...all));
  const slowAt = (curve: number[]) => curve.indexOf(Math.max(...curve));
  const typicalSlow = slowAt(data.typical_curve);
  const layers = [
    { id: 'typical', label: 'Typical', series: [{ id: 't', values: data.typical_curve, dashed: true }],
      points: [{ x: MID[typicalSlow], y: data.typical_curve[typicalSlow], kind: 'reading' as const }],
      labels: [{ x: MID[typicalSlow], y: data.typical_curve[typicalSlow], text: `${sectionName(data.sections[typicalSlow])} ${signed(data.typical_curve[typicalSlow])}`, tone: 'signal' as const, priority: 3 }] },
    ...shaped.map((c) => {
      const k = slowAt(c.curve!);
      return { id: c.city, label: c.city,
        series: [{ id: 't', values: data.typical_curve, dashed: true }, { id: 'c', values: c.curve!, tone: 'ink' as const }],
        labels: [{ x: MID[k], y: c.curve![k], text: `${sectionName(data.sections[k])} ${signed(c.curve![k])}`, tone: 'ink' as const, priority: 3 }] };
    }),
  ];

  // How steady: the evenest type's share of finishes on each course with 10,000 or more finishes.
  const even = evenestType(types.archetypes);
  const big = types.courses.filter((c) => c.finishes >= 10000);
  const sLo = Math.floor(Math.min(...big.map((c) => c.shares[even])) * 10) / 10, sHi = Math.ceil(Math.max(...big.map((c) => c.shares[even])) * 10) / 10;
  const evenName = types.archetypes[even].name;

  const game = rounds(data);
  const shapes = Object.fromEntries(data.courses.filter((c) => c.signature?.length === 9).map((c) => [c.city, c.signature!]));

  return (
    <StoryPage path={PATH}>
      <StoryHero path={PATH} title={story.heading ?? story.title} dek={story.dek}
        figure={named.figure ? { ...named.figure } : undefined} fallback={!named.guard} sentence={<Say nugget={named} />} />

      <Beat id="fingerprint" track="chapter-1" label="The fingerprint" title={slowest}>
        <LineProfile x={MID} xDomain={[0, 42.195]} yDomain={[lo - 1, hi + 1]} layers={layers} initial="typical" lensLabel="Course" chips
          refs={[{ value: 0, label: 'Own average pace' }]}
          xTicks={[{ value: 0, label: 'Start' }, { value: 20, label: '20K' }, { value: 30, label: '30K' }, { value: 42.195, label: 'Finish' }]}
          yTicks={[{ value: hi, label: `${hi}% slower` }, { value: lo, label: `${Math.abs(lo)}% quicker` }]}
          label={`Section pace against each course's own average, the typical course first: its slowest 5K is ${sectionName(data.sections[typicalSlow])}.`}
          keys={[{ label: 'The typical course', mark: 'dash' }]}
          values={(
            <Values id="cs-fingerprint" caption="Section pace against the course's own average"
              columns={[{ key: 'c', label: 'Course', text: true }, ...data.sections.map((s, i) => ({ key: `s${i}`, label: sectionName(s) }))]}
              rows={[['Typical', ...data.typical_curve.map(signed)], ...shaped.map((c) => [c.city, ...c.curve!.map(signed)])]} reading={0} />
          )} />
      </Beat>

      {game.length ? (
        <Beat id="name" track="chapter-2" label="Name that course" title={<>Name that <em>course</em>.</>}>
          <NameThatCourse rounds={game} shapes={shapes} sections={['Start', 'Finish']} />
        </Beat>
      ) : null}

      <Beat id="steadiness" track="chapter-3" label="How steady" title={steady} aliases={['matched', 'hills']}>
        <DotStrip items={big.map((c) => ({ id: c.city, label: c.city, value: c.shares[even], display: pct(c.shares[even]), detail: count(c.finishes), hollow: c.editions < 3 }))}
          domain={[sLo, sHi]} ticks={Array.from({ length: Math.round((sHi - sLo) * 10) + 1 }, (_, i) => sLo + i / 10).map((v) => ({ value: v, label: pct(v) }))}
          readoutKey="Finishes" keyLabels={{ filled: 'Three or more editions', hollow: 'Fewer editions' }}
          label={`${evenName}s as a share of each course's finishes, ${big.length} courses with 10,000 or more finishes; tap a dot to read it`}
          values={(
            <Values id="cs-steady" caption={`${evenName}s as a share of finishes, by course`}
              columns={[{ key: 'c', label: 'Course', text: true }, { key: 's', label: `${evenName}s` }, { key: 'n', label: 'Finishes' }]}
              rows={[...big].sort((a, b) => a.shares[even] - b.shares[even]).map((c) => [c.city, pct(c.shares[even]), count(c.finishes)])} />
          )} />
      </Beat>

      <Moved id="weather" href="/stories/race-morning">Race-morning weather has its own story now.</Moved>
      <Moved id="heat" href="/stories/race-morning#heat">Warm mornings and the shape of the race are now on Race-morning weather.</Moved>
      <Moved id="years" href="/finish-times#front">The front and the back of the field, then and now, are now on Marathon finish times.</Moved>
    </StoryPage>
  );
}
