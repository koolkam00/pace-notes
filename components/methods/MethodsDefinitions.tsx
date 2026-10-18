import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import Values from '@/components/ui/Values';
import TypeGlyph from '@/components/viz/TypeGlyph';
import Columns from '@/components/viz/Columns';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { countWord } from '@/lib/nuggets/format';
import { getStudyAnswer, getStudyEvidence, getWallTimingAnswer } from '@/lib/research-data';
import { getStudyFigures } from '@/lib/study-figures';
import { EVIDENCE_LABEL, EVIDENCE_TEXT, TOOLS, type ToolEvidence } from '@/lib/tools/registry';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import { Definition, Part, and, dataHref, n, pctText } from './shared';

type Archetypes = { cohort_n: number; classifier: { names: string[] }; archetypes: { slug: string; name: string; profile: number[] }[] };

/** The threshold the published definition names ("at least 25% slower"), read from its own sentence. */
const PUBLISHED = Number(/at least (\d+)% slower/.exec(SLOWDOWN_DEFINITION)?.[1] ?? NaN);
/**
 * The rule as the card states it, in reading order (when, how much, how slow, against what), from the definition's own
 * numbers: "After 20K, at least 5 km run 25% or more slower than the runner's own 5–20K pace." The definition's second
 * sentence (contiguous sections, the final 2.195 km) follows it unchanged.
 */
const RULE = (() => {
  const m = /at least (\d+(?:\.\d+)?) km after (\d+) km run at least (\d+)% slower than the runner’s own (\d+)–(\d+) km pace\.\s*(.*)$/.exec(SLOWDOWN_DEFINITION);
  return m ? `After ${m[2]}K, at least ${m[1]} km run ${m[3]}% or more slower than the runner’s own ${m[4]}–${m[5]}K pace. ${m[6]}` : SLOWDOWN_DEFINITION;
})();

/**
 * Part 2: the terms every page uses, each a definition card: the rule in a line or two, a small instrument where one
 * draws it (how many finishes each slowdown threshold catches; the six pacing shapes; the three evidence badges), and
 * the rest under "More". The sustained-slowdown definition and its published-method citation are stated here once;
 * every other page links the term to #sustained-slowdown.
 */
