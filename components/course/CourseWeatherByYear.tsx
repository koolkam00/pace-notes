import Scatter from '@/components/viz/Scatter';
import { getNugget } from '@/lib/nuggets';
import { WEATHER_MIN_MORNINGS } from '@/lib/nuggets/courses';
import { pct, temp } from '@/lib/nuggets/format';
import type { CoursePageData } from '@/lib/course-page';
import type { UnitSystem } from '@/lib/units';
import ByUnits from '@/components/ui/ByUnits.client';
import { CourseSection, Said } from './Fact';

/**
 * Round temperature ticks in the reader's units, returned in °C for the scale: every 10 °F or 5 °C, and every 5 °F or
 * 2 °C where that would leave fewer than two, so the scale can always be read.
 */
export function tempTicks(lo: number, hi: number, units: UnitSystem): { value: number; label: string }[] {
  const toU = (c: number) => (units === 'mi' ? c * 1.8 + 32 : c);
  const toC = (u: number) => (units === 'mi' ? (u - 32) / 1.8 : u);
  const at = (step: number) => {
    const out: { value: number; label: string }[] = [];
    for (let u = Math.ceil(toU(lo) / step) * step; u <= toU(hi) + 1e-9; u += step) out.push({ value: toC(u), label: `${u}°${units === 'mi' ? 'F' : 'C'}` });
    return out;
  };
  const wide = at(units === 'mi' ? 10 : 5);
  return wide.length >= 2 ? wide : at(units === 'mi' ? 5 : 2);
}

export { WEATHER_MIN_MORNINGS };

/**
 * "#weather", only where the warmest and coolest race mornings are at least 5 °C apart (the contrast is the beat's whole
 * point) and there are three or more: every morning a dot, start temperature against the share of finishes with a
 * sustained slowdown. The sentence compares the warmest and coolest mornings other than the hero's edition (the hero
 * tells that one, course.weather): the two it names are inked and labelled by year, no key, never joined (a line across
 * the cloud would read as a trend, "warmer, therefore"). The heading says the reading, so the readout opens on a prompt
 * and no dot is orange (a picked one rings in ink); where the other mornings are too close to compare, the page
 * leaves the section out (round 6; the page's contents drop its chip too). The y scale runs from zero on the baseline
 * to the round ten above the dots, both labelled, and the readout names the measure. Elsewhere the mornings are in
 * "All numbers".
 */
export default function CourseWeatherByYear({ page }: { page: CoursePageData }) {
  const { city, display, weather, hotCool } = page;
  if (!hotCool || weather.length < WEATHER_MIN_MORNINGS) return null;
  const n = getNugget('course.weather', { city });
  // No pair to compare, no section: a span of temperatures over an uninked scatter is not a finding (round 6).
  if (!n.guard) return null;
  const v = n.values as Record<string, number>;
  const pair = [v.hot_year, v.cool_year];
  const inPair = (y: number) => pair.includes(y);
  const lo = Math.min(...weather.map((e) => e.temp)), hi = Math.max(...weather.map((e) => e.temp));
  const pad = Math.max(1.5, (hi - lo) * 0.08);
  const top = Math.max(0.1, Math.ceil(Math.max(...weather.map((e) => e.slowdown)) * 10) / 10);
  const chart = (units: UnitSystem) => (
    <Scatter points={weather.map((e) => ({ id: String(e.year), x: e.temp, y: e.slowdown, label: String(e.year), key: `${e.year}, at the start`, value: temp(e.temp, units), inPair: inPair(e.year) }))}
      side={[{ label: 'Sustained slowdown', values: weather.map((e) => pct(e.slowdown)) }]}
      xDomain={[lo - pad, hi + pad]} yDomain={[0, top]} xTicks={tempTicks(lo - pad, hi + pad, units)}
      yTicks={[{ value: top, label: pct(top) }, { value: 0, label: pct(0) }]} pairLine={false} selected={String(pair[0] ?? weather[weather.length - 1].year)} prompt="Choose a dot to read its year"
      axisTitle={{ end: 'At the start' }}
      label={`Start temperature against sustained slowdown, ${weather.length} ${display} race mornings`} height={150} heightMd={200} />
  );
  return (
    <CourseSection id="weather" track="chapter-7" beat="Weather" title={<span className="course-hotcool"><Said nugget={n} /></span>}>
      <div className="course-weather"><ByUnits mi={chart('mi')} km={chart('km')} /></div>
    </CourseSection>
  );
}
