import Scatter from '@/components/viz/Scatter';
import { getNugget } from '@/lib/nuggets';
import { pct, temp } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import type { UnitSystem } from '@/lib/units';
import ByUnits from './ByUnits.client';
import { CourseSection, Said } from './Fact';

/** Round temperature ticks in the reader's units, returned in °C for the scale: every 10 °F, or every 5 °C. */
function tempTicks(lo: number, hi: number, units: UnitSystem): { value: number; label: string }[] {
  const toU = (c: number) => (units === 'mi' ? c * 1.8 + 32 : c);
  const toC = (u: number) => (units === 'mi' ? (u - 32) / 1.8 : u);
  const step = units === 'mi' ? 10 : 5;
  const out: { value: number; label: string }[] = [];
  for (let u = Math.ceil(toU(lo) / step) * step; u <= toU(hi) + 1e-9; u += step) out.push({ value: toC(u), label: `${u}°${units === 'mi' ? 'F' : 'C'}` });
  return out;
}

/**
 * "#weather": every race morning as a dot, start temperature against the share of finishes with a sustained slowdown.
 * The sentence states the warmest and coolest mornings as two facts, only when they are at least 5 °C apart (then the
 * pair is joined on the chart); otherwise it gives the span of the mornings. Never "warmer, therefore". One gridline,
 * at the top, labelled above the dots, so its label never meets a year's.
 */
export default function CourseWeatherByYear({ page }: { page: CoursePageData }) {
  const { city, display, weather, hotCool } = page;
  if (!weather.length) return null;
  const n = getNugget('course.weather', { city });
  const inPair = (y: number) => !!hotCool && (hotCool.hot.year === y || hotCool.cool.year === y);
  const lo = Math.min(...weather.map((e) => e.temp)), hi = Math.max(...weather.map((e) => e.temp));
  const pad = Math.max(1.5, (hi - lo) * 0.08);
  const top = Math.max(0.1, Math.ceil(Math.max(...weather.map((e) => e.slowdown)) * 10) / 10);
  const chart = (units: UnitSystem) => (
    <Scatter points={weather.map((e) => ({ id: String(e.year), x: e.temp, y: e.slowdown, label: String(e.year), key: `${display} ${e.year}`, value: `${temp(e.temp, units)} · ${pct(e.slowdown)}`, inPair: inPair(e.year) }))}
      xDomain={[lo - pad, hi + pad]} yDomain={[0, top]} xTicks={tempTicks(lo - pad, hi + pad, units)}
      yTicks={[{ value: top, label: pct(top) }]} pairLabel="The warmest and coolest mornings"
      axisTitle={{ end: 'At the start' }}
      label={`Start temperature against sustained slowdown, ${weather.length} ${display} race mornings`} height={150} heightMd={240} />
  );
  return (
    <CourseSection id="weather" track="chapter-7" beat="Weather" title={n.guard ? <span className="course-hotcool"><Said nugget={n} /></span> : <Said nugget={n} />}>
      {weather.length >= 2 ? <ByUnits mi={chart('mi')} km={chart('km')} /> : null}
    </CourseSection>
  );
}
