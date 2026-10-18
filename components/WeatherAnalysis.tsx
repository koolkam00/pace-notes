'use client';
import { useId } from 'react';
import { useUnits } from './UnitsProvider';
import { withEm } from './ui/withEm';
import BigNumber from './ui/BigNumber';
import Values from './ui/Values';
import ChartFrame from './viz/ChartFrame';
import Axis from './viz/Axis';
import Plot from './viz/Plot';
import { linear, pc } from './viz/scale';
import { weatherLabel, weatherNumber, weatherUnit, weatherValue } from '@/lib/weather-display';
import type { NuggetText } from '@/lib/nuggets/types';
import type { WeatherCandidate, WeatherDefinition, WeatherEvidence } from '@/lib/weather-types';

const EXPOSURE: Record<WeatherCandidate['id'], string> = { warming: 'Temperature rise in the first four hours', wind: 'Wind speed near the scheduled start', humidity: 'Dew point near the scheduled start' };
/** The two race days compared, and the result's label, in the exposure's own words. */
const SIDES: Record<WeatherCandidate['id'], [string, string, string]> = {
  warming: ['A smaller rise', 'A larger rise', 'Extra second-20K slowing with the larger rise'],
  wind: ['Lighter wind', 'Stronger wind', 'Extra second-20K slowing in the stronger wind'],
  humidity: ['A drier start', 'A more humid start', 'Extra second-20K slowing at the more humid start'],
};
/** The table's short column name for each exposure; the caption says it in full. */
const SHORT: Record<WeatherCandidate['id'], string> = { warming: 'Rise', wind: 'Wind', humidity: 'Dew point' };
/** A race day's exposure in whole units ("11°F", "10 mph"), as the tab's sentence says it. */
const whole = (value: number, id: WeatherCandidate['id'], units: 'mi' | 'km') => `${Math.round(weatherValue(value, id, units))}${id === 'wind' ? ' ' : ''}${weatherUnit(id, units)}`;
const pp = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${weatherNumber(Math.abs(value), 1)}`;

/**
 * One weather question as a tab of race-day weather (the redesign spec, section 7.11): its sentence (from
 * lib/nuggets), then the answer card: the two race days it compares (a typical small and large value), the estimate in
 * percentage points of second-20K slowing, and its interval drawn against zero and the ±1 point band of no material
 * difference. A null result is drawn grey inside that band: a null looks null. The observed race days are the Values
 * table. Inside the page's masked .analysis-layout; no course picker (the comparison is across all of them).
 */
export default function WeatherAnalysis({ candidate, evidence, sentence }: { definition?: WeatherDefinition; candidate: WeatherCandidate; evidence: WeatherEvidence; questions?: WeatherDefinition[]; sentence?: NuggetText }) {
  const { units } = useUnits();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { effect, exposure } = candidate;
  const isNull = candidate.takeaway_type === 'precise_null';
  const band = evidence.prespecified_gate.practical_difference_pp;
  const text = typeof sentence === 'string' ? sentence : sentence?.[units];
  const lo = Math.min(-band - 0.5, Math.floor(effect.low - 0.5)), hi = Math.max(band + 0.5, Math.ceil(effect.high + 0.5));
  const x = linear([lo, hi]);
  // Whole points, at most five ticks, so they never crowd at 200% zoom.
  const tickStep = Math.max(1, Math.ceil((Math.floor(hi) - Math.ceil(lo)) / 4));
  const ticks = Array.from({ length: Math.floor((Math.floor(hi) - Math.ceil(lo)) / tickStep) + 1 }, (_, i) => Math.ceil(lo) + i * tickStep);
  const tickLabel = (t: number) => (t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`);
  const heading = EXPOSURE[candidate.id];
  const interval = `${weatherNumber(effect.confidence * 100)}% uncertainty interval`;
  const plot = (
    <Plot>
      <rect className="effect-null-band" x={pc(x(-band))} width={pc(x(band) - x(-band))} y="24%" height="44%" rx={4} />
      <rect className="grid-line" x={pc(x(0))} width={1} y="18%" height="56%" transform="translate(-0.5 0)" />
      <rect className={isNull ? 'm-context effect-interval' : 'm-signal effect-interval'} x={pc(x(effect.low))} width={pc(x(effect.high) - x(effect.low))} y="46%" height={4} rx={2} transform="translate(0 -2)" />
      <circle className={isNull ? 'm-context' : 'm-signal'} cx={pc(x(effect.estimate))} cy="46%" r={7} />
    </Plot>
  );
  return <div className="analysis-layout weather-effect">
    {text ? <p className="weather-sentence t-sentence">{withEm(text)}</p> : null}
    <div className="answer-card night effect-card">
      <p className="answer-kicker t-kicker">{heading}</p>
      <dl className="effect-days">
        <div><dt>{SIDES[candidate.id][0]}</dt><dd>{whole(exposure.q25, candidate.id, units)}</dd></div>
        <div><dt>{SIDES[candidate.id][1]}</dt><dd>{whole(exposure.q75, candidate.id, units)}</dd></div>
      </dl>
      <div className="effect-result">
        <span className="effect-result-label">{SIDES[candidate.id][2]}</span>
        <BigNumber value={isNull ? '≈ 0' : pp(effect.estimate)} unit={isNull ? undefined : 'pts'} size="l" tone={isNull ? 'quiet' : 'signal'} sr={`${pp(effect.estimate)} percentage points`} />
      </div>
      <ChartFrame className="effect-strip" label={`${heading}: ${pp(effect.estimate)} percentage points; ${interval} ${pp(effect.low)} to ${pp(effect.high)}`} height={64} heightMd={64} plot={plot}
        axis={<Axis ticks={ticks.map(t => ({ x: x(t), label: tickLabel(t) }))} />} keys={[{ label: 'No material difference', mark: 'band' }]} />
      <p className="answer-foot">{interval}: {pp(effect.low)} to {pp(effect.high)} percentage points.</p>
    </div>
    <Values id={`${id}-days`} caption={`Observed race days: ${heading.toLowerCase()} and second-20K slowing`} count={evidence.editions.length}
      columns={[{ key: 'e', label: 'Race', text: true }, { key: 'x', label: SHORT[candidate.id] }, { key: 's', label: 'Second 20K' }, { key: 'n', label: 'Finishes' }]}
      rows={evidence.editions.map(row => [`${row.city} ${row.year}`, weatherLabel(row[exposure.key], candidate.id, units), `${weatherNumber(row.pace_change_pct, 1)}%`, row.n.toLocaleString('en-US')])} />
  </div>;
}
