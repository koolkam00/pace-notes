'use client';

import { UnitLink as Link } from '@/components/UnitsProvider';
import { pctSigned, type ReportRecord } from '@/lib/report';
import { formatDuration } from '@/lib/tools/time';
import type { UnitSystem } from '@/lib/units';
import type { HeadTag } from './RaceReport';

const count = (value: number) => value.toLocaleString('en-US');
/** The climb in whole feet or metres: the route's sections summed, as its course page prints it. */
const climbLabel = (metres: number, units: UnitSystem) => `${Math.round(units === 'mi' ? metres / 0.3048 : metres).toLocaleString('en-US')} ${units === 'mi' ? 'ft' : 'm'}`;
const clock = (seconds: number) => formatDuration(seconds, true);
const temperature = (c: number, units: UnitSystem) => `${(units === 'mi' ? c * 1.8 + 32 : c).toLocaleString('en-US', { maximumFractionDigits: 1 })}°${units === 'mi' ? 'F' : 'C'}`;
const wind = (mps: number, units: UnitSystem) => `${(mps * (units === 'mi' ? 2.2369362920544 : 3.6)).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units === 'mi' ? 'mph' : 'km/h'}`;
const localHour = (value: string) => {
  const match = /^(?:\d{4}-\d{2}-\d{2}T)?(\d{1,2}):(\d{2})/.exec(value);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
};

/**
 * A runner record's edition in its race report (/runners only; components/report/RaceReport.tsx loads it with the
 * record): the late pace against similar finishes in that race, the race-morning weather and the climb. Never in the
 * image or a link.
 */
export default function RecordBlock({ id, Head, record: r, units }: { id: string; Head: HeadTag; record: ReportRecord; units: UnitSystem }) {
  return (
    <section className="race-report-block race-report-record" aria-labelledby={id}>
      <Link className="race-report-badge is-data" href="/methodology#evidence">Pace Notes data</Link>
      <Head id={id}>In {r.edition}</Head>
      {r.state === 'loading' ? <p className="race-report-meta">Loading this edition’s comparisons and conditions…</p> : null}
      {r.state === 'off' ? <p className="tool-state is-error">{r.message}</p> : null}
      {r.state === 'ok' ? (
        <dl>
          <div><dt>After 30K</dt><dd>{'unavailable' in r.late ? r.late.unavailable : <><strong>{pctSigned(r.late.race / 100, 1)}</strong> against its 5–20K pace; the median of the {count(r.late.n)} finishes from {clock(r.late.from)} to under {clock(r.late.to)} here: {pctSigned(r.late.median / 100, 1)}.</>}</dd></div>
          <div><dt>Weather</dt><dd>{'unavailable' in r.weather ? r.weather.unavailable : <>{temperature(r.weather.tempC, units)}, {r.weather.humidityPct.toLocaleString('en-US', { maximumFractionDigits: 1 })}% humidity and {wind(r.weather.windMps, units)} wind near the start{localHour(r.weather.start) ? ` (${localHour(r.weather.start)})` : ''}.</>}</dd></div>
          <div><dt>Climb</dt><dd>{'unavailable' in r.climb ? r.climb.unavailable : <>{climbLabel(r.climb.gainM, units)} over the course.</>}</dd></div>
        </dl>
      ) : null}
    </section>
  );
}
