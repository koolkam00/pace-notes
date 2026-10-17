import { UnitLink as Link } from '@/components/UnitsProvider';
import { readInsight } from '@/lib/insights-server';
import { getStudyAnswer, getStudyEvidence, getWallTimingAnswer } from '@/lib/research-data';
import { getStudyFigures } from '@/lib/study-figures';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { Part, Topic, and, dataHref, n, pctText } from './shared';

type Archetypes = { cohort_n: number; classifier: { names: string[] } };

/** Part 2: the terms every page uses, starting with the sustained-slowdown definition and its published-method citation. */
export default function MethodsDefinitions() {
  const study = getStudyEvidence();
  const answer = getStudyAnswer();
  const timing = getWallTimingAnswer();
  const definitionText = answer.method[0];
  // Each figure repeats the definition as its first line; it is shown once, above.
  const figures = getStudyFigures().map((figure) => ({ ...figure, method: figure.method.filter((line) => line !== definitionText) }));
  const types = readInsight<Archetypes>('archetypes.json');
  // The definition-sensitivity check (on /slowdown until October 16, 2026): the share of finishes that qualify under
  // other thresholds and lengths, read from the study's own figure rows.
  const sensitivity = figures.find((figure) => figure.id === 'sensitivity')?.charts[0]?.rows ?? [];
  const lengths = [...new Set(sensitivity.map((row) => String(row.length)))];
  const thresholds = [...new Set(sensitivity.map((row) => Number(row.label)))].sort((a, b) => a - b);
  const cell = (threshold: number, length: string) => sensitivity.find((row) => Number(row.label) === threshold && String(row.length) === length);
  return <Part id="definitions" eyebrow="Part 2" title="Definitions">
    <Topic id="sustained-slowdown" title="Sustained slowdown">
      <p className="methods-definition">{SLOWDOWN_DEFINITION}</p>
      <p>Each full 5 km section from 20–25 km to 35–40 km is checked, so one slow section is enough. The final 2.195 km can extend a run of slow sections but cannot start one. The onset is the first qualifying section: a section boundary, not an exact moment. Because the comparison starts at 20 km, a sustained slowdown can only begin after 20 km.</p>
      <p>The definition follows a <a href={SLOWDOWN_CITATION.url}>{SLOWDOWN_CITATION.label.replace(/^Published/, 'published')}</a>. Every page that uses the term links here.</p>
      <p>The <a href="#baselines">5–20 km pace</a> comes from the same finish, so every finish is measured against itself. The definition finds sustained slowing. It cannot tell whether the cause was fuel, injury, fatigue, walking or something else. A finish without a detected sustained slowdown can still have slowed more mildly or for a shorter stretch. On the tools and the race report, <strong>held pace</strong> means no sustained slowdown.</p>
      {study && <>
        <h4 id="slowdown-method">The sustained-slowdown study</h4>
        <p>{n(study.detected)} of {n(study.n)} eligible finishes ({pctText(study.detected / study.n)}) had a sustained slowdown. The same runner may appear more than once. The study uses the same complete-split, reviewed edition-quality cohort as the main analyses. Missing age or gender alone does not remove a finish. Rates describe recorded finishes, not unique people or physiological causes.</p>
        <p><strong>When episodes begin.</strong> {timing.method.filter((line) => line !== definitionText).join(' ')} Each boundary locates the first qualifying recorded section.</p>
        {figures.map((figure) => <p key={figure.id}><strong>{figure.title}</strong> {figure.answer} {figure.method.join(' ')}</p>)}
        {thresholds.length > 0 && lengths.length > 0 && <>
          <h4 id="definition-sensitivity">How much the definition matters</h4>
          <p>The share of the same {study ? n(study.n) : ''} eligible finishes that would qualify with a different minimum slowdown or a different minimum length. The published definition is 25% for 5 km.</p>
          <div className="table-scroll" role="region" aria-label="Share of finishes that qualify by threshold and length" tabIndex={0}><table className="data-table methods-sensitivity">
            <thead><tr><th scope="col">Minimum slowdown</th>{lengths.map((length) => <th scope="col" key={length}>{length}</th>)}</tr></thead>
            <tbody>{thresholds.map((threshold) => <tr key={threshold}><th scope="row">{threshold}%</th>{lengths.map((length) => {
              const row = cell(threshold, length);
              const v = Number(row?.value);
              return <td key={length}>{row && Number.isFinite(v) ? `${v.toFixed(v < 0.05 ? 2 : 1)}%` : '–'}</td>;
            })}</tr>)}</tbody>
          </table></div>
        </>}
        <p><a href={dataHref('study/evidence.json')}>Download the study’s results, methods and source checksums</a>. <Link href="/slowdown">See the sustained-slowdown study</Link>.</p>
      </>}
    </Topic>

    <Topic id="pacing-types" title="Pacing types">
      <p>A pacing type is the shape of one race. Each section’s pace is compared with the finish’s whole-race average pace. Those nine numbers are clipped at the 0.1st and 99.9th percentiles, and the short final section counts for less (its weight is √(2.195 ÷ 5)). K-means grouping of {n(types.cohort_n)} complete finishes gives six centroids: {and(types.classifier.names)}. The rules that name them are in the <a href="#story-pacing-types">pacing-types story’s method</a>.</p>
      <p>Every finish, on any page, gets the nearest of the six centroids, assigned after the race from its own splits. A type describes a shape. It is not a grade and says nothing about fitness, physiology or advice. Shapes form a continuum, and the six names mark common regions. Because each section is compared with the finish’s own average, a quick start partly reflects a slow ending.</p>
      <p>In a pacing sentence, F is a section more than 3% faster than the finish’s own average pace, E is within 3% and S is more than 3% slower.</p>
    </Topic>

    <Topic id="percentiles" title="Percentiles, ranges and intervals">
      <ul>
        <li>A <strong>percentile</strong> ranks finishes by time within a group. By the 10th percentile, one finish in ten had come in; by the 90th, nine in ten. The <strong>median</strong> is the middle finish.</li>
        <li>The <strong>middle half</strong> runs from the 25th to the 75th percentile, and the <strong>middle 80%</strong> from the 10th to the 90th. Both describe variation between finishes. They are not confidence intervals and not recommended plans.</li>
        <li>A <strong>confidence interval</strong> shows uncertainty in an estimate. A <strong>prediction interval</strong> shows a range for one future outcome. The charts keep these apart.</li>
        <li>A <strong>finish percentile</strong> on a runner record compares a finish with the other eligible finishes in its group, with ties counting halfway. Higher means faster. It is an observed rank in this data, not an official placing.</li>
        <li><strong>Shares</strong> are observed shares of complete finishes, said as past facts: what finishes had or ran. None is a forecast for any one runner.</li>
        <li><strong>Edition weighting.</strong> Some figures average race editions equally, so each edition counts once. Others pool finishes, so large editions weigh more. Each section below says which.</li>
      </ul>
    </Topic>

    <Topic id="baselines" title="Baselines and relative pace">
      <ul>
        <li><strong>5–20 km pace</strong> is a finish’s pace between the 5 km and 20 km mats: (20 km time − 5 km time) ÷ 15. It is each finish’s own reference for the sustained-slowdown definition, the section bars, the opening, the kick and the tools. It is measured during the race, so it can already reflect the opening, terrain or crowding.</li>
        <li><strong>Relative pace</strong> compares a section with a pace from the same finish. Two references are used: the 5–20 km pace, and the finish’s whole-race average pace (pacing types, course fingerprints and full-course profiles). Below zero means faster than the reference.</li>
        <li><strong>Time after 20 km</strong> is how much longer the last 22.195 km took than at the pace held from 5 to 20 km: (finish − 20 km time) − 22.195 × the 5–20 km pace per km. Many races slow without crossing the sustained-slowdown threshold, so this also shows smaller late losses. It is a calculated reference, not a predicted finish, an avoidable loss or evidence of what caused the difference.</li>
        <li><strong>Late pace</strong> is the pace from 30 km to the finish against the 5–20 km pace. Higher means more slowing.</li>
        <li><strong>Equal-distance blocks</strong> compare 20–40 km with 0–20 km. Positive means the second 20 km was slower. The final 2.195 km is separate. This is not a half-marathon split: 20 km is the 20 km mat, before halfway (21.0975 km), and no halfway time is recorded.</li>
        <li><strong>Even pace</strong> is a goal divided by 42.195 km (21.0975 km for a half). The time at any point is that pace times the distance, and a mile is 1.609344 km. Times are rounded to whole seconds once, at display. Even-pace times are calculated, never recorded splits.</li>
      </ul>
      <p>Every section is compared as a pace or weighted by its distance, because the final 2.195 km is shorter than a 5 km section.</p>
    </Topic>

    <Topic id="opening-groups" title="Opening groups">
      <p>The opening compares the first 5 km with the same finish’s 5–20 km pace: 100 × (opening pace ÷ 5–20 km pace − 1). Negative means faster. The first section is not part of the reference, so the two are compared directly. Six groups split the changes: below −10%, −10% to below −5%, −5% to below −2%, −2% through 2%, above 2% through 5%, and above 5%. Exact decimal timings keep these boundaries without rounding the source times.</p>
      <p>Opening groups and opening-pace bands describe a start. They do not diagnose overreach.</p>
    </Topic>

    <Topic id="how-to-read" title="Reading the charts">
      <p><strong>“40 km” means the 35–40 km section.</strong> Pace profiles show section averages at the section’s end distance, not the pace at that mat. A line between two averages does not show a sudden change at either checkpoint. Changes inside a section cannot be seen.</p>
      <ul>
        <li><strong>Full-course profiles</strong> divide each runner’s section pace by that runner’s whole-marathon average, then take the median across runners. Below zero means faster than the runner’s own average. A median profile is not one runner’s race or a best strategy.</li>
        <li><strong>Fast-start section profiles</strong> compare each section with the finish’s 5–20 km pace (all eligible finishes) or with the earlier-best marathon pace (the earlier-result comparison), then take the group median.</li>
        <li><strong>Axes.</strong> On pace-difference axes, higher is slower. On finish-time-change axes, below zero is faster. In range rows, the dot is the median and the line spans the 10th to 90th percentiles.</li>
        <li><strong>Shaded middle-50% bands</strong> in pace profiles describe variation among finishes. Opening-tradeoff intervals reflect uncertainty in group means, not the range of individual outcomes.</li>
        <li><strong>Pattern shares:</strong> a faster second 20 km means more than 2% faster; similar means within 2%; moderate slowing is more than 2% through 10%; pronounced slowing is more than 10%.</li>
        <li><strong>Exceptional-performance frequency</strong> is exceptional finishes divided by all classified finishes within a pacing pattern. That is a different question from what share of exceptional races used the pattern.</li>
        <li><strong>Matched comparisons.</strong> The matched gender comparison uses a matched subset with a common mix of race editions and 20 km times; the pooled chart uses every eligible finish in each recorded category. The three pace-trend groups at 20 km share the same race and 20 km time mix; negative means a faster finish.</li>
        <li><strong>Experience charts</strong> show percentage-point change; negative means less slowing than in the previous race. Pace-shape medians use each finish’s own normalized section paces, and the final 2.195 km is left out of the equal-distance comparison.</li>
        <li><strong>Missing values</strong> stay missing. They are never plotted as zero.</li>
        <li><strong>Distances in miles</strong> are the metric timing points converted and rounded to two decimals. “Last 3.11 mi” in the checkpoint analysis is the recorded 5 km section just before the checkpoint.</li>
      </ul>
      <p>In the ten analyses:</p>
      <ul>
        <li>In “Where is a target time won or lost?”, zero is the even-pace budget for the selected time. A positive bar means finishes spent more minutes than that budget in the section; a negative bar, fewer.</li>
        <li>In “Where do hills and pace changes line up?”, a positive net elevation change means the section ends higher than it starts. The supplied climbing and descending estimates do not fully match the separately supplied net changes. Both are route proxies, not verified historical elevations, and a net change can hide a climb followed by a descent.</li>
        <li>In “Where do improving runners find time?”, positive values are minutes gained against the earlier best in the opening 10 km, the middle 20 km and the final 12.195 km. The three add up to the average improvement. A negative block means improving runners were, on average, slower there despite a faster finish.</li>
        <li>In “How does my target compare with the field?”, changing the target changes the threshold being counted, not the performances.</li>
        <li>Checkpoint finish-time percentiles show variation among complete eligible finishes, including repeat runners. Non-finishers and records with missing splits are absent.</li>
      </ul>
    </Topic>
  </Part>;
}
