import { Fragment } from 'react';
import { UnitLink as Link, UnitText } from '@/components/UnitsProvider';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { getFinishTimeSummary, clockMinute } from '@/lib/finish-times-summary';
import { readInsight } from '@/lib/insights-server';
import { PERSONAL_QUESTIONS } from '@/lib/personalized-catalog';
import { getPersonalMethod, getPersonalSummary } from '@/lib/personalized-data';
import { EXTRA_TITLES, QUESTIONS } from '@/lib/question-catalog';
import { getExtraAnswer, getQuestions } from '@/lib/research-data';
import { splitAnswer } from '@/lib/research-display';
import { TEN_ANALYSES, analysisHref } from '@/lib/ten-analyses';
import { CHAPTERS, livePages } from '@/lib/chapters';
import { countWord } from '@/lib/nuggets/format';
import { WEATHER_QUESTIONS, weatherHref } from '@/lib/weather-catalog';
import { getWeatherAnalyses, getWeatherEvidence } from '@/lib/weather-data';
import { Detail, Topic, and, dataHref, day, n } from './shared';

/** What each weather question can and cannot show (the caveats its page carried until October 16, 2026). */
const WEATHER_LIMITS: Record<string, string> = {
  humidity: 'Dew point describes moisture alongside temperature. This comparison does not isolate a physiological humidity penalty or predict any runner’s response.',
  warming: 'The temperature at the start is only part of the day, so this question compares how much conditions warm in the first four hours with pacing later in the race. The fixed four-hour window can extend beyond a faster runner’s finish. The association does not prove that warming caused a pacing change, or say how much time any runner will lose.',
  wind: 'This question asks whether typical differences in start-hour wind speed line up with more slowing later. It covers typical start-hour winds in the studied editions. It is not evidence that strong winds are harmless or that wind cannot affect finish times. Headwinds, gusts and total finish-time losses were not tested.',
};

/**
 * The sentences of a stored research answer that its page leaves off (definitions, sample notes and limits), or the
 * reason a question has no answer. The page shows the findings only (lib/research-display.ts).
 */
function AnswerNotes({ question }: { question: Parameters<typeof splitAnswer>[0] }) {
  const { moved } = splitAnswer(question);
  if (!moved.length) return null;
  return <p><strong>{question.available ? 'Reading the answer:' : 'Why it has no answer:'}</strong> {moved.join(' ')}</p>;
}

