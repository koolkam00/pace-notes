'use client';
import { useId } from 'react';
import { useUnits } from './UnitsProvider';
import { withEm } from './ui/withEm';
import Values from './ui/Values';
import ChartFrame from './viz/ChartFrame';
import Axis from './viz/Axis';
import Plot from './viz/Plot';
import { linear, pc } from './viz/scale';
import { weatherLabel, weatherNumber } from '@/lib/weather-display';
import type { NuggetText } from '@/lib/nuggets/types';
import type { WeatherCandidate, WeatherDefinition, WeatherEvidence } from '@/lib/weather-types';

const EXPOSURE: Record<WeatherCandidate['id'], string> = { warming: 'Temperature rise in the first four hours', wind: 'Wind speed near the scheduled start', humidity: 'Dew point near the scheduled start' };
/** The two race days compared, and the result's label, in the exposure's own words. */
const SIDES: Record<WeatherCandidate['id'], [string, string, string]> = {
  warming: ['A smaller rise', 'A larger rise', 'Extra slowing with a larger rise'],
  wind: ['Lighter wind', 'Stronger wind', 'Extra slowing in stronger wind'],
  humidity: ['A drier start', 'A more humid start', 'Extra slowing, more humid start'],
};
/** The table's short column name for each exposure; the caption says it in full. */
const SHORT: Record<WeatherCandidate['id'], string> = { warming: 'Rise', wind: 'Wind', humidity: 'Dew point' };
const pp = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${weatherNumber(Math.abs(value), 1)}`;
/** The plot's height in px: a row for the band's label, then the mark with its label above and its interval under. */
const H = 104;
const at = (px: number) => `${((px / H) * 100).toFixed(2)}%`;

/**
 * One weather question as a tab of race-day weather (the redesign spec, section 7.11): its sentence (from
 * lib/nuggets), then the answer card: the estimate in percentage points of second-20K slowing, labelled on its own mark
 * with its interval under it, drawn against zero and the ±1 point band of no material difference, which is named on the
 * plot itself (a legend reading "No material difference" under an estimate outside it read as the card's verdict). A
 * null result is drawn grey inside that band: a null looks null. The observed race days are the Values table, inside
 * the card as on every answer card. Inside the page's masked .analysis-layout; no course picker (the comparison is
 * across all of them).
 */
export default function WeatherAnalysis({ candidate, evidence, sentence }: { definition?: WeatherDefinition; candidate: WeatherCandidate; evidence: WeatherEvidence; questions?: WeatherDefinition[]; sentence?: NuggetText }) {
  const { units } = useUnits();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { effect, exposure } = candidate;
  const isNull = candidate.takeaway_type === 'precise_null';
  const band = evidence.prespecified_gate.practical_difference_pp;
  const text = typeof sentence === 'string' ? sentence : sentence?.[units];
  // Room right of the interval for the estimate's label at 200% zoom.
  const lo = Math.min(-band - 0.5, Math.floor(effect.low - 0.5)), hi = Math.max(band + 0.5, Math.ceil(effect.high + 1));
  const x = linear([lo, hi]);
  // Whole points, at most five ticks, so they never crowd at 200% zoom.
  // Multiples of the step, so 0 is always labelled (the band of no material difference sits on it).
  const tickStep = Math.max(1, Math.ceil((Math.floor(hi) - Math.ceil(lo)) / 4));
  const first = Math.ceil(lo / tickStep) * tickStep;
  const ticks = Array.from({ length: Math.floor((hi - first) / tickStep) + 1 }, (_, i) => first + i * tickStep);
  const tickLabel = (t: number) => (t === 0 ? '0' : `${t > 0 ? '+' : '−'}${Math.abs(t)}`);
  const heading = EXPOSURE[candidate.id];
  // The interval's ends in plain words; its level (a method choice) is on /methodology.
  const range = `Between ${pp(effect.low)} and ${pp(effect.high)} percentage points`;
  const y = 66;
  const plot = (
    <Plot>
      {/* The zone runs the plot's full height, down to the axis, a quiet field behind the marks rather than a box. */}
      <rect className="effect-null-band" x={pc(x(-band))} width={pc(x(band) - x(-band))} y={0} height="100%" />
      {/* The band named inside itself, centred on zero: on two lines, which fit the ±1 point band on a phone (one line ran
          past both its edges), and as "±1 pt" at 200% zoom. */}
      <text className="tick effect-band-label is-wide" x={pc(x(0))} y={at(14)} textAnchor="middle">No material</text>
      <text className="tick effect-band-label is-wide" x={pc(x(0))} y={at(29)} textAnchor="middle">difference</text>
      <text className="tick effect-band-label is-narrow" x={pc(x(0))} y={at(14)} textAnchor="middle">±{band} pt</text>
      <rect className={isNull ? 'm-context effect-interval' : 'm-signal effect-interval'} x={pc(x(effect.low))} width={pc(x(effect.high) - x(effect.low))} y={at(y)} height={4} rx={2} transform="translate(0 -2)" />
      <circle className={isNull ? 'm-context' : 'm-signal'} cx={pc(x(effect.estimate))} cy={at(y)} r={7} />
      <text className="viz-label effect-estimate" x={pc(x(effect.estimate))} y={at(y - 15)} textAnchor="middle">{pp(effect.estimate)} pts</text>
      <text className="tick effect-range" x={pc(x(effect.estimate))} y={at(y + 25)} textAnchor="middle">{pp(effect.low)} to {pp(effect.high)}</text>
    </Plot>
  );
  return <div className="analysis-layout weather-effect">
    {text ? <p className="weather-sentence t-sentence">{withEm(text)}</p> : null}
    {/* The night card holds the answer only; its "All numbers" sits on paper under it (AnswerCard's rule). */}
    <div className="answer-stack">
      <div className="answer-card night effect-card">
        <p className="answer-kicker t-kicker">{SIDES[candidate.id][2]}</p>
        <ChartFrame className="effect-strip" label={`${heading}: ${pp(effect.estimate)} percentage points. ${range}.`} height={H} heightMd={H} plot={plot}
          axis={<Axis ticks={ticks.map(t => ({ x: x(t), label: tickLabel(t) }))} title={{ end: 'Percentage points' }} />} />
      </div>
      <div className="answer-values">
        <Values id={`${id}-days`} caption={`Observed race days: ${heading.toLowerCase()} and second-20K slowing`} count={evidence.editions.length}
          columns={[{ key: 'e', label: 'Race', text: true }, { key: 'x', label: SHORT[candidate.id] }, { key: 's', label: 'Second 20K' }, { key: 'n', label: 'Finishes' }]}
          rows={evidence.editions.map(row => [`${row.city} ${row.year}`, weatherLabel(row[exposure.key], candidate.id, units), `${weatherNumber(row.pace_change_pct, 1)}%`, row.n.toLocaleString('en-US')])} />
      </div>
    </div>
  </div>;
}
