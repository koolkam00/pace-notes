'use client';
import { useId } from 'react';
import { useUnits } from './UnitsProvider';
import { withEm } from './ui/withEm';
import Values from './ui/Values';
import Axis from './viz/Axis';
import { linear, pc } from './viz/scale';
import { medianChange, slowingPair, weatherLabel, weatherNumber } from '@/lib/weather-display';
import type { NuggetText } from '@/lib/nuggets/types';
import type { WeatherCandidate, WeatherDefinition, WeatherEvidence } from '@/lib/weather-types';

const EXPOSURE: Record<WeatherCandidate['id'], string> = { warming: 'Temperature rise in the first four hours', wind: 'Wind speed near the scheduled start', humidity: 'Dew point near the scheduled start' };
/** The two race days compared, in the exposure's own words (the H1 names them in the reader's units, once). */
const SIDES: Record<WeatherCandidate['id'], [string, string]> = {
  warming: ['A smaller rise', 'A larger rise'],
  wind: ['Lighter wind', 'Stronger wind'],
  humidity: ['A drier start', 'A more humid start'],
};
/** The table's short column name for each exposure; the caption says it in full. */
const SHORT: Record<WeatherCandidate['id'], string> = { warming: 'Rise', wind: 'Wind', humidity: 'Dew point' };
const one = (value: number) => `${weatherNumber(value, 1)}%`;

/**
 * One weather question as a tab of race-day weather (the redesign spec, section 7.11): its sentence (from lib/nuggets),
 * then the answer card, drawn in the runner's unit (round 6: "percentage points" read as a statistician's unit): how much
 * slower the second 20K ran than the first, as two bars on one scale, the smaller exposure at the median race's change
 * and the larger with the estimate added, its interval a whisker on the bar's end. Every tab shares the scale (0 to the
 * next 4% past the largest interval end of any ready tab), so switching from Warming to Wind
 * keeps the axis still and the two results compare at a glance. A null result is two grey bars: a null looks null. The
 * observed race days are the Values table under the card. Inside the page's masked .analysis-layout; no course picker
 * (the comparison is across all of them).
 */
export default function WeatherAnalysis({ candidate, evidence, sentence, how }: { definition?: WeatherDefinition; candidate: WeatherCandidate; evidence: WeatherEvidence; questions?: WeatherDefinition[]; sentence?: NuggetText;
  /** The page's methods anchor, at the foot of this tab's All numbers. */
  how?: string;
}) {
  const { units } = useUnits();
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const { exposure } = candidate;
  const isNull = candidate.takeaway_type === 'precise_null';
  const text = typeof sentence === 'string' ? sentence : sentence?.[units];
  const base = medianChange(evidence.editions);
  const pair = slowingPair(candidate, base);
  // One scale for every ready tab: from zero to the next 4% past the largest interval end of any of them.
  const ends = evidence.candidates.filter((c) => c.status === 'ready').map((c) => slowingPair(c, base).high);
  const top = Math.ceil(Math.max(base, pair.high, ...ends) / 4) * 4;
  const x = linear([0, top]);
  const ticks = Array.from({ length: top / 4 + 1 }, (_, i) => i * 4);
  const heading = EXPOSURE[candidate.id];
  const [smaller, larger] = SIDES[candidate.id];
  const rows = [
    { key: 'base', label: smaller, value: base, text: `${Math.round(base)}%`, tone: 'quiet' },
    { key: 'with', label: larger, value: pair.with, text: `about ${Math.round(pair.with)}%`, tone: isNull ? 'quiet' : 'signal', range: [pair.low, pair.high] as const },
  ];
  // The interval's ends in plain words, in percent; its level (a method choice) is on /methodology.
  const label = `${heading}. Second 20K slower than the first: ${smaller.toLowerCase()}, ${one(base)}; ${larger.toLowerCase()}, about ${one(pair.with)}, between ${one(pair.low)} and ${one(pair.high)}.`;
  return <div className="analysis-layout weather-effect">
    {text ? <p className="weather-sentence t-sentence">{withEm(text)}</p> : null}
    {/* The night card holds the answer only; its "All numbers" sits on paper under it (AnswerCard's rule). */}
    <div className="answer-stack">
      <div className="answer-card night effect-card">
        <p className="answer-kicker t-kicker">Second 20K slower than the first</p>
        <figure className="viz viz-frame effect-bars">
          <div className="effect-bars-plot" role="img" aria-label={label}>
            {rows.map((row) => (
              <div key={row.key} className={`effect-row is-${row.tone}`} aria-hidden="true">
                {/* The row's name, its value at the right edge, so the two values stand in one column. */}
                <p className="effect-row-head"><span>{row.label}</span><b>{row.text}</b></p>
                <div className="effect-track">
                  {/* Hairlines at each 4% behind the bar, inside its track only, so 8% and 10% read against the same
                      marks on every tab and no line runs through a row's name or value. */}
                  {ticks.map((t) => <i key={t} className="effect-tick" style={{ left: pc(x(t)) }} />)}
                  <span className="effect-bar" style={{ width: pc(x(row.value)) }} />
                  {row.range ? <span className="effect-range" style={{ left: pc(x(row.range[0])), width: pc(x(row.range[1]) - x(row.range[0])) }} /> : null}
                </div>
              </div>
            ))}
          </div>
          <Axis ticks={ticks.map((t) => ({ x: x(t), label: `${t}%` }))} />
        </figure>
      </div>
      <div className="answer-values">
        <Values id={`${id}-days`} how={how} caption={`Observed race days: ${heading.toLowerCase()} and second-20K slowing`} count={evidence.editions.length}
          columns={[{ key: 'e', label: 'Race', text: true }, { key: 'x', label: SHORT[candidate.id] }, { key: 's', label: 'Second 20K' }, { key: 'n', label: 'Finishes' }]}
          rows={evidence.editions.map(row => [`${row.city} ${row.year}`, weatherLabel(row[exposure.key], candidate.id, units), `${weatherNumber(row.pace_change_pct, 1)}%`, row.n.toLocaleString('en-US')])} />
      </div>
    </div>
  </div>;
}
