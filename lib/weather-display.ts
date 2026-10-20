import type { UnitSystem } from './units';
import type { WeatherCandidate, WeatherId } from './weather-types';

export const weatherNumber = (value: number, digits = 1) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
export function weatherValue(value: number, id: WeatherId, units: UnitSystem) {
  if (id === 'wind') return value * (units === 'mi' ? 2.2369362920544 : 3.6);
  if (units === 'km') return value;
  return value * 1.8 + (id === 'humidity' ? 32 : 0);
}
export const weatherUnit = (id: WeatherId, units: UnitSystem) => id === 'wind' ? units === 'mi' ? 'mph' : 'km/h' : units === 'mi' ? '°F' : '°C';
export const weatherLabel = (value: number, id: WeatherId, units: UnitSystem) => `${id === 'warming' && value > 0 ? '+' : ''}${weatherNumber(weatherValue(value, id, units))}${id === 'wind' ? ' ' : ''}${weatherUnit(id, units)}`;
/**
 * The median race's second-20K change, % slower than the first 20K (edition medians, each race once): the base every
 * weather tab draws from, so a tab's estimate (percentage points) is said in the percent a runner knows.
 */
export function medianChange(editions: readonly { pace_change_pct: number }[]): number {
  const v = editions.map((e) => e.pace_change_pct).filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : NaN;
}
/** A tab's two race days on that base: the smaller exposure at the median race's change, the larger with the estimate
 * (and its interval) added. */
export function slowingPair(candidate: WeatherCandidate, base: number) {
  const { estimate, low, high } = candidate.effect;
  return { base, with: base + estimate, low: base + low, high: base + high };
}
export function weatherFinding(candidate: WeatherCandidate) {
  if (candidate.status !== 'ready' || candidate.takeaway_type === null) return 'This comparison does not yet support a clear takeaway.';
  const name = { humidity: 'moisture', warming: 'temperature-rise', wind: 'wind' }[candidate.id];
  if (candidate.takeaway_type === 'precise_null') return `Typical ${name} differences showed little change in late-race slowing.`;
  const condition = { humidity: 'Higher dew points', warming: 'Larger temperature rises', wind: 'Stronger start-hour winds' }[candidate.id];
  return `${condition} were associated with ${candidate.effect.estimate > 0 ? 'more' : 'less'} late-race slowing.`;
}
