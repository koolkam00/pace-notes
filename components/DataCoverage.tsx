import fs from 'node:fs';
import path from 'node:path';
import release from '@/analysis/release.json';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { dataHref, n } from '@/components/methods/shared';
import { raceFiles, siteTotals } from '@/lib/nuggets/core';

/**
 * The public inventory of the marathon results, shown only on /methodology (#data-coverage, inside the Coverage topic).
 * Every count is read at build time: the races, editions and years from the race list (lib/nuggets/core.ts raceFiles
 * and siteTotals().raw), the counted editions from its summary, and the weather and route context from the runner
 * context manifest, over the counted editions (the lead's ruling e, November 14, 2026). Until November 19, 2026 this
 * section counted the runner lookup's edition list and printed a table of every race and year; with 804 races the
 * table is the race list itself (/courses) and the edition file it is built from.
 */
export default function DataCoverage() {
  const context = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/runner-context/manifest.json'), 'utf8')) as { release_tag: string; totals: { weather_editions: number; terrain_editions: number } };
  if (context.release_tag !== release.tag) throw new Error('Data coverage must match the study inputs');
  const { summary } = raceFiles();
  const { raw } = siteTotals();
  const counted = summary.counted;
  const setAside = summary.duplicates.editions_set_aside;
  const { weather_editions: weather, terrain_editions: terrain } = context.totals;
  if (weather > counted.editions || terrain > counted.editions) throw new Error('Data coverage: weather and route context are counted over the counted editions.');
  return <section id="data-coverage">
    <h4>Marathons and years</h4>
    <p>The marathon results come from {n(raw.cities)} races and {n(raw.raceYears)} editions (one race in one year), {raw.firstYear} to {raw.lastYear}{setAside ? `, after setting aside ${n(setAside)} ${setAside === 1 ? 'edition that repeats' : 'editions that repeat'} another edition’s list` : ''}. Each edition carries its <a href="#edition-tiers">tier</a>. {n(counted.editions)} editions of {n(counted.races)} races are counted: they supply every pooled figure. The others are listed with their recorded times.</p>
    <p className="methods-links"><Link href="/courses">Every race and its years</Link> · <a href={dataHref('races/editions.csv')}>every edition, with its tier and use (CSV)</a></p>
    <h4>Race results</h4>
    <p>Recorded names, race and year, finish times, checkpoint times where the race published them, and age and recorded gender where supplied. Candidate links help find a runner’s other results; visitors confirm which races belong to them.</p>
    <h4>Weather data</h4>
    <p>Usable weather context is available for {n(weather)} of the {n(counted.editions)} counted editions. Fields include air temperature, feels-like temperature, dew point, relative humidity, wind speed and direction, precipitation, cloud cover, sea-level pressure and weather-condition codes. Hourly readings also show how conditions change after the scheduled start; some fields may be missing.</p>
    <p>These are <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo historical weather estimates</a> near the race location. They describe modeled conditions around the supplied scheduled start, not a runner’s actual wave or exposure along the course. Precipitation is the preceding hour’s total, not a race total.</p>
    <h4>Elevation data</h4>
    <p>Supplied course profiles provide context for {n(terrain)} of the {n(counted.editions)} counted editions. Recorded fields include route distance, elevation along the route, minimum and maximum height, climb, descent and net elevation change, including summaries for the timed sections.</p>
    <p>The profiles come from supplied routes and elevation models. The route used in each historical year has not been verified. Whole-route and section totals can differ, so the site identifies their source and treats terrain as context rather than an adjustment to finish times.</p>
  </section>;
}
