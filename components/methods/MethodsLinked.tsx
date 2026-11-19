import { UnitLink as Link } from '@/components/UnitsProvider';
import { getLinkedEditions, getLinkedManifest, getLinkedRaces } from '@/lib/linked-server';
import { linkedFiles, raceReadings, signedPct, signedPoints } from '@/lib/nuggets/linked';
import { STORIES, storyHref } from '@/lib/stories';
import { Detail, Topic, and, dataHref, n, pctText } from './shared';

type Manifest = { definitions: { finish_range_s: [number, number]; outlier_pct: number; bootstrap_draws: number; min_connected: number; race_band_pct: number; max_years_apart: number };
  cohort: { fit: { editions_fitted: number; pairs: number; people: number; races_fitted: number; held_for_review: number; released_by_review: number; excluded_by_review: number };
    universe: { F: { editions: number; kept_results: number; people: number; races: number }; linked_runners: number; linked_results_outside_the_finish_range: { over_twelve_hours: number; under_two_hours: number } } } };
type Floors = { by_verdict: Record<string, number>; no_verdict: number; races: number; min_editions: number };
type Plain = { faster: number; neither: number; slower?: number };
type Fit = { editions_fitted: number; editions: { r: number; both: number }; races: { r: number; both: number; same_sign: number } };

const hms = (s: number) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

/**
 * The methods of the chapter "Over the years" (/methodology#linked-records and its details): the linked-records family
 * in words (docs/LINKED_RECORDS.md), each story's rules under `#story-<slug>` (the chapter registry's anchors), the
 * reviews (#linked-reviews), the seen-again comparison (#linked-seen-again) and the readings on high links alone
 * (#linked-high-links; ruling R6, decision D38). Every number is read from public/data/linked; the link build's ratio cap
 * is the producer's documented rule.
 */
