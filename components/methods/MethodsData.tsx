import release from '@/analysis/release.json';
import CohortNote from '@/components/CohortNote';
import DataCoverage from '@/components/DataCoverage';
import { sourceReleaseHref } from '@/lib/data-source';
import { copyEditions } from '@/lib/duplicate-editions';
import { keptHolds } from '@/lib/edition-review';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { CHAPTERS, livePages } from '@/lib/chapters';
import { getExtensions } from '@/lib/extension-data';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getWeatherEvidence } from '@/lib/weather-data';
import { countWord } from '@/lib/nuggets/format';
import { Part, Topic, day, editionList, n } from './shared';
import { HalfDataTopics, HalfTotalsLine } from './MethodsHalf';
import { halfManifest } from '@/lib/stories';

/** Part 1: what the data is, where it comes from and which records are analyzed. The files are under Downloads (Part 5). */
export default function MethodsData() {
  const manifest = getInsightsManifest();
  const extension = getExtensions()[0];
  const personalized = getPersonalSummary();
  const weather = getWeatherEvidence();
  const kept = keptHolds(release.tag);
  const copies = copyEditions();
  // Every analysis page (the chapters' list, as /analyses shows it). They share one total when the all-finisher views
  // start from the personalized analyses' eligible finishes; otherwise the sentences below keep to the personalized ones.
  const analyses = CHAPTERS.flatMap((c) => livePages(c)).filter((p) => p.kind === 'analysis').length;
  const oneTotal = !!personalized && getAllFinisherContextStart().analysis_n === personalized.n;
  const theAnalyses = oneTotal ? `The ${countWord(analyses)} analyses, listed by chapter,` : 'The personalized analyses';
  const sourceHref = sourceReleaseHref(release.tag);
  // The tool total, said beside the totals above only when its two edition screens account for the whole difference.
  const band = readInsight<{ cohort_n: number; screens: { start_offset: { finishes: number }[]; grid: { finishes: number }[] } }>('tools/pace-band.json');
  const tools = { n: band.cohort_n, whole: manifest.analysis_n - [...band.screens.start_offset, ...band.screens.grid].reduce((sum, e) => sum + e.finishes, 0) === band.cohort_n };
  const half = halfManifest();
  return <Part id="data" n={1} short="The data" title="The data" lead="Where the finishes come from, and which of them count.">
    <Topic id="study-aims" title="What the study is for">
      <p>The study follows the whole race: how runners start, spread their effort, respond to the course, finish and improve over time. It asks about four things.</p>
      <ul>
        <li><strong>Performance:</strong> finish time relative to a runner’s earlier results and race conditions.</li>
        <li><strong>Execution:</strong> how pace is spread over the distance, including consistency, changes between halves and finishing speed.</li>
        <li><strong>Adaptation:</strong> how pace changes with terrain, weather, crowding and other runners.</li>
        <li><strong>Development:</strong> how the same runner’s approach and results change across marathons.</li>
      </ul>
    </Topic>

    <Topic id="sources" title="Where the data comes from">
      <p>Pace Notes uses {half ? 'six' : 'five'} kinds of source. {half ? <>They are kept apart; half and marathon results meet only where records are <a href="#half-linking">linked by name</a>, and no figure combines results with weather, routes, research or standards.</> : 'They are kept apart, and no figure combines them.'}</p>
      <ul>
        <li><strong>Race results.</strong> Recorded results from big-city marathons: recorded names, marathon and year, finish times, the official 5 km checkpoint times, and age and recorded gender where the race supplied them. They come from one public data export, the <a href="#release">current release</a>.</li>
        <li><strong>Weather.</strong> <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo historical weather estimates</a> for one point in each city, for the hour near the scheduled start and the hours after it. They are modeled, not measured at any runner.</li>
        <li><strong>Routes and elevation.</strong> Each race’s current route file, supplied with the data, with elevation from a digital elevation model. Whether earlier editions ran the same route is not known.</li>
        <li><strong>Official standards.</strong> Qualifying times, age rules, windows and dates, transcribed from each race’s own pages and dated by when they were last checked.</li>
        <li><strong>Published research.</strong> Published models and studies, cited in full under <a href="#tools">Runner tools</a>. None is fitted to Pace Notes data.</li>
        {half ? <li><strong>Half-marathon results.</strong> A separate snapshot of recorded half-marathon results, shown only as totals, with the producer’s links between half and marathon records (<a href="#half-data">the half-marathon results</a>).</li> : null}
      </ul>
      <p>Counts are finishes, not runners: one runner can appear in several races. Runners who did not finish are not in the data.</p>
    </Topic>

    <Topic id="release" title="The current release">
      {extension && <p>The export behind the current analyses holds {n(extension.corpus.n_records)} race records across {extension.corpus.n_cities} cities and {extension.corpus.n_race_years} race editions. Every page uses this one adopted release: the <a href={sourceHref}>current source data release</a>, with input as of {day(manifest.input_as_of)}. The weather data is checked against the same release.</p>}
      <p>Every calculation records its input export, checksums, method version, eligible count and exclusions. A new release reruns the same calculations. Results are checked and reviewed before the website changes, and each downloadable file keeps the exact source identifiers, so anyone can reproduce it (see <a href="#downloads">Downloads</a>).</p>
      <p>A newer export can be downloadable before it has passed the checks the website needs. Until it is adopted, no page uses it.</p>
      {half ? <p>The half-marathon figures use their own pinned snapshot and link build, taken {day(half.as_of)} and bound to the current marathon release, its runner records and its weather evidence: a change to any of them stops the half pages from building until they are rebuilt.</p> : null}
    </Topic>

    <Topic id="coverage" title="Coverage">
      {personalized && <p>{theAnalyses} use {n(personalized.n)} finishes with a complete set of usable splits, across {personalized.cities.filter((c) => c.city !== 'All courses').length} cities. A finish is one performance, so a runner can appear more than once. Times at successive checkpoints give the average pace for each section. Records also include age, recorded gender and candidate links between a runner’s races. Weather estimates and course profiles add context where they exist.</p>}
      <p>Individual tables can have smaller samples because they need more fields. History, exact-age and weather comparisons use subsets.</p>
      <DataCoverage />
    </Topic>

    <Topic id="totals" title="Which pages start from which total">
      <CohortNote />
      <HalfTotalsLine />
      <p>Each page then applies its own screens, listed in its section below.{tools.whole ? <> The tools with Pace Notes data keep {n(tools.n)} of the {n(manifest.analysis_n)}: the editions without start delays or shifted mats (<a href="#tools-data">what the tool data includes</a>).</> : null}</p>
    </Topic>

    <Topic id="copy-editions" title="Copy editions">
      {copies.length === 0 ? <p>No edition in the current release repeats another edition’s field.</p> : <>
        {copies.map((copy) => <p key={`${copy.city}-${copy.year}`}>{copy.city} {copy.year}’s records largely repeat the {copy.city} {copy.duplicate_of} field: {n(copy.identical_nine_time_twins)} of its {n(copy.eligible_removed)} finishes share all nine checkpoint times with a {copy.duplicate_of} finish.</p>)}
        <p>The stories, the course pages and the runner tools leave {copies.length > 1 ? 'these editions' : 'this edition'} out. Course pages count {copies.length > 1 ? 'them' : 'it'} only in the pooled pace profile. {oneTotal ? 'The analyses' : 'The personalized analyses'} and the sustained-slowdown study still include {copies.length > 1 ? 'them' : 'it'}. Find a runner shows {copies.length > 1 ? 'their' : 'its'} records as recorded times only, without pacing, peer or weather comparisons.</p>
      </>}
    </Topic>

    <Topic id="data-quality" title="Which records are analyzed">
      <p>An analyzed finish needs complete, strictly increasing checkpoints, a finish between 90 minutes and 12 hours, and every section between 2 and 20 minutes per km. Missing or invalid readings are left out, never repaired by guessing. These filters can leave out genuine unusual performances. Sample counts and exclusions are recorded with each analysis.</p>
      <p>After the timing checks, the reviewed edition policy for this release leaves out invalid, incomplete, held and selected-field editions before any result or earlier benchmark is formed.{kept.length ? ` The exception is ${editionList(kept)}: the producer holds ${kept.length > 1 ? 'them' : 'it'} while it re-checks the finisher count, and after review ${kept.length > 1 ? 'they stay' : 'it stays'} in, because ${kept.length > 1 ? 'their records fall' : 'its records fall'} only slightly short of the official count.` : ''} In this release that removes {n(weather.cohort.source_quality_excluded)} otherwise plausible finishes. They are counted separately from timing errors. Course pages and every other page apply the same policy, and each data file lists the editions it leaves out with the reason. Missing age or recorded gender alone does not remove a finish from the overall cohort.</p>
      <p>The history analyses use the fastest eligible finish in the two strictly earlier calendar years as a benchmark. A substantially improved performance is more than 2% faster than that recorded best. The benchmark describes earlier performance. It is not current fitness or a course-adjusted expected finish. Supplied “ability”, personal-best and exceptional-performance labels are not used to define these outcomes.</p>
      <p>Historical-performance charts can express change as 100 × (current finish ÷ earlier benchmark − 1). Historical opening change compares the first 10 km pace with that benchmark’s whole-marathon average pace. Negative means faster. In their three-group opening analyses, the <a href="#downloads">research packs</a> (the downloadable tables) call a start more than 2% faster, within 2%, or more than 2% slower. These thresholds describe recorded pacing, not physiological boundaries.</p>
      <p>Groups by finish time describe race shapes. Strategy comparisons need ability known before the race, so that the result does not also define the group.</p>
    </Topic>

    <Topic id="linking" title="How runners are linked">
      <p>The current export supplies candidate runner identities and canonical record IDs. We check that raw and feature IDs are unique, non-null and set-equal, then join each feature to its raw record by ID. Race, city, year, recorded name, finish time and every section time must also agree, to the millisecond. A record ID identifies one result. It does not show that results from different races belong to the same person.</p>
      <p>Identity groups with conflicting recorded gender, inferred birth years more than two years apart, or duplicate records in one edition are rejected. These checks reduce errors; they do not confirm that every link is right. Recorded names and runner IDs are in the full downloadable data.</p>
      <p>Only strictly earlier years can supply an earlier benchmark, so current and same-year results never enter it. Personal-best gains compare with the fastest finish in earlier recorded years; they cannot show a lifetime best. Race-pair analyses use adjacent observations with one race in each end year. The interval analysis uses exact supplied dates, only for identity groups with complete, unique dates.</p>
      <p>Exact-age analyses leave out age-group-only records. Recorded gender is used as supplied and never inferred from names. Unknown categories stay in overall counts where the analysis allows.</p>
      {half ? <p>Half-marathon and marathon records are linked by a separate build, described under <a href="#half-linking">half and marathon records linked by name</a>.</p> : null}
    </Topic>

    <HalfDataTopics />
  </Part>;
}