/** "Ten" as a sentence's first word. */
const Capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The analyses, fast starts, all-finisher views, finish times, weather questions and the research archive. */
export default function MethodsAnalyses() {
  const personalized = getPersonalSummary();
  const allFinisher = getAllFinisherContextStart();
  const finishTimes = getFinishTimeSummary();
  const all = finishTimes.groups.all;
  const weather = getWeatherEvidence();
  const ready = getWeatherAnalyses(weather);
  const withheld = weather.candidates.filter((candidate) => candidate.status !== 'ready');
  const questions = getQuestions();
  const calculated = questions.filter((question) => question.dataset);
  const downhill = readInsight<{ courses: { city: string; downhill_opening: boolean }[] }>('tools/course-goal.json').courses.filter((c) => c.downhill_opening).map((c) => c.city);
  const extras = Object.keys(EXTRA_TITLES).filter((id) => id !== 'smyth_htw').map((id) => getExtraAnswer(id));
  const confidence = weather.prespecified_gate.confidence;
  // The counts the analyses' paragraph names, from the registries (never typed): the registry's analyses, those that run on
  // the personalized engine by default (fast starts, courses and weather, the three the paragraph names, have their own
  // views) and the guide's.
  const ranked = TEN_ANALYSES.length;
  // The analysis pages the chapters list beyond the registry's (downhill starts), counted so the total agrees with /analyses.
  const unranked = CHAPTERS.flatMap((c) => livePages(c)).filter((p) => p.kind === 'analysis' && !TEN_ANALYSES.some((a) => p.href === analysisHref(a))).map((p) => p.short);
  const OWN_VIEWS = ['opening', 'courses', 'weather'];
  const engine = PERSONAL_QUESTIONS.filter((q) => TEN_ANALYSES.some((a) => a.id === q.id) && !OWN_VIEWS.includes(q.id)).length;
  // The analyses with their own views: the three above, then the pages beyond the registry (downhill starts).
  const ownViews = and(['Fast starts', 'course comparisons', 'race-day weather', ...unranked.map((name) => name.toLowerCase())]);
  // Paragraphs that three or more research questions repeat word for word (the timing screens, the record joins, the
  // earlier benchmark and the like): said once, above the questions, which then keep only their own.
  const folds = [...questions, ...extras];
  const seen = new Map<string, number>();
  for (const fold of folds) for (const paragraph of new Set(fold.method)) seen.set(paragraph, (seen.get(paragraph) ?? 0) + 1);
  const sharedList = [...seen.entries()].filter(([, k]) => k >= 3).map(([paragraph]) => paragraph);
  const shared = new Map(sharedList.map((paragraph, i) => [paragraph, i + 1]));
  const own = (method: string[]) => method.filter((paragraph) => !shared.has(paragraph));
  /** The shared rules a question follows, by number, each linked to its text. */
  const ruleRefs = (method: string[]) => {
    const numbers = [...new Set(method.map((paragraph) => shared.get(paragraph)).filter((k): k is number => k !== undefined))].sort((a, b) => a - b);
    return numbers.length ? <p>Shared rules it follows: {numbers.map((k, i) => <Fragment key={k}>{i ? ', ' : ''}<a href={`#question-rule-${k}`}>{k}</a></Fragment>)}.</p> : null;
  };
  return <>
    <Topic id="personalized" title="The analyses">
      {personalized && <p>The personalized analyses use {n(personalized.n)} eligible finishes, {n(personalized.age_n)} of them with an exact usable age. The usable earlier-benchmark cohort holds {n(personalized.history_n)} finishes. Combining course, age, recorded gender and earlier-time filters can make samples much smaller.</p>}
      <p>The {countWord(ranked + unranked.length)} analyses are listed by chapter. {Capital(countWord(engine))} use the personalized engine. {ownViews} have their own views that need no earlier result, described below. Each page shows only the controls that apply to its question. The {countWord(PERSONAL_QUESTIONS.length)} original personalized comparisons are described below, and their data stay free to download.</p>
      <h4>Earlier-result views and broadened filters</h4>
      <p>The earlier-result views (where improving runners find time, and the original course and weather comparisons) need a usable recorded history. Leaving the earlier-time filter blank includes every eligible history group, but never finishes without an earlier benchmark. One race cannot show improvement. Improvement compares a finish with the fastest eligible finish in any strictly earlier year; the course and weather finish changes use the fastest eligible finish in the two strictly earlier calendar years.</p>
      <h4>Shared personalized-engine methods</h4>
      <p>These rules apply to the {countWord(engine)} personalized views and to the original personalized comparisons, including the earlier-result course and weather questions. The all-finisher views use the exact filters described under <a href="#all-finisher-context">All-finisher views</a>.</p>
      {getPersonalMethod().map((method, index) => <p key={`personal-common-${index}`}>{method}</p>)}
      <p>A visitor’s previous marathon time is compared with bands of earlier recorded bests, not an exact last-race match. A custom target can be any whole minute; success counts and nearby-finish comparisons use that exact threshold. Pacing profiles and improvement breakdowns use the displayed 15-minute achieved-time band centered on the nearest preset, with the upper boundary excluded.</p>
      <p>When a narrow combination of filters has too few finishes, the engine keeps the selected course and tries broader age and gender groups before dropping an earlier-time restriction. Each answer names any filter it broadened. Cross-course comparisons use one common set of filters across all displayed courses. A missing comparison is never shown as zero or filled with an invented estimate. Age-group and course comparisons deliberately vary the dimension being compared. These fallback rules do not apply to the fast-start or all-finisher views.</p>
      <p>Checkpoint comparisons use current elapsed progress instead of a previous marathon time. They match a two-minute elapsed-time interval and, when entered, the most recent 5 km pace against the elapsed average pace. They need at least 100 complete finishes in the elapsed-time band, even after broadening age, gender and recent pace trend. The entered time sets the required remaining pace exactly, while historical outcomes describe the whole matching interval. These proportions have not been calibrated as personal forecasts.</p>
      {PERSONAL_QUESTIONS.map((question) => {
        const primary = question.id === 'opening' ? undefined : TEN_ANALYSES.find((item) => item.id === question.id);
        // A question with an analysis of its own links to it; the earlier-result course and weather comparisons have none.
        const page = primary && !['courses', 'weather'].includes(question.id) ? analysisHref(primary) : null;
        return <Detail key={question.id} title={question.title}><p>{question.method}</p>{page ? <p className="methods-links"><Link href={page}>Open the analysis</Link></p> : null}</Detail>;
      })}
      <Detail id="guide-answers" title="Reading each personalized answer">
        <p>Pace-profile answers describe achieved finishes in the displayed band. The visitor’s time is a comparison threshold, and historical intentions are unknown.</p>
        <p>Opening pace is compared with each runner’s earlier recorded best, not a declared goal, and each opening group has its own denominator.</p>
        <p>In the downhill question, a positive late pace change means slower over the final 12.195 km than the 5–20 km baseline. This does not establish a downhill effect.</p>
        <p>Nearby-finish section charts compare finishes in the five minutes below the target with those from the target to under five minutes above it. Higher values mean more time than the target’s even-pace section budget.</p>
        <p>Age answers compare pace retention: positive means the second 20 km was slower than the first, and the final 2.195 km is separate. Each age group shows its own sample, and the comparison does not follow individuals as they age.</p>
        <p>In course answers, below zero means faster than the earlier benchmark, and the 10th–90th percentile range describes outcome variation. Course, field selection, fitness changes and conditions stay mixed together.</p>
        <p>Weather answers compare finishes with earlier recorded bests, not the visitor’s target, and every edition has equal weight. The weather bands need at least three editions and 100 finishes each, and they do not isolate a temperature penalty.</p>
        <p>Without an earlier time, the target answer is a field comparison; with one, its runners had earlier recorded bests in the displayed band. Either way the share is descriptive, not a calibrated prediction.</p>
        <p>Returning-runner answers normalize both appearances to their own marathon average. These paired changes can reflect fitness, conditions and route changes as well as familiarity, and they are not selected by the visitor’s target.</p>
        <p>Improvement answers split the mean total improvement into three blocks that add up to it.</p>
        <p>Terrain answers show the available city route profile beside pooled historical finishes. They do not establish the terrain used in each edition or explain an individual slowdown.</p>
        <p>The earlier-result comparisons and the questions on improvement gains and returning to a course need an earlier recorded result.</p>
      </Detail>
    </Topic>

    <Topic id="fast-start-method" title="Fast starts">
      <p><strong>All eligible finishes is the default.</strong> No previous race is needed. Each finish’s first 5 km pace is compared with its own 5–20 km pace, then the sections that follow are described. Every finish that passes the common timing and edition checks can contribute, including records without a linked race history. These are race performances, not a count of unique people or of every raw record.</p>
      <p>This comparison finds unusually quick first sections. It cannot show whether a runner started too fast for their fitness, and it will not flag a runner who holds an ambitious pace through 20 km before fading. The 5–20 km pace is recorded after the start, so it can already reflect that opening, terrain or crowding. Using it in both the opening and the later-slowdown ratios also ties those two measures together.</p>
      <p><strong>The earlier-best comparison is a separate option.</strong> It compares the first 10 km pace with the average marathon pace of the runner’s fastest eligible finish in the two strictly earlier calendar years. Current and same-year races cannot supply that benchmark. This smaller view uses screened identity candidates, not name matching; those links are not verified people. An earlier best is not current fitness or a declared goal.</p>
      <p>In either mode, the opening change and its six bands are the <a href="#opening-groups">opening groups</a>. The opening distance and reference differ between modes, so their counts and results are not interchangeable.</p>
      <p>Course, exact-age group, recorded gender and opening band select the exact comparison. All eligible finishes has no earlier-time or speed filter. The earlier-best comparison also offers under 3:00, 3:00 to under 3:30, 3:30 to under 4:00, and 4:00 or longer, with an All option. Neither mode filters by a target or eventual finish. Each opening group needs at least 100 eligible finishes; sparse selections are not broadened. Missing age or gender stays in All and is not inferred.</p>
      <p>In All eligible finishes, the main time measure is the <a href="#baselines">time after 20 km</a>. Its median and middle 80% describe observed differences from that calculated reference, not avoidable minutes or predicted finishes. The actual median finish is shown separately. Mean differences for the first 5 km and after 20 km add up to the mean whole-race difference; the 5–20 km reference block contributes zero by definition.</p>
      <p>In the earlier-best comparison, finish outcomes show actual time differences from the earlier finish. Mean differences in the opening 10 km and the remaining distance add up to the mean whole-race difference. Section curves in each mode show median pace changes against that mode’s reference. Medians for separate sections need not add up to a finish median.</p>
      <p>Sustained-slowdown rates use every finish in the selected opening group, with the <a href="#sustained-slowdown">published definition</a>. Onset shares use only finishes with a sustained slowdown and need at least 100 of them. They locate the first qualifying recorded section beginning at 20, 25, 30 or 35 km, not the exact moment or physiological cause.</p>
      <p>These are pooled observations from complete eligible finishes. The groups are not matched across race editions or adjusted for weather, terrain or changing fitness. A faster opening can go with more late slowing and, in the history comparison, still a faster finish than an earlier best. Neither mode establishes a time penalty, a best strategy, physiological failure or the likelihood of not finishing.</p>
      <p className="methods-links"><Link href="/analyses/starting-pace">Open the fast-start analysis</Link><a href={dataHref('fast-start/all-finishers.json')}>All-finisher data</a><a href={dataHref('fast-start/evidence.json')}>Earlier-result data</a></p>
    </Topic>

    <Topic id="all-finisher-context" title="All-finisher views: courses, race-day weather and downhill starts">
      <p>The all-finisher views (course comparison, race-day weather, downhill starts and the archive views built on them) start from every eligible finish: {n(allFinisher.analysis_n)} in the current release. No earlier race or identity link is needed, and the same person can contribute several races. Weather groups also need a validated start-hour temperature, and terrain groups a supplied opening elevation profile. A finish missing weather or terrain still counts in the other pacing comparisons. Missing ages and recorded genders stay in All. Incomplete and held source editions are left out but stay searchable in Find a runner.</p>
      <p><UnitText>{'Each eligible finish supplies its own 5–20K pace reference. The views compare late pace (30K to the finish), the time after 20K, nine section paces and sustained slowdown. No identity link, earlier result, target or eventual-finish filter is used. Optional early-pace groups use observed 5–20K pace: below 4:30/km, from 4:30/km to below 5:30/km, from 5:30/km to below 6:30/km, and 6:30/km or slower. This is pace run on the day, not measured fitness.'}</UnitText></p>
      <p>Course, temperature and terrain groups need at least {allFinisher.min_edition} selected finishes per edition, {allFinisher.min_editions} editions and {allFinisher.min_cell} finishes in total. Every retained edition has equal weight in slowdown rates and in averages of edition medians. The middle 80% of edition medians describes differences between editions, not a confidence interval or any runner’s range. Pacing consistency takes the middle-80% spread of late pace change within each edition, then averages those spreads. These describe different race fields. They do not rank course difficulty or estimate a heat penalty.</p>
      <p>The <a href="#baselines">time after 20 km</a> averages edition medians. The finish counts in the exact-values tables are pooled finishes; they are not the denominator of the edition-weighted slowdown rate.</p>
      <p>Temperature groups use validated modeled start-hour temperature: below 5 °C, 5 to below 10 °C, 10 to below 15 °C, 15 to below 20 °C, and 20 °C or warmer. Missing conditions stay missing. Course, exact-age, recorded-gender and early-pace filters select exact cohorts; sparse groups are never quietly broadened. Early pace can itself respond to weather, so stratifying by it does not isolate weather’s effect.</p>
      <p>Downhill-start comparisons cross the six <a href="#opening-groups">opening groups</a> with a supplied first-5 km net descent greater than 25 m, or other known supplied profiles.{downhill.length ? ` On the current routes, the courses with that descent are ${and(downhill)}.` : ''} Their fields and other course features differ, so the comparison cannot isolate a downhill effect. Net change is a coarse route proxy: a section can hold climbs and descents, and historical route validity is unknown. No personal exposure, physiological effort or hill effect is inferred.</p>
      <p>Onset distributions pool only finishes with a sustained slowdown and need at least 100 of them; their weighting differs from the edition-average slowdown rate. Actual pooled finish-time medians give field context.</p>
      <p>The race-day browser shows one edition at a time, with at least 100 matching finishes. It describes the eligible finishes in that edition, not official standings or every starter, and one edition does not meet the three-edition requirement for a broader comparison. Its start-hour temperature is modeled, and its opening elevation change is the supplied net change over the first 5 km. To compare one runner with peers from the same edition, use <Link href="/runners">Find a runner</Link>.</p>
      <p>The slow-start and pacing-variability archive views reuse the all-finisher opening calculation. Weather profiles, course consistency, course profiles and same-edition pacing use the context calculation above. Earlier-best outcome panels keep their original cohorts and methods.</p>
      <p className="methods-links"><Link href="/analyses/race-day-weather">Weather</Link><Link href="/analyses/course-comparison">Courses</Link><Link href="/analyses/downhill-start">Downhill starts</Link><a href={dataHref('all-finisher-context/evidence.json')}>Calculation data and methods</a></p>
    </Topic>

    <Topic id="finish-times" title="Finish times">
      <p>The finish times page uses {n(finishTimes.coverage.finishes)} recorded finishes from {n(finishTimes.coverage.editions)} editions of {finishTimes.coverage.races} large city marathons, {finishTimes.coverage.firstYear} to {finishTimes.coverage.lastYear} (the summary built {day(finishTimes.asOf)}, from the same release). They are not a sample of all marathons: smaller, local and trail marathons are not in this data, and their finish times can look quite different. Each finish has a time at every official checkpoint and passed the <a href="#data-quality">quality screens</a>.{finishTimes.coverage.duplicates.map((d) => ` ${d.city} ${and(d.years.map(String))} ${d.years.length > 1 ? 'are' : 'is'} left out because ${d.years.length > 1 ? 'their' : 'its'} records repeat the ${d.city} ${d.duplicateOf} field.`).join('')}</p>
      <p>Counts are finishes, not runners: someone who ran three of these races counts three times, and a race that was not finished is in no count. Women and men are as each race recorded them; {n(finishTimes.coverage.otherOrNotRecorded)} finishes have another or no recorded gender and count in all finishes only. Exact ages are recorded in only some of these races, so the page does not split finish times by age; <Link href="/analyses/age-and-pacing">Age and pace retention</Link> compares age groups where ages are recorded.</p>
      <p>On this page, average means the median: the middle finish when all are ranked by time. It shows no mean. The published minute counts run from {clockMinute(finishTimes.firstMinute)} to {clockMinute(finishTimes.lastMinute)}, so finishes outside them have no published time and cannot enter a mean, while the median needs only how many there are. {n(all.outside)} finishes ({((all.outside / all.total) * 100).toFixed(1)}%) fall outside those minutes, faster than {clockMinute(finishTimes.firstMinute)}:00 or slower than {clockMinute(finishTimes.lastMinute)}:59; the published counts do not say how many are on each side. They stay in every total, and for ranks and shares they count as slower than {clockMinute(finishTimes.lastMinute)}. Checked against the full finish records, that changes no figure on the page.</p>
      <p>Times are whole minutes of recorded finish time: 4:10 covers 4:10:00 to 4:10:59, and each percentile is the whole minute in which that finish crossed the line, counted within its group. “Under 3:00” means 2:59:59 or faster. Even paces are calculated from the time over the marathon distance, not recorded.</p>
    </Topic>

    <Topic id="weather" title="Weather questions">
      <p>The humidity, warming and wind questions compare late-race slowing across race editions. Slowing is the median, among an edition’s complete finishes, of the percentage change in pace from 0–20 km to 20–40 km; the final 2.195 km is left out. Differences are in percentage points: 7% slowing instead of 5% is a difference of 2 percentage points.</p>
      <p>The comparison is made within courses and accounts for start temperature, calendar year and the other modeled weather factors. Field composition and other differences can still matter. Each edition has equal weight. The questions cover {n(weather.cohort.weather_analysis_editions)} race editions on {n(weather.cohort.weather_analysis_courses)} courses, with {n(weather.cohort.weather_analysis_finishes)} complete finishes.</p>
      <p>The uncertainty range is a {(confidence * 100).toFixed(1)}% interval because three weather questions were tested together. When a question shows little change, the shaded band on its chart marks differences smaller than {weather.prespecified_gate.practical_difference_pp} percentage point in either direction, and the whole range stays inside it. Otherwise the dot is the estimated difference and the line is the uncertainty range, which stays on one side of zero. The race-day chart shows observed edition values before adjustment, every dot the same size whatever the field size. Browsing a course shows its editions; the adjusted result stays the full-study comparison.</p>
      <p>Humidity, warming and wind were screened together: {ready.length} of the {weather.candidates.length} questions met the publication rule.{withheld.length ? ` The ${and(withheld.map((c) => c.id))} result did not support a clear enough takeaway for its own page.` : ''} The download keeps all three estimates and their uncertainty.</p>
      <ul>{WEATHER_QUESTIONS.map((question) => <li key={question.id}><strong>{ready.some((r) => r.id === question.id) ? <Link href={weatherHref(question)}>{question.shortTitle}</Link> : question.shortTitle}.</strong> {WEATHER_LIMITS[question.id]}</li>)}</ul>
      <Detail title="How the weather screen was calculated">
        {weather.methodology.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </Detail>
      <p className="methods-links"><a href={dataHref('weather/evidence.json')}>All three screening results and edition values</a><a href="https://open-meteo.com/en/docs/historical-weather-api">Weather source definitions</a></p>
    </Topic>

    <Topic id="question-methods" title="Research questions">
      <p>The research archive’s {QUESTIONS.length} questions are organized around race strategy, courses and conditions, goals and finishing, runner differences, and learning over time. The original question lists are included, with six additions about successful strategies, personal-best gains, crowding, consistency and course adaptation. {calculated.length} of the {QUESTIONS.length} questions have results recalculated from the public export.</p>
      <p>Some answers are partial: a course comparison cannot isolate a course’s effect, and a route proxy cannot establish the hills used in an old edition. Group running and crowding need start and checkpoint clock times that this export does not have.</p>
      <p>Questions about improvement, repeat races, course familiarity and learning compare linked races, so they need a recorded race history. With one race, you can still explore opening pace and late slowing, or a race’s conditions and same-edition peers; those cannot show personal improvement or learning. Weather, course patterns, slow starts and opening consistency also include finishes without an earlier race. Their original recorded-history comparisons stay in the research archive, with their own definitions and a smaller cohort than the single-race views.</p>
      <p>Open a question for its definitions, comparison groups, sample rules, limits and data files. Chart samples can be smaller than the eligible cohort. Every question’s data is under <a href="#archive">Downloads</a>.</p>
      {sharedList.length ? <>
        <h4 id="question-rules">Shared rules</h4>
        <p>Many questions follow the same rules. Each is written once here, and every question names the ones it follows.</p>
        <ol className="methods-rules">{sharedList.map((paragraph, index) => <li key={index} id={`question-rule-${index + 1}`}>{paragraph}</li>)}</ol>
      </> : null}
      {questions.map((question) => <Detail key={question.id} title={`${question.number}. ${question.title}`}>
        {own(question.method).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {ruleRefs(question.method)}
        {question.dataset && <p><strong>Eligible sample:</strong> {n(question.dataset.n)} {question.dataset.unit || 'eligible finishes'}{question.dataset.scope && question.dataset.scope !== 'descriptive' ? ` (${question.dataset.scope})` : ''}.</p>}
        {question.detail && <p><strong>Keep in mind:</strong> {question.detail}</p>}
        <AnswerNotes question={question} />
        {question.nextAnalysis && <><p><strong>Measure:</strong> {question.nextAnalysis.measure}</p><p><strong>Compare:</strong> {question.nextAnalysis.compare}</p><p><strong>Still needed:</strong> {question.nextAnalysis.needs}</p></>}
        {question.sources.length > 0 && <p className="methods-links">{question.sources.map((source) => <a href={source.href} key={source.href}>{source.label}</a>)}</p>}
      </Detail>)}
      <h4 id="supporting-analyses">Supporting analyses</h4>
      <p>These supporting analyses in the archive list their methods and data here.</p>
      {extras.map((extra) => <Detail key={extra.id} title={extra.title}>
        {own(extra.method).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        {ruleRefs(extra.method)}
        {extra.dataset && <p><strong>Eligible sample:</strong> {n(extra.dataset.n)} {extra.dataset.unit || 'eligible finishes'}{extra.dataset.scope && extra.dataset.scope !== 'descriptive' ? ` (${extra.dataset.scope})` : ''}.</p>}
        {extra.detail && <p><strong>Keep in mind:</strong> {extra.detail}</p>}
        <AnswerNotes question={extra} />
        {extra.sources.length > 0 && <p className="methods-links">{extra.sources.map((source) => <a href={source.href} key={source.href}>{source.label}</a>)}</p>}
      </Detail>)}
    </Topic>
  </>;
}