export default function MethodsLinked() {
  const manifest = getLinkedManifest() as unknown as Manifest;
  const def = manifest.definitions, fit = manifest.cohort.fit, F = manifest.cohort.universe.F;
  const editions = getLinkedEditions().data, races = getLinkedRaces().data;
  const checks = linkedFiles.checks(), bests = linkedFiles.bests(), age = linkedFiles.age(), back = linkedFiles.back(), again = linkedFiles.again();
  const floors = checks.floor_of_five as Floors, plain = checks.plain_mean_and_two_standard_errors as Plain;
  const fits = checks.fits as Record<'verified' | 'high' | 'wider', Fit>;
  const release = checks.reviewed.releases[0], exclusion = checks.reviewed.exclusions[0], held = checks.held_for_review;
  const rv = release?.review as Record<string, number | boolean> | undefined;
  const story = (slug: string) => STORIES.find((s) => s.slug === slug)!;
  const read = (slug: string) => <p className="methods-links"><Link href={storyHref(story(slug))}>Read the story</Link><a href={dataHref(`linked/${story(slug).file}`)}>{story(slug).file}</a></p>;
  const surv = (age as unknown as { survivorship: { age_from: number; age_to: number; later_year_from: number; later_year_to: number; seen_again: { median_pct_per_year: number; pairs: number }; not_seen_again: { median_pct_per_year: number; pairs: number } } }).survivorship;

  // Readings on high links alone (R6, D38): each reading the chapter states, beside the same reading from results whose
  // own link is of high confidence. The high-links figures are the family's stored variants.
  const second = bests.by_recorded_attempt.find((a) => a.recorded_attempt === 2)!;
  const fifty = age.bands.find((b) => b.age_from === 50)!;
  const fastest = again.by_finish[0] as typeof again.by_finish[number] & { high: { difference_points: number } };
  const readings = raceReadings(races);
  const highSide = readings.filter((x) => x.row.verdict === 'faster' || x.row.verdict === 'slower');
  const highAgrees = highSide.filter((x) => x.row.variants.high && Math.sign(x.row.variants.high.reading_pct) === Math.sign(x.row.reading_pct)).length;
  const highRows: [string, string, string][] = [
    ['Edition readings, correlation with the main fit', `${n(fits.high.editions.both)} editions in both`, fits.high.editions.r.toFixed(3)],
    ['Races read faster or slower, with a high-links reading on the same side', `${n(highSide.length)} races`, n(highAgrees)],
    ['Second recorded marathons faster than the first', pctText(second.share, 1), pctText(second.variants.high.recorded_bests / second.variants.high.results, 1)],
    ['Change per year at 50 to 54, linked runners who kept racing', signedPct(fifty.median_pct_per_year), signedPct(fifty.high.median_pct_per_year)],
    ['Seen again within two years, with a sustained slowdown against without', signedPoints(back.difference_points), signedPoints((back as unknown as { high: { difference_points: number } }).high.difference_points)],
    ['Finishes under 3:30 recorded again, against the other finishes of the same races', signedPoints(fastest.difference_points), signedPoints(fastest.high.difference_points)],
  ];

  return <Topic id="linked-records" title="Records linked across marathons">
    <p>The chapter Over the years follows marathon results that the producer’s person links join to one runner: records linked by name, sex and age or birth year, never verified people. A result counts when its link is of high or medium <a href="#link-confidence">confidence</a> and its runner passes the three screens (one recorded sex, birth years at most two apart, never two results in one edition), and its finish time lies from {hms(def.finish_range_s[0])} to {hms(def.finish_range_s[1])}; {and([`${n(manifest.cohort.universe.linked_results_outside_the_finish_range.under_two_hours)} linked results under it`, `${n(manifest.cohort.universe.linked_results_outside_the_finish_range.over_twelve_hours)} over it`])} are left out. The editions read are {n(F.editions)} marathon editions of {n(F.races)} races whose finish times the release verifies or states at full coverage: {n(F.kept_results)} results of {n(F.people)} linked runners. Marathons only; no half marathon enters these figures.</p>
    <p>The link build refuses to join two results of one distance whose finish times differ by more than a ratio of 1.70, so every spread of change within a runner is cut at its tails. The share of a race’s records that the links can follow differs widely from race to race, so no rate that follows runners is compared between races.</p>
    <p><strong>The pair model.</strong> Every pair of results of one linked runner at most {def.max_years_apart} calendar years apart gives one difference of log finish times. A least-squares fit splits those differences into a reading per edition, an order term per race (whether it was the earlier or the later race of a pair) and a drift per count of years apart; a runner with many pairs weighs as much as their results allow, not more. An edition is fitted when at least {n(def.min_connected)} linked runners tie it to other fitted editions: {n(fit.editions_fitted)} editions of {n(fit.races_fitted)} races, from {n(fit.pairs)} pairs of {n(fit.people)} runners. Three things the pairs cannot fix are set by rule: the readings average zero, the order terms average zero, and the readings carry no straight-line trend over calendar years, so a reading is against the common trend of the years and nothing here measures that trend or ageing. Intervals come from {n(def.bootstrap_draws)} draws that resample linked runners. A fitted edition more than {def.outlier_pct}% from the median of its race’s other fitted editions on its timing basis is held for review and read nowhere. Editions are compared only within one race and one timing basis; a race reading uses its chip- or net-timed editions only.</p>

    <Detail id="story-fast-and-slow-years" title={story('fast-and-slow-years').title}>
      <p>Each edition’s reading is its fitted value against the mean of the race’s other editions on the same basis, as a percent of the finish time (plus is slower), with at least {n(editions.min_finishes)} results and two other editions. A year reads slow when its whole interval is more than {editions.margin_pct} point above and the high-links fit agrees in sign; fast is the mirror image; usual when the interval lies within {editions.margin_pct} point either side. Any other year states no reading. Of {n(editions.summary.editions)} readings, {and(Object.entries(editions.summary.by_verdict).map(([k, v]) => `${n(v)} ${k}`))} and {n(editions.summary.no_verdict)} without a verdict; {n(checks.beyond.over_2_pct)} lie beyond 2% and {n(checks.beyond.over_3_pct)} beyond 3% ({n(checks.beyond.verified_over_2_pct)} and {n(checks.beyond.verified_over_3_pct)} of the {n(checks.beyond.verified_editions)} on verified editions). A year’s reading includes whatever it shared with the other races that year.</p>
      <p>Two checks stand beside the readings and enter no fit. Inside each race, the reading follows the race’s temperature (correlation {checks.temperature.window.r.toFixed(2)} with the mean temperature of the race window, {checks.temperature.start.r.toFixed(2)} at the start, over {n(checks.temperature.window.editions)} editions in {n(checks.temperature.window.groups)} races). And it follows the whole field’s share of finishes with a sustained slowdown, a count that uses no person link (correlation {checks.slowdown.relation.r.toFixed(2)} over {n(checks.slowdown.relation.editions)} counted editions in {n(checks.slowdown.relation.groups)} races; the page states its finding only at {checks.slowdown.bar} or more).</p>
      {read('fast-and-slow-years')}
    </Detail>

    <Detail id="linked-reviews" title="Editions held, released and excluded by review">
      {release && rv ? <p>{release.label} {release.year} was held by the {def.outlier_pct}% screen ({signedPct(Number((release as unknown as { from_median_pct: number }).from_median_pct))} from its race’s median) and released by a written review on measurements that use no person link: a verified edition timed as its race’s other years; its finishes within {pctText(Math.abs(Number(rv.official_difference_pct)) / 100, 2)} of the official count; the highest whole-field sustained-slowdown share of its race’s {n(Number(rv.counted_years))} counted years ({pctText(Number(rv.field_share_pct) / 100, 1)}); and the warmest start of its {n(Number(rv.weather_years))} years with weather ({Number(rv.start_temperature_c).toFixed(1)} °C). It is read like any other year.</p> : null}
      {held.map((h) => <p key={`${h.label}${h.year}`}>{h.label} {h.year} stays held: it has no release path, and no page states anything about it.</p>)}
      {exclusion ? <p>{exclusion.label} {exclusion.year} is not a year of its race and is read nowhere: the producer’s note says “{exclusion.quoted_note}”.</p> : null}
      <p>Boston 2021 and Rotterdam 2021 were run in autumn, and the release notes that the courses of Madrid and of Washington changed over the years; their editions are read as they are.</p>
    </Detail>

    <Detail id="story-race-to-race" title={story('race-to-race').title}>
      <p>The edition readings are split into a level per race and a level per calendar year, so a race is read against the other races of the same years: minus is faster. It needs {n(races.min_editions)} chip- or net-timed editions and {n(races.min_people_each_way)} linked runners tying it to other races each way. Its interval uses Student’s t on the spread of its editions; a second interval comes from the runner bootstrap. A race reads faster when the reading, the reading as the earlier and as the later race of a pair, the verified and high-links variants and both intervals all lie below zero; slower is the mirror image; about the same when both intervals and both order readings lie within {races.band_pct} points of zero. Any other race shows its interval and no reading. Of {n(readings.length)} readings: {and(Object.entries(races.summary.by_verdict).map(([k, v]) => `${n(v)} ${k.replace(/_/g, ' ')}`))}, {n(races.summary.no_verdict)} without a verdict; {n(races.summary.under_the_floor_each_way)} more race falls under the floor. With a floor of {floors.min_editions} editions instead, {n(floors.races)} races would be read ({and(Object.entries(floors.by_verdict).map(([k, v]) => `${n(v)} ${k.replace(/_/g, ' ')}`))}). The plain mean of a race’s edition readings with two standard errors would call {n(plain.faster)} faster and leave {n(plain.neither)} on neither side. The list is in alphabetical order. It is not a ranking and gives no converted time.</p>
      {read('race-to-race')}
    </Detail>

    <Detail id="story-recorded-bests" title={story('recorded-bests').title}>
      <p>The release dates too few editions to order two marathons of one year, so these figures keep only runners with at most one result a year; a result’s recorded number is its place in the runner’s results in year order. A recorded marathon is a recorded best when it is faster than every earlier one (a tie is not). By order alone, the k-th of k results would be the best 1 time in k. A share reads more or less often when it is more than a point and 1.96 standard errors from that, with every variant on the same side; as often when its interval lies within a point.</p>
      <p>Recorded again: timing-eligible finishes of linked runners in counted editions of {back.years[0]} to {back.years[1]}, with a recorded sex, followed by another kept result of the same runner within {again.within_years} calendar years, at any race in these records. Each group is read inside its own editions, against the other finishes of the same editions; its interval resamples editions. A group reads more often or less often only when the difference is at least a point, its interval is on one side and the verified, high-links, same-race, men’s and women’s variants all agree. A marathon outside these records does not count, and the sexes are not compared: a changed surname breaks a link.</p>
      {read('recorded-bests')}
    </Detail>

    <Detail id="story-getting-older" title={story('getting-older').title}>
      <p>Age is the race year minus a birth year the link build gives exactly; an age from an age group is never used. Pairs are consecutive recorded marathons one to three years apart, the change per year a log ratio over the years apart, banded by the age at the midpoint. The main column keeps pairs from the third recorded marathon on, so a runner’s first steps are not read as youth. A band states its rate when the same-race, verified and high-links medians each lie within {(age as unknown as { agree_pct: number }).agree_pct} points of it. Different runners of the same age (the cross-section) are the slope of log finish time on age inside the band, by recorded sex.</p>
      <p>Survivorship: among pairs whose later result is of {surv.later_year_from} to {surv.later_year_to} at {surv.age_from} to {surv.age_to}, runners with a later recorded marathon changed a typical {signedPct(surv.seen_again.median_pct_per_year)} a year ({n(surv.seen_again.pairs)} pairs), and runners without one {signedPct(surv.not_seen_again.median_pct_per_year)} ({n(surv.not_seen_again.pairs)} pairs): these are rates for runners who kept racing.</p>
      {read('getting-older')}
    </Detail>

    <Detail id="linked-seen-again" title="Seen again after a sustained slowdown">
      <p>Each finish with a <a href="#sustained-slowdown">sustained slowdown</a> is matched with finishes without one of the same edition, recorded sex and 10-minute finish band (cells of at least 20 on each side; {n(back.editions)} editions of {back.years[0]} to {back.years[1]}), and both are followed for another recorded marathon within {back.within_years} years. Both shares are floors, so only their difference is read: {signedPoints(back.difference_points)} ({signedPoints(back.difference_lo_points)} to {signedPoints(back.difference_hi_points)}, resampling editions).</p>
      <p className="methods-links"><Link href="/stories/final-kick#seen-again">Read the beat</Link><a href={dataHref('linked/return.json')}>return.json</a></p>
    </Detail>

    <Detail id="linked-high-links" title="Readings on high links alone">
      <p>Every reading in the chapter is computed again from results whose own link is of high confidence, as a check that medium links do not carry it.</p>
      <div className="table-wrap" role="region" tabIndex={0} aria-labelledby="linked-high-caption">
        <table className="table">
          <caption id="linked-high-caption">Readings on all links and on high links alone</caption>
          <thead><tr><th scope="col" className="is-text">Reading</th><th scope="col">All links</th><th scope="col">High links only</th></tr></thead>
          <tbody>{highRows.map(([what, all, high]) => <tr key={what}><th scope="row" className="is-text">{what}</th><td>{all}</td><td>{high}</td></tr>)}</tbody>
        </table>
      </div>
    </Detail>
    <p className="methods-links">{['editions.json', 'races.json', 'bests.json', 'age.json', 'return.json', 'recorded_again.json', 'checks.json', 'manifest.json'].map((f) => <a key={f} href={dataHref(`linked/${f}`)}>{f}</a>)}</p>
  </Topic>;
}

