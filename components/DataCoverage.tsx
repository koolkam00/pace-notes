import fs from 'node:fs';
import path from 'node:path';
import release from '@/analysis/release.json';

/**
 * The public inventory, built from the same manifests used by runner search. Shown only on /methodology (#data-coverage,
 * inside the Coverage topic). It names no unit conversion.
 */
export default function DataCoverage() {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', name), 'utf8'));
  const runners = read('runners/manifest.json');
  const context = read('runner-context/manifest.json');
  if (runners.release_tag !== release.tag || context.release_tag !== release.tag) throw new Error('Data coverage must match the study inputs');
  const races = new Map<string, Set<number>>();
  const byCity = new Map<string, Set<string>>();
  for (const edition of runners.editions as { race: string; year: number; city: string }[]) {
    const years = races.get(edition.race) || new Set<number>();
    years.add(edition.year);
    races.set(edition.race, years);
    byCity.set(edition.city, (byCity.get(edition.city) || new Set<string>()).add(edition.race));
  }
  // A city with more than one marathon is named, so the marathon count reads beside the cities count ("34 cities")
  // without a gap: "35 marathons (Warsaw has two)".
  const words = ['', 'one', 'two', 'three', 'four', 'five'];
  const several = [...byCity].filter(([, set]) => set.size > 1).map(([city, set]) => `${city} has ${words[set.size] ?? set.size}`);
  return <section id="data-coverage">
    <h4>Marathons and years</h4>
    <p>The database contains results from {races.size} marathons{several.length ? ` (${several.join('; ')})` : ''} and {runners.editions.length} city-and-year editions. The years below are the years recorded, including partial editions. They do not imply complete fields or usable splits for every runner. Each analysis applies its timing and source-quality checks.</p>
    <details className="fold is-sub"><summary><span className="fold-title">Every marathon and recorded year</span><span className="fold-glyph" aria-hidden="true" /></summary>
      <div className="fold-body"><div className="table-wrap" role="region" tabIndex={0} aria-labelledby="data-coverage-caption">
        <table className="table">
          <caption id="data-coverage-caption" className="sr-only">Race results in the database</caption>
          <thead><tr><th scope="col">Marathon</th><th scope="col" className="is-text">Recorded years</th></tr></thead>
          <tbody>{[...races].sort(([a], [b]) => a.localeCompare(b)).map(([race, years]) => <tr key={race}><th scope="row">{race}</th><td className="is-text">{[...years].sort((a, b) => a - b).join(', ')}</td></tr>)}</tbody>
        </table>
      </div></div>
    </details>
    <h4>Race results</h4>
    <p>Recorded names, marathon and year, finish times, checkpoint splits, and age and recorded gender where supplied. Candidate links help find a runner’s other results; visitors confirm which races belong to them.</p>
    <h4>Weather data</h4>
    <p>Usable weather context is available for {context.totals.weather_editions} of {runners.editions.length} editions. Fields include air temperature, feels-like temperature, dew point, relative humidity, wind speed and direction, precipitation, cloud cover, sea-level pressure and weather-condition codes. Hourly readings also show how conditions change after the scheduled start; some fields may be missing.</p>
    <p>These are <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo historical weather estimates</a> near the race location. They describe modeled conditions around the supplied scheduled start, not a runner’s actual wave or exposure along the course. Precipitation is the preceding hour’s total, not a race total.</p>
    <h4>Elevation data</h4>
    <p>Supplied course profiles provide context for {context.totals.terrain_editions} of {runners.editions.length} editions. Recorded fields include route distance, elevation along the route, minimum and maximum height, climb, descent and net elevation change, including summaries for the timed sections.</p>
    <p>The profiles come from supplied routes and elevation models. The route used in each historical year has not been verified. Whole-route and section totals can differ, so the site identifies their source and treats terrain as context rather than an adjustment to finish times.</p>
  </section>;
}
