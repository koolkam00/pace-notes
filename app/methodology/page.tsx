import Link from 'next/link';
import { getStudyEvidence, getStudyAnswer, getQuestions } from '@/lib/research-data';
import { QUESTIONS } from '@/lib/question-catalog';
import { getExtensions } from '@/lib/extension-data';
import { getPersonalMethod, getPersonalSummary } from '@/lib/personalized-data';
import { TEN_ANALYSES, analysisHref } from '@/lib/ten-analyses';
import { PERSONAL_QUESTIONS } from '@/lib/personalized-catalog';
import { getInsightsManifest } from '@/lib/insights-server';
import { STORIES, courseSpan } from '@/lib/stories';
import { JsonLd, absoluteUrl, pageMetadata } from '@/lib/seo';
import { dataDate } from '@/lib/seo-routes';

export const metadata = pageMetadata({
  title: 'Methodology: How Pace Notes Studies Marathon Splits',
  description: 'Definitions, cohorts, timing checks and limits behind the Pace Notes marathon analyses, data stories and research archive, and what they cannot show.',
  path: '/methodology',
});

/** What each story's downloadable summary file holds. Every one is an aggregate; none holds a runner name or a single runner's record. */
const STORY_FILE_TOPICS: Record<string, string> = {
  'archetypes.json': 'pacing-type shares',
  'finish-times.json': 'finish-time distributions',
  'replay.json': 'race replay snapshots of how fields spread out',
  'positions.json': 'place changes after 20 km',
  'kick.json': 'final-stretch pace',
  'demographics.json': 'pacing by recorded gender and age group',
  'courses.json': 'course pacing profiles with race-morning weather as context',
};

/**
 * schema.org Dataset for the aggregate story summaries (Dataset Search only). Every number is read from the
 * verified story data; the distribution lists only the aggregate files the story pages already offer for download.
 * No licence is given because the repository does not state one.
 */
function storyDataset() {
  const manifest = getInsightsManifest();
  const span = courseSpan();
  const files = STORIES.filter((s) => manifest.files[s.file] && STORY_FILE_TOPICS[s.file]).map((s) => s.file);
  if (!span || !files.length) return null;
  const topics = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' }).format(files.map((f) => STORY_FILE_TOPICS[f]));
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Pace Notes marathon pacing summaries',
    description: `Aggregate marathon pacing summaries behind the Pace Notes data stories, drawn from ${new Intl.NumberFormat('en-US').format(manifest.analysis_n)} screened finishes with recorded 5 km checkpoint splits at ${manifest.cohort.cities} marathons, ${span.first}–${span.last}. Files cover ${topics}. Counts are finishes, not unique runners; each file states its own cohort, screens and method.`,
    url: absoluteUrl('/methodology'),
    creator: { '@type': 'Person', name: 'Andrew Kam' },
    isAccessibleForFree: true,
    temporalCoverage: `${span.first}/${span.last}`,
    dateModified: dataDate('insights'),
    variableMeasured: [
      '5 km checkpoint split times', 'Finish time', 'Section pace relative to the same finish’s own pace',
      'Sustained slowdown (25% or more slower than the 5–20 km pace for at least 5 km after 20 km)',
      'Recorded gender', 'Age group', 'Modelled race-morning temperature',
    ],
    distribution: files.map((f) => ({ '@type': 'DataDownload', name: f, encodingFormat: 'application/json', contentUrl: absoluteUrl(`/data/insights/${f}`) })),
  };
}

