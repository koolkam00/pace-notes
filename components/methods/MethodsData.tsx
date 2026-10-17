import release from '@/analysis/release.json';
import CohortNote from '@/components/CohortNote';
import DataCoverage from '@/components/DataCoverage';
import { sourceReleaseHref } from '@/lib/data-source';
import { copyEditions } from '@/lib/duplicate-editions';
import { getExtensions } from '@/lib/extension-data';
import { getInsightsManifest } from '@/lib/insights-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { STORIES } from '@/lib/stories';
import { getWeatherEvidence } from '@/lib/weather-data';
import { Part, Topic, dataHref, day, n } from './shared';

/** What each story's downloadable summary file holds. Every one is an aggregate; none holds a runner name or a single runner's record. */
export const STORY_FILE_TOPICS: Record<string, string> = {
  'archetypes.json': 'pacing-type shares',
  'finish-times.json': 'finish-time distributions',
  'replay.json': 'race replay snapshots of how fields spread out',
  'positions.json': 'place changes after 20 km',
  'kick.json': 'final-stretch pace',
  'demographics.json': 'pacing by recorded gender and age group',
  'courses.json': 'course pacing profiles with race-morning weather as context',
};

const RELEASES = 'https://github.com/koolkam00/pace-notes/releases';

/** Part 1: what the data is, where it comes from, what can be downloaded and which records are analyzed. */
export default function MethodsData() {
  const manifest = getInsightsManifest();
  const extension = getExtensions()[0];
  const personalized = getPersonalSummary();
  const weather = getWeatherEvidence();
  const copies = copyEditions();
  const sourceHref = sourceReleaseHref(release.tag);
  const storyFiles = STORIES.filter((story) => manifest.files[story.file]);
  return <Part id="data" eyebrow="Part 1" title="What the data is and where it comes from">
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
      <p>Pace Notes uses five kinds of source. They are kept apart, and no figure combines them.</p>
      <ul>
        <li><strong>Race results.</strong> Recorded results from big-city marathons: recorded names, marathon and year, finish times, the official 5 km checkpoint times, and age and recorded gender where the race supplied them. They come from one public data export, the <a href="#release">current release</a>.</li>
        <li><strong>Weather.</strong> <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo historical weather estimates</a> for one point in each city, for the hour of the scheduled start and the hours after it. They are modelled, not measured at any runner.</li>
        <li><strong>Routes and elevation.</strong> Each race’s current route file, supplied with the data, with elevation from a digital elevation model. Whether earlier editions ran the same route is not known.</li>
        <li><strong>Official standards.</strong> Qualifying times, age rules, windows and dates, transcribed from each race’s own pages and dated by when they were last checked.</li>
        <li><strong>Published research.</strong> Published models and studies, cited in full under <a href="#tools">Runner tools</a>. None is fitted to Pace Notes data.</li>
      </ul>
      <p>Counts are finishes, not runners: one runner can appear in several races. Runners who did not finish are not in the data.</p>
    </Topic>

    <Topic id="release" title="The current release">
      {extension && <p>The export behind the current analyses holds {n(extension.corpus.n_records)} race records across {extension.corpus.n_cities} cities and {extension.corpus.n_race_years} race editions. Every page uses this one adopted release: the <a href={sourceHref}>current source data release</a>, with input as of {day(manifest.input_as_of)}. The weather data is checked against the same release.</p>}
      <p>Every calculation records its input export, checksums, method version, eligible count and exclusions. A new release reruns the same calculations. Results are checked and reviewed before the website changes, and each downloadable file keeps the exact source identifiers, so anyone can reproduce it.</p>
      <p>A newer export can be downloadable before it has passed the checks the website needs. Until it is adopted, no page uses it.</p>
    </Topic>

    <Topic id="downloads" title="Downloads">
      <p>The complete exports, the source code and these methods are public. No account or key is needed. <a href={RELEASES}>Download the data</a>.</p>
      <ul>
        <li><strong>Full race records</strong>, including those without a usable name, are published with the <a href={sourceHref}>current source data release</a>.</li>
        <li><strong>Data stories:</strong> {storyFiles.map((story, i) => <span key={story.file}>{i ? (i === storyFiles.length - 1 ? ' and ' : ', ') : ''}<a href={dataHref(`insights/${story.file}`)}>{story.file}</a>{STORY_FILE_TOPICS[story.file] ? ` (${STORY_FILE_TOPICS[story.file]})` : ''}</span>)}. The race replay also has one file per race in <code>/data/insights/replay/</code>, and the courses story also uses <a href={dataHref('insights/course-geometry.json')}>course-geometry.json</a>. <a href={dataHref('insights/manifest.json')}>manifest.json</a> lists the release, the cohort and every file’s checksum.</li>
        <li><strong>Sustained-slowdown study:</strong> <a href={dataHref('study/evidence.json')}>results, methods and source checksums</a>.</li>
        <li><strong>Fast starts:</strong> <a href={dataHref('fast-start/all-finishers.json')}>all eligible finishes</a> and <a href={dataHref('fast-start/evidence.json')}>the earlier-result comparison</a>.</li>
        <li><strong>Courses, race-day weather and downhill starts:</strong> <a href={dataHref('all-finisher-context/evidence.json')}>calculation data and methods</a>.</li>
        <li><strong>Weather questions:</strong> <a href={dataHref('weather/evidence.json')}>all three screening results and edition values</a>.</li>
        <li><strong>Personalized analyses:</strong> <a href={dataHref('packs/ext_personalized_guide/pack_meta.json')}>coverage, provenance and calculation details</a>. Each research question lists its own files under <a href="#question-methods">Research questions</a>.</li>
      </ul>
      <p>Every file except the full race records is an aggregate. Each one states its own cohort, screens and method.</p>
    </Topic>

    <Topic id="coverage" title="Coverage">
      {personalized && <p>The ten analyses use {n(personalized.n)} finishes with a complete set of usable splits, across {personalized.cities.filter((c) => c.city !== 'All courses').length} cities. A finish is one performance, so a runner can appear more than once. Times at successive checkpoints give the average pace for each section. Records also include age, recorded gender and candidate links between a runner’s races. Weather estimates and course profiles add context where they exist.</p>}
      <p>Individual tables can have smaller samples because they need more fields. History, exact-age and weather comparisons use subsets.</p>
      <DataCoverage />
    </Topic>

    <Topic id="totals" title="Which pages start from which total">
      <CohortNote />
      <p>Each page then applies its own screens, listed in its section below.</p>
    </Topic>

    <Topic id="copy-editions" title="Copy editions">
      {copies.length === 0 ? <p>No edition in the current release repeats another edition’s field.</p> : <>
        {copies.map((copy) => <p key={`${copy.city}-${copy.year}`}>{copy.city} {copy.year}’s records largely repeat the {copy.city} {copy.duplicate_of} field: {n(copy.identical_nine_time_twins)} of its {n(copy.eligible_removed)} finishes share all nine checkpoint times with a {copy.duplicate_of} finish.</p>)}
        <p>The stories, the course pages and the runner tools leave {copies.length > 1 ? 'these editions' : 'this edition'} out. Course pages count {copies.length > 1 ? 'them' : 'it'} only in the pooled pace profile. The ten analyses and the sustained-slowdown study still include {copies.length > 1 ? 'them' : 'it'}. Find a runner shows {copies.length > 1 ? 'their' : 'its'} records as recorded times only, without pacing, peer or weather comparisons.</p>
      </>}
    </Topic>

    <Topic id="data-quality" title="Which records can be analyzed?">
      <p>An analyzed finish needs complete, strictly increasing checkpoints, a finish between 90 minutes and 12 hours, and every section between 2 and 20 minutes per km. Missing or invalid readings are left out, never repaired by guessing. These filters can leave out genuine unusual performances. Sample counts and exclusions are recorded with each analysis.</p>
      <p>After the timing checks, the reviewed edition policy for this release leaves out invalid, incomplete, held and selected-field editions before any result or earlier benchmark is formed. In this release that removes {n(weather.cohort.source_quality_excluded)} otherwise plausible finishes. They are counted separately from timing errors. Course pages and every other page apply the same policy, and each data file lists the editions it leaves out with the reason. Missing age or recorded gender alone does not remove a finish from the overall cohort.</p>
      <p>The history analyses use the fastest eligible finish in the two strictly earlier calendar years as a benchmark. A substantially improved performance is more than 2% faster than that recorded best. The benchmark describes earlier performance. It is not current fitness or a course-adjusted expected finish. Supplied “ability”, personal-best and exceptional-performance labels are not used to define these outcomes.</p>
      <p>Historical-performance charts can express change as 100 × (current finish ÷ earlier benchmark − 1). Historical opening change compares the first 10 km pace with that benchmark’s whole-marathon average pace. Negative means faster. The archive’s three-group opening analyses call a start more than 2% faster, within 2%, or more than 2% slower. These thresholds describe recorded pacing, not physiological boundaries.</p>
      <p>Groups by finish time describe race shapes. Strategy comparisons need ability known before the race, so that the result does not also define the group.</p>
    </Topic>

    <Topic id="linking" title="How runners are linked without mixing up records">
      <p>The current export supplies candidate runner identities and canonical record IDs. We check that raw and feature IDs are unique, non-null and set-equal, then join each feature to its raw record by ID. Race, city, year, recorded name, finish time and every section time must also agree, to the millisecond. A record ID identifies one result. It does not show that results from different races belong to the same person.</p>
      <p>Identity groups with conflicting recorded gender, inferred birth years more than two years apart, or duplicate records in one edition are rejected. These checks reduce errors; they do not confirm that every link is right. Recorded names and runner IDs are in the full downloadable data.</p>
      <p>Only strictly earlier years can supply an earlier benchmark, so current and same-year results never enter it. Personal-best gains compare with the fastest finish in earlier recorded years; they cannot show a lifetime best. Race-pair analyses use adjacent observations with one race in each end year. The interval analysis uses exact supplied dates, only for identity groups with complete, unique dates.</p>
      <p>Exact-age analyses leave out age-group-only records. Recorded gender is used as supplied and never inferred from names. Unknown categories stay in overall counts where the analysis allows.</p>
    </Topic>
  </Part>;
}