export default function MethodsDefinitions() {
  const study = getStudyEvidence();
  const answer = getStudyAnswer();
  const timing = getWallTimingAnswer();
  const definitionText = answer.method[0];
  // The tool cohort, from the data the tools read: the eligible finishes less the editions the tools screen out (start
  // delays, shifted mats), so the badge says which finishes it leaves out wherever it shows.
  const toolCohort = getInsightsManifest().files['tools/projector.json'] ? readInsight<{ cohort_n: number }>('tools/projector.json').cohort_n : NaN;
  const toolFinishes = Number.isFinite(toolCohort) ? `${(toolCohort / 1e6).toFixed(2)} million` : 'the';
  // Each figure repeats the definition as its first line; it is shown once, above.
  const figures = getStudyFigures().map((figure) => ({ ...figure, method: figure.method.filter((line) => line !== definitionText) }));
  const types = readInsight<Archetypes>('archetypes.json');
  const profiles = types.archetypes.flatMap((t) => t.profile);
  const domain: [number, number] = [Math.min(...profiles), Math.max(...profiles)];
  // The definition-sensitivity check: the share of finishes that qualify under other thresholds and lengths, read from
  // the study's own figure rows. The instrument draws the published length; Values holds every length.
  const sensitivity = figures.find((figure) => figure.id === 'sensitivity')?.charts[0]?.rows ?? [];
  const lengths = [...new Set(sensitivity.map((row) => String(row.length)))];
  const thresholds = [...new Set(sensitivity.map((row) => Number(row.label)))].sort((a, b) => a - b);
  const cell = (threshold: number, length: string) => sensitivity.find((row) => Number(row.label) === threshold && String(row.length) === length);
  const share = (threshold: number, length: string) => { const v = Number(cell(threshold, length)?.value); return Number.isFinite(v) ? v : NaN; };
  const shareText = (v: number) => (Number.isFinite(v) ? `${v.toFixed(v < 0.05 ? 2 : v < 10 ? 1 : 0)}%` : '–');
  // The columns share one precision, so a one-decimal label never sits beside whole numbers.
  const columnText = (v: number) => (Number.isFinite(v) ? `${v.toFixed(columns.some((t) => share(t, shortest) < 10) ? 1 : 0)}%` : '–');
  const shortest = lengths[0];
  const columns = shortest ? thresholds.filter((t) => Number.isFinite(share(t, shortest))) : [];
  const atPublished = shortest ? share(PUBLISHED, shortest) : NaN;
  const manifest = getInsightsManifest();
  const shown = TOOLS.filter((tool) => !tool.file || manifest.files[tool.file]);
  const kinds: ToolEvidence[] = ['data', 'research', 'official'];

  return <Part id="definitions" n={2} short="Definitions" title="Definitions" lead="The words every page uses, each with its rule.">
    <Definition id="sustained-slowdown" term="Sustained slowdown"
      rule={<>
        <p>{RULE}</p>
        <p className="methods-cite">It follows a <a href={SLOWDOWN_CITATION.url}>{SLOWDOWN_CITATION.label.replace(/^Published/, 'published')}</a>.</p>
      </>}
      instrument={columns.length > 1 && Number.isFinite(atPublished) ? <>
        {/* The sentence takes the columns' precision, so its share and the highlighted column read the same. */}
        <p className="methods-instrument-head">At {PUBLISHED}% slower for {shortest}, {columnText(atPublished)} of finishes qualify. Other thresholds catch more or fewer:</p>
        <Columns label={`Share of eligible finishes with a sustained slowdown at each minimum slowdown, over ${shortest}: ${columns.map((t) => `${t}%, ${shareText(share(t, shortest))}`).join('; ')}`}
          max={Math.max(...columns.map((t) => share(t, shortest)))} height={150} heightMd={170} every
          items={columns.map((t) => ({ id: String(t), label: String(t), value: share(t, shortest), display: columnText(share(t, shortest)), tone: t === PUBLISHED ? 'signal' as const : 'quiet' as const }))} />
        <p className="methods-axis-note">Minimum slowdown, % slower than the 5–20K pace</p>
        <Values id="definition-sensitivity" caption={`Share of the ${study ? n(study.n) : ''} eligible finishes that qualify, by minimum slowdown and minimum length`}
          columns={[{ key: 'threshold', label: 'Minimum slowdown' }, ...lengths.map((length) => ({ key: length, label: length }))]}
          rows={thresholds.map((t) => [`${t}%`, ...lengths.map((length) => shareText(share(t, length)))])}
          reading={thresholds.indexOf(PUBLISHED)} />
      </> : null}>
      <p>Each full 5 km section from 20–25 km to 35–40 km is checked, so one slow section is enough. The final 2.195 km can extend a run of slow sections but cannot start one. The onset is the first qualifying section: a section boundary, not an exact moment. Because the comparison starts at 20 km, a sustained slowdown can only begin after 20 km.</p>
      <p>The <a href="#baselines">5–20K pace</a> comes from the same finish, so every finish is measured against itself. The definition finds sustained slowing. It cannot tell whether the cause was fuel, injury, fatigue, walking or something else. A finish without a detected sustained slowdown can still have slowed more mildly or for a shorter stretch. On the tools and the race report, <strong>held pace</strong> means no sustained slowdown. Every page that uses the term links here.</p>
      {study && <>
        <h4 id="slowdown-method">The sustained-slowdown study</h4>
        <p>{n(study.detected)} of {n(study.n)} eligible finishes ({pctText(study.detected / study.n)}) had a sustained slowdown. The same runner may appear more than once. The study uses the same complete-split, reviewed edition-quality cohort as the main analyses. Missing age or gender alone does not remove a finish. Rates describe recorded finishes, not unique people or physiological causes.</p>
        <p><strong>When episodes begin.</strong> {timing.method.filter((line) => line !== definitionText).join(' ')} Each boundary locates the first qualifying recorded section.</p>
        {figures.map((figure) => <p key={figure.id}><strong>{figure.title}</strong> {figure.answer} {figure.method.join(' ')}</p>)}
        <p className="methods-links"><Link href="/slowdown">See the sustained-slowdown study</Link><a href={dataHref('study/evidence.json')}>Its results, methods and source checksums</a></p>
      </>}
    </Definition>

    <Definition id="pacing-types" term="Pacing types"
      rule={<p>Every finish is the nearest of {countWord(types.archetypes.length)} race shapes, found from its own splits after the race. A shape, not a grade.</p>}
      instrument={<ul className="methods-types" aria-label={`The ${types.archetypes.length} pacing types`}>
        {types.archetypes.map((t, i) => <li key={t.slug}><TypeGlyph profile={t.profile} index={i} domain={domain} /><span>{t.name}</span></li>)}
      </ul>}>
      <p>A pacing type is the shape of one race. Each section’s pace is compared with the finish’s whole-race average pace. Those nine numbers are clipped at the 0.1st and 99.9th percentiles, and the short final section counts for less (its weight is √(2.195 ÷ 5)). K-means grouping of {n(types.cohort_n)} complete finishes gives {countWord(types.classifier.names.length)} centroids: {and(types.classifier.names)}. The rules that name them are in the <a href="#story-pacing-types">pacing-types story’s method</a>.</p>
      <p>Every finish, on any page, gets the nearest of the centroids, assigned after the race from its own splits. A type describes a shape. It is not a grade and says nothing about fitness, physiology or advice. Shapes form a continuum, and the names mark common regions. Because each section is compared with the finish’s own average, a quick start partly reflects a slow ending.</p>
      <p>In a pacing sentence, F is a section more than 3% faster than the finish’s own average pace, E is within 3% and S is more than 3% slower.</p>
    </Definition>

    <Definition id="evidence" term="Evidence badges"
      rule={<p>Every tool panel is labeled with the kind of evidence it shows. Numbers with different labels are never combined, subtracted from each other or passed between tools.</p>}
      instrument={<dl className="methods-badges">
        {kinds.map((kind) => <div key={kind}><dt><EvidenceTag kind={kind} link={false} /></dt><dd>{EVIDENCE_TEXT[kind].replace('{finishes}', toolFinishes)}</dd></div>)}
      </dl>}>
      {kinds.map((kind) => <p key={kind}><strong>{EVIDENCE_LABEL[kind]}.</strong> {kind === 'data' ? 'Every share is an observed share of complete finishes, not a forecast for any one runner.' : kind === 'research' ? 'Shown as ranges, each method on its own, and kept apart from Pace Notes results.' : 'Kept apart from the data.'} Used by the {and(shown.filter((tool) => tool.evidence.includes(kind)).map((tool) => tool.title.toLowerCase()))}.</p>)}
      <p>Plain calculations from your own inputs carry no badge: even-pace splits, mile rows, pace charts, unit conversion and targets. They come straight from what you type and are not observations.</p>
      <p>The race report and the course pages use the same badges. On the race report, Published research marks the published sustained-slowdown definition. A plan is worked out from your own goal; the Pace Notes data beside it describes past finishes and never picks a pace.</p>
    </Definition>

    <Definition id="percentiles" term="Percentiles and ranges"
      rule={<p>A percentile ranks finishes by time within a group: by the 10th, one finish in ten had come in. The median is the middle finish.</p>}>
      <ul>
        <li>The <strong>middle half</strong> runs from the 25th to the 75th percentile, and the <strong>middle 80%</strong> from the 10th to the 90th. Both describe variation between finishes. They are not confidence intervals and not recommended plans.</li>
        <li>A <strong>confidence interval</strong> shows uncertainty in an estimate. A <strong>prediction interval</strong> shows a range for one future outcome. The charts keep these apart.</li>
        <li>A <strong>finish percentile</strong> on a runner record compares a finish with the other eligible finishes in its group, with ties counting halfway. Higher means faster. It is an observed rank in this data, not an official placing.</li>
        <li><strong>Shares</strong> are observed shares of complete finishes, said as past facts: what finishes had or ran. None is a forecast for any one runner.</li>
        <li><strong>Edition weighting.</strong> Some figures average race editions equally, so each edition counts once. Others pool finishes, so large editions weigh more. Each topic under Calculations says which.</li>
      </ul>
    </Definition>

    <Definition id="baselines" term="Baselines and relative pace"
      rule={<p>Every finish is measured against itself: its own pace from the 5K mat to the 20K mat.</p>}>
      <ul>
        <li><strong>5–20K pace</strong> is a finish’s pace between the 5 km and 20 km mats: (20 km time − 5 km time) ÷ 15. It is each finish’s own reference for the sustained-slowdown definition, the section bars, the opening, the kick and the tools. It is measured during the race, so it can already reflect the opening, terrain or crowding.</li>
        <li><strong>Relative pace</strong> compares a section with a pace from the same finish. Two references are used: the 5–20K pace, and the finish’s whole-race average pace (pacing types, course fingerprints and full-course profiles). Below zero means faster than the reference.</li>
        <li><strong>Time after 20K</strong> is how much longer the last 22.195 km took than at the pace held from 5K to 20K: (finish − 20 km time) − 22.195 × the 5–20K pace per km. Many races slow without crossing the sustained-slowdown threshold, so this also shows smaller late losses. It is a calculated reference, not a predicted finish, an avoidable loss or evidence of what caused the difference.</li>
        <li><strong>Late pace</strong> is the pace from 30K to the finish against the 5–20K pace. Higher means more slowing.</li>
        <li><strong>Equal-distance blocks</strong> compare 20–40K with 0–20K. Positive means the second 20K was slower. The final 2.195 km is separate. This is not a half-marathon split: 20K is the 20 km mat, before halfway (21.0975 km), and no halfway time is recorded.</li>
        <li><strong>Even pace</strong> is a goal divided by 42.195 km (21.0975 km for a half). The time at any point is that pace times the distance, and a mile is 1.609344 km. Times are rounded to whole seconds once, at display. Even-pace times are calculated, never recorded splits.</li>
      </ul>
      <p>Every section is compared as a pace or weighted by its distance, because the final 2.195 km is shorter than a 5 km section.</p>
    </Definition>

    <Definition id="opening-groups" term="Opening groups"
      rule={<p>The first 5K’s pace against the same finish’s 5–20K pace, in six groups from more than 10% faster to more than 5% slower.</p>}>
      <p>The opening compares the first 5 km with the same finish’s 5–20K pace: 100 × (opening pace ÷ 5–20K pace − 1). Negative means faster. The first section is not part of the reference, so the two are compared directly. Six groups split the changes: below −10%, −10% to below −5%, −5% to below −2%, −2% through 2%, above 2% through 5%, and above 5%. Exact decimal timings keep these boundaries without rounding the source times.</p>
      <p>Opening groups and opening-pace bands describe a start. They do not diagnose overreach.</p>
    </Definition>

    <Definition id="how-to-read" term="Reading the charts"
      rule={<p>The mats are named 5K to 40K in both units. A pace drawn at 40K is the average over 35–40K, not the pace at that mat.</p>}>
      <p>Pace profiles show section averages at the section’s end distance. A line between two averages does not show a sudden change at either checkpoint. Changes inside a section cannot be seen.</p>
      <ul>
        <li><strong>Full-course profiles</strong> divide each runner’s section pace by that runner’s whole-marathon average, then take the median across runners. Below zero means faster than the runner’s own average. A median profile is not one runner’s race or a best strategy.</li>
        <li><strong>Fast-start section profiles</strong> compare each section with the finish’s 5–20K pace (all eligible finishes) or with the earlier-best marathon pace (the earlier-result comparison), then take the group median.</li>
        <li><strong>Axes.</strong> On pace-difference axes, higher is slower. On finish-time-change axes, below zero is faster. In range rows, the dot is the median and the line spans the 10th to 90th percentiles.</li>
        <li><strong>Shaded middle-50% bands</strong> in pace profiles describe variation among finishes. Opening-tradeoff intervals reflect uncertainty in group means, not the range of individual outcomes.</li>
        <li><strong>Pattern shares:</strong> a faster second 20K means more than 2% faster; similar means within 2%; moderate slowing is more than 2% through 10%; pronounced slowing is more than 10%.</li>
        <li><strong>Exceptional-performance frequency</strong> is exceptional finishes divided by all classified finishes within a pacing pattern. That is a different question from what share of exceptional races used the pattern.</li>
        <li><strong>Matched comparisons.</strong> The matched gender comparison uses a matched subset with a common mix of race editions and 20K times; the pooled chart uses every eligible finish in each recorded category. The three pace-trend groups at 20K share the same race and 20K time mix; negative means a faster finish.</li>
        <li><strong>Experience charts</strong> show percentage-point change; negative means less slowing than in the previous race. Pace-shape medians use each finish’s own normalized section paces, and the final 2.195 km is left out of the equal-distance comparison.</li>
        <li><strong>Missing values</strong> stay missing. They are never plotted as zero.</li>
        <li><strong>Units.</strong> The timing mats keep their names in miles and kilometers. A distance between mats reads with one decimal in miles; paces convert exactly. Every threshold stays metric, as recorded.</li>
      </ul>
      <p>In the analyses:</p>
      <ul>
        <li>In “Where is a target time won or lost?”, zero is the even-pace budget for the selected time. A positive bar means finishes spent more minutes than that budget in the section; a negative bar, fewer.</li>
        <li>In “Where do hills and pace changes line up?”, a positive net elevation change means the section ends higher than it starts. The supplied climbing and descending estimates do not fully match the separately supplied net changes. Both are route proxies, not verified historical elevations, and a net change can hide a climb followed by a descent.</li>
        <li>In “Where do improving runners find time?”, positive values are minutes gained against the earlier best in the opening 10 km, the middle 20 km and the final 12.195 km. The three add up to the average improvement. A negative block means improving runners were, on average, slower there despite a faster finish.</li>
        <li>In “How does my target compare with the field?”, changing the target changes the threshold being counted, not the performances.</li>
        <li>Checkpoint finish-time percentiles show variation among complete eligible finishes, including repeat runners. Non-finishers and records with missing splits are absent.</li>
      </ul>
    </Definition>
  </Part>;
}