const additions = [
  { name: 'Hourly weather', fields: 'Temperature, dew point, humidity, rain, wind, cloud cover, and solar radiation.', benefit: 'Match conditions to the time each runner reaches a segment. Use a consistent historical model across years.', href: 'https://open-meteo.com/en/docs/historical-weather-api', source: 'Open-Meteo historical weather', coverage: 'Broad historical coverage; modeled grid estimates, not conditions measured at the runner.' },
  { name: 'Weather-station observations', fields: 'Observed temperature, dew point, wind, and precipitation, with station location and quality flags.', benefit: 'Check unusual weather days against observations near the course.', href: 'https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly', source: 'NOAA GHCN hourly', coverage: 'Station and year coverage vary. The newer GHCN hourly archive replaces ISD.' },
  { name: 'The route for each race edition', fields: 'Course geometry, checkpoint locations, certification ID, route changes, and separate start routes.', benefit: 'Calculate section distance, turns, road direction, and the route actually used that year.', href: 'https://certifiedroadraces.com/search/', source: 'USATF course certification database', coverage: 'US courses; use each organizer’s dated maps elsewhere. Older routes often need manual recovery.' },
  { name: 'Elevation and slope by section', fields: 'Climb, descent, net elevation change, and grade along the route.', benefit: 'Separate terrain-related pacing patterns from a runner’s unusual slowdown.', href: 'https://www.opentopodata.org/datasets/srtm/', source: 'Open Topo Data / SRTM', coverage: 'Available for route coordinates. Check bridges and tunnels separately: terrain height may differ from the road deck.' },
  { name: 'Waves, corrals, and actual start times', fields: 'Wave schedule, runner corral, chip start, gun finish, and timing conventions.', benefit: 'Estimate time-of-day exposure and establish who was together at a checkpoint.', href: 'https://www.chicagomarathon.com/event-info/participant-information/', source: 'Official participant information', coverage: 'Schedules are commonly published; individual start timestamps depend on the timing provider. A wave start is not an individual start.' },
  { name: 'Aid stations and course amenities', fields: 'Water and fuel locations, supplied products, medical stations, toilets, and station changes by year.', benefit: 'Compare local pacing patterns with where runners can stop or refuel.', href: 'https://www.chicagomarathon.com/event-info/participant-information/course/', source: 'Official course and aid-station guide', coverage: 'Often available in participant guides. Product availability does not reveal what any runner consumed.' },
  { name: 'Qualifying rules and entry routes', fields: 'Published time standards, eligible age, qualifying window, acceptance cutoff, and entry category where public.', benefit: 'Study goal incentives and account for differences in who enters each race.', href: 'https://www.baa.org/races/boston-marathon/qualify/', source: 'Boston Athletic Association', coverage: 'Use dated rules and announcements. Historical records need an edition-by-edition audit.' },
  { name: 'Air quality', fields: 'Particle pollution, ozone, and other pollutants at the race location and time.', benefit: 'Explore whether poor-air-quality editions have different pacing patterns.', href: 'https://ads.atmosphere.copernicus.eu/datasets/cams-global-reanalysis-eac4', source: 'Copernicus CAMS reanalysis', coverage: 'Historical modeled coverage from 2003; spatial resolution is too coarse to represent every street.' },
];

export default function MethodologyPage() {
  const study = getStudyAnswer();
  const supportingStudy = getStudyEvidence();
  const extension = getExtensions()[0];
  const questions = getQuestions();
  const calculated = questions.filter(question => question.dataset);
  const personalized = getPersonalSummary();
  const dataset = storyDataset();
  return <article className="prose">
    <p className="eyebrow">Methods &amp; sources</p>
    <h1>How we study marathon pacing</h1>
    <p className="answer">The study follows the whole race: how runners start, distribute their speed, respond to the course, finish, and improve over time.</p>
    <h2>Four things we want to understand</h2>
    <ul>
      <li><strong>Performance:</strong> finish time relative to a runner’s previous ability and race conditions.</li>
      <li><strong>Execution:</strong> the distribution of pace across the full distance, including consistency, changes between halves, and finishing acceleration.</li>
      <li><strong>Adaptation:</strong> how pace changes with terrain, weather, congestion, and other runners.</li>
      <li><strong>Development:</strong> how the same runner’s approach and results change across marathons.</li>
    </ul>
    <h2>What is available now?</h2>
    {extension && <p>The export used by the current analyses contains {new Intl.NumberFormat('en-US').format(extension.corpus.n_records)} race records across {extension.corpus.n_cities} cities and {extension.corpus.n_race_years} race editions. These charts summarize individual splits. The complete records are available in <a href="https://github.com/koolkam00/htw-live-study/releases">public data downloads</a> without login.</p>}
    {supportingStudy && <p>Every published analysis draws from the same collection of marathon results, including sustained slowdown and the supporting charts. The common timing and edition-quality checks retain {new Intl.NumberFormat('en-US').format(supportingStudy.n)} eligible finishes. History, exact-age and weather comparisons use smaller subsets because they need additional fields.</p>}
    <p>The data stories use the same eligible finishes but also leave out Chicago 2018 and 2019, whose records duplicate the Chicago 2024 field (same source participant ids, names and checkpoint times). Their pacing-shape charts further leave out thirteen editions whose first 5 km appears to include start delay. Each story lists its own screens in its methods box.</p>
    <p>{calculated.length} of the {QUESTIONS.length} questions have results recalculated from the public export. Some are partial answers: a course comparison cannot isolate the course’s causal effect, and a route proxy cannot establish the hills used in an old edition. Group running and congestion require start and checkpoint clock times that are absent from this export.</p>
    <p>A finish is one performance, so a runner can contribute several. Individual tables can have smaller samples because they need different fields. <Link href="/about#data-coverage">See the marathons, recorded years, weather fields and elevation coverage</Link>.</p>
    <h2 id="personalized">The ten essential analyses</h2>
    {personalized && <p>The personalized guide uses {new Intl.NumberFormat('en-US').format(personalized.n)} eligible finishes, including {new Intl.NumberFormat('en-US').format(personalized.age_n)} with an exact usable age. The usable earlier-benchmark cohort contains {new Intl.NumberFormat('en-US').format(personalized.history_n)} finishes. Combining course, age, recorded gender and earlier-time filters can make samples much smaller.</p>}
    <p>The ten primary analyses are ranked by usefulness to runners and strength of the evidence. Seven use the personalized engine. Fast starts, course comparisons and race-day weather have separate views that work without earlier results. Course and weather pages retain earlier-result comparisons as an option. Each page shows only the controls that apply to its question. The research guide retains the twelve original personalized comparisons.</p>
    <details className="methodology" id="all-finisher-context"><summary>Weather, courses and downhill starts without previous finishes</summary><div className="methodology-content">
      <p>Each eligible finish supplies its own 5–20 km pace reference. We compare late pace (30 km to the finish), the time difference after 20 km, nine section paces and sustained slowdown. No identity link, prior result, target or eventual-finish filter is required. Optional early-pace groups use observed 5–20 km pace below 4:30/km, 4:30 to below 5:30/km, 5:30 to below 6:30/km, and 6:30/km or slower. This is observed race pace, not measured fitness.</p>
      <p>Across-course, temperature and terrain groups require at least 20 selected finishes per edition, three editions and 100 finishes in total. Every retained edition has equal weight in slowdown rates and averages of edition medians. The middle 80% of edition medians describes differences between editions, not a confidence interval or an individual runner’s range. Pacing consistency summarizes the middle-80% spread of late pace change within each edition, then averages those spreads. These are descriptions of different race fields, not rankings of course difficulty or estimates of a heat penalty.</p>
      <p>Temperature groups use validated modeled start-hour temperature: below 5°C, 5 to below 10°C, 10 to below 15°C, 15 to below 20°C, and 20°C or warmer. Missing conditions stay missing. Course, exact-age, recorded-gender and early-pace filters select exact cohorts; sparse groups are never silently broadened. Early pace can itself respond to weather. Stratification does not isolate weather’s effect.</p>
      <p>Downhill-start comparisons cross the six same-race opening groups with a supplied first-5-km net descent greater than 25 m, or other known supplied profiles. Net change is a coarse route proxy: a section can contain climbs and descents, and historical route validity is unknown. No personal exposure, physiological effort or causal hill effect is inferred.</p>
      <p>Onset distributions pool only detected finishes and need at least 100 detections; their weighting differs from the edition-average slowdown rate. Actual pooled finish-time medians provide field context. The race-day browser shows individual editions with at least 100 matching finishes; one edition is useful for describing its own field but does not satisfy the three-edition requirement for a broader comparison.</p>
      <p>Slow-start and pacing-variability archive views reuse the all-finisher opening calculation. Weather profiles, course consistency, course profiles and same-edition pacing use the context calculation above. Earlier-best outcome panels retain their original cohorts and methods.</p>
      <p><Link href="/analyses/race-day-weather">Weather</Link> · <Link href="/analyses/course-comparison">Courses</Link> · <Link href="/analyses/downhill-start">Downhill starts</Link> · <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data/all-finisher-context/evidence.json`}>Calculation data and methods</a></p>
    </div></details>
    <details className="methodology" id="fast-start-method">
      <summary>Rank 2: What happens after a very fast start?</summary>
      <div className="methodology-content">
        <p><strong>All eligible finishes is the default.</strong> No previous race is needed. Compare each finish’s first 5 km pace with its own 5–20 km pace, then describe the sections that follow. Every finish passing the common timing and edition checks can contribute, including records without a linked race history. These are race performances, not a count of unique people or every raw record.</p>
        <p>This comparison finds unusually quick first sections. It cannot establish whether a runner started too fast for their fitness, and it will not flag a runner who maintains an ambitious pace through 20 km before fading. The 5–20 km pace is recorded after the start; it can already reflect that opening, terrain or congestion. Using it in both opening and later-slowdown ratios also makes those measurements statistically related.</p>
        <p><strong>Earlier-best comparison is a separate option.</strong> Compare first 10 km pace with the average marathon pace of the runner’s fastest eligible finish in the two strictly earlier calendar years. Current and same-year races cannot supply that benchmark. This smaller view uses screened supplied identity candidates, not name matching; those links are not independently verified people. An earlier best is not measured current fitness or a declared goal.</p>
        <p>In either mode, opening change is 100 × (opening pace ÷ reference pace − 1). Negative means faster. Six bands distinguish changes below −10%, −10% to below −5%, −5% to below −2%, −2% through 2%, above 2% through 5%, and above 5%. Exact decimal timing comparisons preserve these boundaries without rounding source times. The opening distance and reference differ between modes, so their group counts and results are not interchangeable.</p>
        <p>Course, exact-age group, recorded gender and opening band select the exact comparison. All eligible finishes has no earlier-time or speed filter. Earlier-best comparison additionally offers under 3:00, 3:00 to under 3:30, 3:30 to under 4:00, and 4:00 or longer, with an All option. Neither mode filters by a target or eventual finish. Each opening group needs at least 100 eligible finishes; sparse selections are not broadened. Missing age or gender stays in All and is not inferred.</p>
        <p>In All eligible finishes, the main time measure is actual time after 20 km minus the time that distance would take at the recorded 5–20 km pace. Its median and middle 80% describe observed differences from that calculated reference, not avoidable minutes or predicted finishes. The actual median finish is shown separately. Mean differences for the first 5 km and after 20 km add to the mean whole-race difference; the 5–20 km reference block contributes zero by definition.</p>
        <p>In Earlier-best comparison, finish outcomes show actual time differences from the earlier finish. Mean differences in the opening 10 km and the remaining distance add to the mean whole-race difference. Section curves in each mode show median pace changes relative to that mode’s reference. Medians for separate sections need not add to a finish median; percentile ranges describe variation between finishes, not confidence intervals or individual predictions.</p>
        <p>Sustained-slowdown rates use every finish in the selected opening group. The <a href="#slowdown-method">published slowdown definition</a> requires at least 25% slowing for at least 5 km after 20 km relative to the same race’s 5–20 km pace. Onset shares use only detected finishes and require at least 100 detections. They locate the first qualifying recorded section beginning at 20, 25, 30 or 35 km, not the exact instant or physiological cause of slowing.</p>
        <p>These are pooled observations from complete eligible finishers. The groups are not matched across race editions or adjusted for weather, terrain or changing fitness. A faster opening can accompany more late slowing and, in the history comparison, still a faster finish than an earlier best. Neither mode establishes a causal time penalty, an optimal strategy, physiological failure or the chance of not finishing. Detection begins after 20 km and cannot locate every earlier change in pace.</p>
        <Link href="/analyses/starting-pace">Open the fast-start analysis</Link>
      </div>
    </details>
    <h3>Shared personalized-engine methods</h3>
    <p>The following shared rules apply to the seven personalized primary views, the optional earlier-result course and weather modes, and the research guide. The separate all-finisher views use the exact filters above.</p>
    {getPersonalMethod().map((method, index) => <p key={`personal-common-${index}`}>{method}</p>)}
    <p>In the personalized engine, the visitor’s previous marathon time is compared with bands of earlier recorded bests, not an exact last-race match. A custom target can be any whole minute; success counts and nearby-finish comparisons use that exact threshold. Pacing profiles and improvement breakdowns use the clearly displayed 15-minute achieved-time band centered on the nearest preset, with the upper boundary excluded.</p>
    <p>Personalized-engine fallbacks keep the selected course and try broader age and gender groups before dropping an earlier-time restriction. Each answer prints its actual comparison group and identifies broadened filters. Cross-course comparisons use one common set of filters across all displayed courses. A missing comparison is not shown as zero. Age-group and course comparisons deliberately vary the dimension being compared. These fallback rules do not apply to the fast-start or all-finisher context analyses.</p>
    <p>Checkpoint comparisons use current elapsed progress instead of previous marathon time. They match a two-minute elapsed-time interval and, when entered, the most recent 5 km pace relative to elapsed average pace. The entered time determines the required remaining pace exactly, while historical outcomes describe the full matching interval. These retrospective proportions have not been calibrated as personal forecasts.</p>
    {PERSONAL_QUESTIONS.map(question => {
      const primary = question.id === 'opening' ? undefined : TEN_ANALYSES.find(item => item.id === question.id);
      return <details className="methodology" key={question.id}><summary>{question.title}</summary><div className="methodology-content"><p>{question.method}</p><Link href={primary ? analysisHref(primary) + (['courses', 'weather'].includes(question.id) ? '?comparison=history' : '') : `/research/personalized#guide-${question.id}`}>Open this personalized question</Link></div></details>;
    })}
    <p><a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data/packs/ext_personalized_guide/pack_meta.json`}>Personalized analysis coverage, provenance and calculation details</a></p>
    <h2>How to read the pacing charts</h2>
    <p><strong>“40 km” means the 35–40 km section.</strong> Pace profiles show section averages at the section’s end distance, not instantaneous pace at that timing mat. An upward movement means slower pace. Joining two averages with a line does not establish a sudden change at either checkpoint.</p>
    <ul>
      <li><strong>Full-course profiles:</strong> normalize each runner’s section pace by that runner’s full-marathon average, then take the median across runners. Below zero means faster than the individual marathon average.</li>
      <li><strong>Fast-start section profiles:</strong> compare each section with that finish’s 5–20 km pace in All eligible finishes, or the earlier-best marathon pace in Earlier-best comparison, then take the group median. These references differ from the current-race average used in full-course normalized profiles.</li>
      <li><strong>Equal-distance pace retention:</strong> compare 20–40 km with 0–20 km. Positive values mean the second 20 km was slower. The final 2.195 km is separate. This is not a half-marathon split; CORE does not provide a 21.0975 km checkpoint.</li>
      <li><strong>Pattern shares:</strong> a faster second 20 km means more than 2% faster; similar means within 2%; moderate slowing is more than 2% through 10%; pronounced slowing is more than 10%.</li>
      <li><strong>Exceptional-performance frequency:</strong> exceptional finishes divided by all classified finishes within a pacing pattern. This differs from asking what share of exceptional races used that pattern.</li>
      <li><strong>Missing values:</strong> unknown measurements stay missing. They are never plotted as zero.</li>
    </ul>
    <p>A median profile is a summary across runners, not one runner’s race or an optimal strategy. Outcome percentiles show variation between performances. Confidence intervals instead show uncertainty in an estimate; prediction intervals show a range for an individual future outcome. The charts keep these separate.</p>
    <p>Every section must be compared as pace or weighted by its distance. The final 2.195 km is shorter than a 5 km section. Twenty kilometers is before halfway, which is 21.0975 km.</p>
    <h2 id="data-quality">Which records can be analyzed?</h2>
    <p>The analyses require complete, strictly increasing checkpoints, a 90-minute to 12-hour finish, and section paces of 2–20 minutes per km. Missing or invalid readings are excluded, never repaired by guessing. These filters may exclude genuine unusual performances; sample counts and exclusions are recorded with each analysis. The reviewed edition policy also excludes incomplete, held, selected-field and known-invalid editions before results or earlier benchmarks are formed. Missing age or recorded gender alone does not remove usable timings from the overall cohort.</p>
    <p>The history analyses use the fastest eligible finish in the two strictly earlier calendar years as a benchmark. A substantially improved performance is more than 2% faster than that recorded best. The benchmark describes prior performance; it is not a measurement of current fitness or a course-adjusted expected finish. Supplied “ability,” personal-best and exceptional-performance labels are not used to define these outcomes.</p>
    <p>Historical-performance charts can express change as 100 × (current finish ÷ earlier benchmark − 1). Historical opening change compares first 10 km pace with that benchmark’s full-marathon average pace. Negative values mean faster. The archive and personalized guide’s three-group opening analyses classify starts as more than 2% faster, within 2%, or more than 2% slower. Rank 2 uses six bands, with a separate same-race reference in its default All eligible finishes mode. These thresholds describe recorded pacing, not physiological boundaries.</p>
    <p>Finishing-time groups are useful for describing race shapes. Strategy comparisons need ability known before the race, so that the result is not also used to define the comparison group.</p>
    <h2>How we link runners without mixing up records</h2>
    <p>The current full export supplies candidate runner identities and canonical record IDs. We verify that raw and feature IDs are unique, non-null and set-equal, then join each feature to its raw record by ID. Race, city, year, recorded name, finish time and every section duration must also agree, with timings rounded to milliseconds. A record ID identifies one result; it does not independently establish that results from different races belong to the same person.</p>
    <p>We reject identity groups with conflicting recorded gender, inferred birth years spanning more than two years, or duplicate records in an edition. These checks reduce errors; they do not independently confirm that every identity link is correct. Supplied names and runner IDs are included in the full downloadable data.</p>
    <p>Using only strictly earlier years prevents current-race and same-year results from entering the prior benchmark. Personal-best gains compare with the fastest finish in earlier recorded years; they cannot establish a lifetime best. Race-pair analyses use adjacent observations with one race in each endpoint year. The interval analysis instead uses exact supplied dates, restricted to identity groups with complete, unique date coverage.</p>
    <p>Exact-age analyses exclude age-group-only records. Reported gender is used as supplied and is never inferred from names. Unknown categories are preserved in overall counts where the analysis permits them.</p>
    <h2>Find your races</h2>
    <p>The name search checks recorded names in the current export. A matching name is a possible match, not proof of identity. Confirm the races that belong to you before comparing them; people can share a name, and a runner can appear under different spellings.</p>
    <p>Individual race views show the recorded result and split coverage. Analyses require usable timings and the same edition-quality rules as the rest of the study. A missing split is left missing. A fastest result means the best among the selected recorded races, not a verified lifetime personal best.</p>
    <p>Finish placement compares eligible records in the same race edition, with options for recorded gender, exact-age groups (18–24, then five-year bands through 85–89), and both together. Each comparison requires at least 101 finishes. Percentiles compare with the other finishes, counting ties halfway; higher means faster. These are observed database ranks, not official race placings.</p>
    <p>Pacing comparisons use a 15-minute achieved-finish-time band within the selected group. The median and middle 50% include your result and describe the pacing of similar finish times; they do not measure ability or prescribe a strategy. Late pace covers 30 km–finish relative to 5–20 km. Two selected races can also be compared section by section; the elapsed-time differences add up to the finish difference.</p>
    <p>Race-day context shows modeled start-hour weather and the following four hourly readings. Precipitation covers the hour preceding each reading, not your whole race. Supplied terrain sections have unverified historical validity, and their climbing totals can differ from the whole-route profile. Weather, terrain and changes in field composition help interpret comparisons; they do not produce an adjusted finish time or establish why a performance changed.</p>
    <p><Link href="/runners">Search recorded names and explore your races</Link></p>
    <h2>Matching, uncertainty and forecast validation</h2>
    <p>The research archive’s matched opening-strategy analysis matches race edition, recorded gender and 15-minute bands of prior performance. All three opening groups need at least 20 finishes within a stratum; the smallest group supplies a common weight. Its 95% interval comes from 500 resamples of whole race editions. This accounts for edition clustering, but not a runner appearing across editions. The current rank-2 fast-start analysis does not use this matching or uncertainty model; it reports pooled descriptive outcomes under exact filters.</p>
    <p>Other charts are descriptive unless their individual methods state otherwise. A large runner count does not eliminate confounding or create thousands of independent weather observations. No significance ranking or claim of an optimal strategy is made from the many comparisons.</p>
    <p>The checkpoint forecast is trained on earlier years and tested on the latest three observed years. It compares even-pace extrapolation with a model calibrated to elapsed pace, and then adds the latest pace trend. All inputs are available at the checkpoint. Training cells need 100 records; sparse cells use a documented fallback. The site reports actual forecast error and observed coverage of an 80% prediction interval.</p>
    <p>The forecast test holds out entire later race editions. Runners can appear in both periods, but identities are not model inputs. The same complete-finish cohort is used at every checkpoint; these results do not predict withdrawals or apply automatically to runners with missing splits.</p>
    <h2>Weather, routes and qualifying rules</h2>
    <p>The temperature-band analysis uses the Open-Meteo archive hour nearest the scheduled local start. Each temperature-band comparison gives equal weight to eligible race editions, with at least five editions per band. The additional humidity, warming and wind screen uses start-hour and race-window weather summaries, equal edition weights, course and year controls, temperature adjustment, and uncertainty resampled across whole courses. Only findings passing the documented evidence rule are published as analyses. These modeled conditions are proxies, not each runner’s measured exposure throughout the race.</p>
    <p>Course elevation comes from supplied GPX routes and digital elevation models, sometimes smoothed over 800 m. Historical validity years are absent. Terrain comparisons use the available city route as an explicitly labeled proxy; mixed hills, route changes, bridges and tunnels limit interpretation.</p>
    <p>The qualifying-rule comparison uses the B.A.A.’s published five-minute change for the 2020 Boston Marathon. It compares finish-time bunching around fixed old and new standards in 2016–2017 and 2019 for exact ages 18–31. It does not assign eligibility, acceptance, or declared Boston intentions. <a href="https://www.baa.org/news/2020-boston-marathon-qualifier-acceptances-announced/">Official standards and announcement</a>.</p>
    <h2>Return, missing follow-up and new exports</h2>
    <p>The near-miss analysis includes runners who have no later observed race. It requires two subsequent years of observed editions in the original city and excludes the latest two years as index races. Return means an eligible linked appearance anywhere in the export in the next two calendar years. Missing follow-up is never called retirement.</p>
    <p>Every calculation records the input export, checksums, method version, eligible count and exclusions. New data releases can rerun the same calculations. Aggregate results are validated and reviewed before the website changes; downloadable calculation files retain the exact source identifiers for reproducibility.</p>
    <h2>What can these comparisons establish?</h2>
    <p>They describe associations. Runners selecting different strategies can also differ in fitness, experience, goals, or conditions. Comparisons should account for these differences and report sample sizes and uncertainty.</p>
    <p>Predictions must use information available at the checkpoint being studied and be tested on unseen race editions. Declared goals should be distinguished from inferred time landmarks. An absence from the database does not establish that a runner stopped racing.</p>
    <p>Splits measure time and pace. Physiological effort, fueling, intentions, and training need additional evidence. Terrain-adjusted pace is an estimated proxy, especially when a 5 km section contains both climbs and descents.</p>
    <h2>How the questions fit together</h2>
    <p>The research archive’s {QUESTIONS.length} questions are organized around race strategy, courses and conditions, goals and finishing, runner differences, and learning over time. The original question lists are incorporated, alongside six additions about successful strategies, personal-best gains, congestion, consistency, and course adaptation.</p>
    <h2 id="question-methods">Methods for every question</h2>
    <p>Open a question for its actual definitions, comparison groups, sample rules and limits. The result page contains the answer and charts.</p>
    {questions.map(question => <details className="methodology" key={question.id}>
      <summary>{question.number}. {question.title}</summary>
      <div className="methodology-content">
        {question.method.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {question.nextAnalysis && <p><strong>Still needed:</strong> {question.nextAnalysis.needs}</p>}
        <div className="source-links"><Link href={`/packs/${question.id}`}>Read the answer &amp; charts</Link>{question.sources.map(source => <a href={source.href} key={source.href}>{source.label}</a>)}</div>
      </div>
    </details>)}
    <details className="methodology" id="slowdown-method">
      <summary>Focused analysis: sustained slowdown</summary>
      <div className="methodology-content">
        <p>{study.method[0]}</p>
        <p>This definition identifies sustained slowing. It cannot determine whether the cause was fuel depletion, injury, fatigue, walking, or another factor. It is one outcome within the wider pacing study.</p>
        <p>The definition follows the <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0251513">Published slowdown method (2021)</a>. <Link href="/slowdown">Explore the sustained slowdown analysis</Link>.</p>
      </div>
    </details>
    <details className="methodology" id="additional-data">
      <summary>Additional web data that could strengthen the study</summary>
      <div className="methodology-content">
        <p>Start with dated course routes, hourly weather, and start times. These are proposed sources for extending and validating the dataset; availability here does not mean every source has already been joined.</p>
        {additions.map(item => <section key={item.name}>
          <h3>{item.name}</h3>
          <p>{item.fields} {item.benefit}</p>
          <p className="study-meta">{item.coverage} <a href={item.href}>{item.source}</a>.</p>
        </section>)}
        <h3>More fields to retain from official results</h3>
        <p>Keep all published timing points, including halfway and the finish; bib and provider IDs; reported age and category; gun and chip times; official finish, withdrawal, disqualification, and non-start statuses; and result corrections. Availability varies by organizer and year.</p>
        <p>Do not infer a withdrawal from one missing timing read, or a debut marathon from a runner’s first appearance in this database.</p>
        <h3>Preserve the evidence</h3>
        <p>For every added field, retain its source URL, race edition, retrieval date, original unit, and whether it was observed, modeled, or inferred. Keep one weather record per place and time, then join it to estimated segment exposure. Between timing mats, a runner’s exact location is an estimate.</p>
        <p>Hourly wind plus route direction can estimate headwind exposure. Route geometry can estimate turn counts. Crowd density, shade, training, shoes, and individual fueling are harder to reconstruct consistently over 20 years and should not be assumed.</p>
      </div>
    </details>
    <div className="source-links"><Link href="/">Return to the study</Link><a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data/study/evidence.json`}>Download the current supporting study</a></div>
    {dataset ? <JsonLd data={dataset} /> : null}
  </article>;
}
