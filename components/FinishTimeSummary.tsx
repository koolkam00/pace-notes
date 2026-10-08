import type { ReactNode } from 'react';
import { MarathonDistance, UnitLink as Link } from '@/components/UnitsProvider';
import { EvidencePanel } from '@/components/tools/ui';
import { Pace } from '@/components/story/Units';
import { slugifyCity } from '@/lib/course-data';
import {
  FINISH_GROUPS, GROUP_LABEL, clockMinute, ordinal, percentileLabel, shareLabel,
  type FinishGroup, type FinishTimeSummary as Summary, type GroupSummary,
} from '@/lib/finish-times-summary';

const MARATHON_KM = 42.195;
const count = (n: number) => n.toLocaleString('en-US');
const date = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
const percentile = (g: GroupSummary, p: number) => g.percentiles.find((x) => x.p === p)?.minute ?? null;

/** Short, lower-case group names for running text. */
const GROUP_TEXT: Record<FinishGroup, string> = { all: 'all finishes', women: 'recorded women', men: 'recorded men' };

/**
 * The /finish-times page body: median bibs, the minute-by-minute distribution, the shares and percentile tables,
 * what the data covers, and onward links. Server-rendered from getFinishTimeSummary(); only the even-pace figures
 * and the links follow the visitor's units on the client.
 */
export default function FinishTimeSummary({ summary }: { summary: Summary }) {
  const { groups, coverage } = summary;
  const all = groups.all;
  const outsideShare = all.outside / all.total;
  return (
    <div className="container ft-page">
      <header className="tool-header ft-header">
        <p className="eyebrow"><Link href="/">Pace Notes</Link> · Finish times</p>
        <h1 className="tool-title">Marathon finish times</h1>
        <p className="tool-dek">
          The median recorded finish in {coverage.races} large city marathons is <strong>{percentileLabel(all.median, summary.lastMinute)}</strong>.
          Here is how {count(coverage.finishes)} finishes from {coverage.firstYear} to {coverage.lastYear} spread out, for recorded women and recorded men,
          and the share that came in under each round time.
        </p>
      </header>

      <section className="bibs ft-bibs" aria-label="Median finish times">
        {FINISH_GROUPS.map((key) => <MedianBib key={key} group={groups[key]} lastMinute={summary.lastMinute} />)}
      </section>
      <p className="ft-bib-note">Times are whole minutes of recorded finish time: {clockMinute(all.median ?? summary.firstMinute)} covers {clockMinute(all.median ?? summary.firstMinute)}:00 to {clockMinute(all.median ?? summary.firstMinute)}:59. Even paces are calculated from the time over <MarathonDistance />, not recorded.</p>

      <div className="ft-stack">
        <EvidencePanel kind="data" title="How finish times spread" meta={<>Finishes in each minute of finish time from {clockMinute(summary.firstMinute)} to {clockMinute(summary.lastMinute)}, all {coverage.races} races pooled.</>}>
          <Distribution summary={summary} />
        </EvidencePanel>

        <div className="ft-tables">
          <EvidencePanel kind="data" title="Share of finishes under each time" meta="Observed shares of each group's finishes, not predictions.">
            <div className="tool-table-wrap">
              <table className="tool-table ft-table">
                <caption>
                  Under 3:00 means 2:59:59 or faster. All finishes also include {count(coverage.otherOrNotRecorded)} with another or no recorded gender.
                </caption>
                <thead><tr><th scope="col">Finish time</th>{FINISH_GROUPS.map((key) => <th key={key} scope="col">{GROUP_LABEL[key]}</th>)}</tr></thead>
                <tbody>
                  {all.under.map(({ minute }) => (
                    <tr key={minute}>
                      <th scope="row">Under {clockMinute(minute)}</th>
                      {FINISH_GROUPS.map((key) => <td key={key}>{shareLabel(groups[key].under.find((u) => u.minute === minute)!.share)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EvidencePanel>

          <EvidencePanel kind="data" title="Percentiles" meta="Finishes ranked by finish time within each group. By the 10th percentile, one finish in ten had come in; by the 90th, nine in ten.">
            <div className="tool-table-wrap">
              <table className="tool-table ft-table">
                <caption>Each time is the whole minute in which that finish crossed the line, counted within its group.</caption>
                <thead><tr><th scope="col">Percentile</th>{FINISH_GROUPS.map((key) => <th key={key} scope="col">{GROUP_LABEL[key]}</th>)}</tr></thead>
                <tbody>
                  {all.percentiles.map(({ p }) => (
                    <tr key={p} className={p === 0.5 ? 'is-key' : undefined}>
                      <th scope="row">{p === 0.5 ? 'Median (50th)' : ordinal(p)}</th>
                      {FINISH_GROUPS.map((key) => <td key={key}>{percentileLabel(percentile(groups[key], p), summary.lastMinute)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </EvidencePanel>
        </div>
      </div>

      <section className="ft-notes" aria-labelledby="ft-cover-title">
        <h2 id="ft-cover-title">What these numbers cover</h2>
        <div className="ft-notes-grid">
          <Note title="Large city marathons, not every marathon">
            These are {count(coverage.finishes)} recorded finishes from {count(coverage.editions)} editions of {coverage.races} large city marathons, {coverage.firstYear} to {coverage.lastYear}.
            They are not a sample of all marathons everywhere. Smaller, local and trail marathons are not in this data, and their finish times can look quite different.
          </Note>
          <Note title="Counts are finishes, not runners">
            Someone who ran three of these races counts three times. Only complete finishes are counted, so a race that was not finished is in no count.
          </Note>
          <Note title="Recorded gender">
            Women and men are as each race recorded them. {count(coverage.otherOrNotRecorded)} finishes have another or no recorded gender; they count in all finishes only.
          </Note>
          <Note title="The median, not the mean">
            The minute counts published for these stories run from {clockMinute(summary.firstMinute)} to {clockMinute(summary.lastMinute)}, so finishes outside them cannot enter a mean.
            The median needs only how many there are. {count(all.outside)} finishes ({(outsideShare * 100).toFixed(1)}%) fall outside those minutes; they stay in every total and count as slower than {clockMinute(summary.lastMinute)}.
            Checked against the full finish records, that changes no figure on this page.
          </Note>
          <Note title="No age groups here">
            Exact ages are recorded in only some of these races, so this page does not split finish times by age. <Link href="/stories/who-holds-pace">Who holds their pace</Link> compares age groups where ages are recorded.
          </Note>
          <Note title="How finishes are chosen">
            Each finish has a time at every official checkpoint and passed the quality screens the <Link href="/methodology">methods page</Link> describes.
            {coverage.duplicates.map((d) => ` ${d.city} ${d.years.join(' and ')} ${d.years.length > 1 ? 'are' : 'is'} left out: ${d.years.length > 1 ? 'their' : 'its'} records repeat the ${d.city} ${d.duplicateOf} field.`).join('')} Data as of {date(summary.asOf)}.
          </Note>
        </div>
        <h3 className="ft-races-title">The {coverage.races} races</h3>
        <ul className="ft-races">
          {coverage.courses.map((course) => <li key={course.city}><Link href={`/courses/${slugifyCity(course.city)}`}>{course.race}</Link></li>)}
        </ul>
        <p className="ft-races-note">Listed alphabetically by city. Each course page shows how that race was paced.</p>
      </section>

      <p className="print-only ft-print-note">Pace Notes by Andrew Kam · splithappens.run/finish-times · Data as of {date(summary.asOf)}.</p>

      <nav className="tool-next ft-next" aria-label="Keep exploring">
        <p className="eyebrow">Keep exploring</p>
        <ul>
          <li style={{ ['--tool' as string]: '#FF5B2E' }}><Link href="/stories/round-numbers"><b>The 3:59 effect</b><span>Finish times bunch just under round numbers like 3:00, 3:30 and 4:00.</span></Link></li>
          <li style={{ ['--tool' as string]: '#2F5BFF' }}><Link href="/analyses/finish-time-context"><b>Your target in context</b><span>Where one finish time falls among comparable finishes, by course and recorded gender.</span></Link></li>
          <li style={{ ['--tool' as string]: '#17A673' }}><Link href="/tools/marathon-pace-chart"><b>Marathon pace chart</b><span>Pace per mile and per km for every goal time, calculated at even pace.</span></Link></li>
          <li style={{ ['--tool' as string]: '#F4B23E' }}><Link href="/tools/pace-calculator"><b>Pace calculator</b><span>Pace, time and splits for any distance.</span></Link></li>
        </ul>
      </nav>
    </div>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return <div className="ft-note"><h3>{title}</h3><p>{children}</p></div>;
}

function MedianBib({ group, lastMinute }: { group: GroupSummary; lastMinute: number }) {
  const minute = group.median;
  return (
    <div className={`bib ft-bib is-${group.group}`}>
      <span className="bib-tag">Median · {GROUP_TEXT[group.group]}</span>
      <strong className="bib-number">{percentileLabel(minute, lastMinute)}</strong>
      <p className="bib-text">The middle of {count(group.total)} finishes{group.group === 'all' ? '' : ` by ${GROUP_TEXT[group.group]}`}.</p>
      {minute !== null ? <span className="bib-foot">Even pace for {clockMinute(minute)}:00: <Pace secondsPerKm={(minute * 60) / MARATHON_KM} /></span> : null}
    </div>
  );
}

/** Minutes → percent across the plot, which spans the first bin's start to the last bin's end. */
function scale(summary: Summary) {
  const span = summary.lastMinute + 1 - summary.firstMinute;
  return (minute: number) => ((minute - summary.firstMinute) / span) * 100;
}

/** A step outline of per-minute counts in a 0–span × 0–100 box; `closed` fills down to the baseline. */
function stepPath(values: number[], max: number, closed: boolean) {
  const y = (n: number) => (100 - (n / max) * 94).toFixed(1);
  let d = closed ? `M0 100V${y(values[0])}H1` : `M0 ${y(values[0])}H1`;
  for (let i = 1; i < values.length; i++) d += `V${y(values[i])}H${i + 1}`;
  return closed ? `${d}V100Z` : d;
}

function Distribution({ summary }: { summary: Summary }) {
  const { bins, groups } = summary;
  const x = scale(summary);
  const span = bins.length;
  const max = Math.max(...bins.map((b) => b.all));
  const all = groups.all;
  const median = all.median;
  const grid = [10000, 20000, 30000, 40000, 50000].filter((v) => v < max * 0.97);
  const ticks: number[] = [];
  for (let m = Math.ceil(summary.firstMinute / 30) * 30; m <= summary.lastMinute; m += 30) ticks.push(m);
  const label = `Finishes per minute from ${clockMinute(summary.firstMinute)} to ${clockMinute(summary.lastMinute)}. The median finish is ${percentileLabel(median, summary.lastMinute)} for all finishes, ${percentileLabel(groups.women.median, summary.lastMinute)} for recorded women and ${percentileLabel(groups.men.median, summary.lastMinute)} for recorded men. The busiest minute is ${clockMinute(all.peak.minute)}, with ${count(all.peak.n)} finishes.`;
  return (
    <figure className="ft-figure">
      <div className="ft-plot" role="img" aria-label={label}>
        <svg viewBox={`0 0 ${span} 100`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {grid.map((v) => <line key={v} className="ft-grid" x1="0" x2={span} y1={100 - (v / max) * 94} y2={100 - (v / max) * 94} vectorEffect="non-scaling-stroke" />)}
          <path className="ft-area" d={stepPath(bins.map((b) => b.all), max, true)} />
          <path className="ft-line is-women" d={stepPath(bins.map((b) => b.women), max, false)} vectorEffect="non-scaling-stroke" />
          <path className="ft-line is-men" d={stepPath(bins.map((b) => b.men), max, false)} vectorEffect="non-scaling-stroke" />
          {median !== null ? <line className="ft-median" x1={median - summary.firstMinute + 0.5} x2={median - summary.firstMinute + 0.5} y1="0" y2="100" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        <div className="ft-plot-labels" aria-hidden="true">
          {grid.map((v) => <span key={v} className="ft-grid-label" style={{ bottom: `${(v / max) * 94}%` }}>{count(v)}</span>)}
          {median !== null ? <span className="ft-median-label" style={{ left: `${x(median + 0.5)}%` }}>Median {clockMinute(median)}</span> : null}
        </div>
      </div>
      <div className="ft-axis" aria-hidden="true">
        {ticks.map((t) => <span key={t} className={t % 60 ? 'is-half' : undefined} style={{ left: `${x(t)}%` }}>{clockMinute(t)}</span>)}
      </div>
      <div className="ft-ranges" aria-hidden="true">
        {FINISH_GROUPS.map((key) => {
          const g = groups[key];
          const at = (p: number) => percentile(g, p);
          const [p10, p25, p50, p75, p90] = [0.1, 0.25, 0.5, 0.75, 0.9].map(at);
          if (p10 === null || p25 === null || p50 === null || p75 === null || p90 === null) return null;
          return (
            <div key={key} className={`ft-range is-${key}`}>
              <p className="ft-range-label"><b>{GROUP_LABEL[key]}</b> <span>median {clockMinute(p50)}</span> · <span>middle half {clockMinute(p25)}–{clockMinute(p75)}</span></p>
              <div className="ft-range-track">
                <span className="ft-range-whisker" style={{ left: `${x(p10 + 0.5)}%`, width: `${x(p90 + 0.5) - x(p10 + 0.5)}%` }} />
                <span className="ft-range-box" style={{ left: `${x(p25 + 0.5)}%`, width: `${x(p75 + 0.5) - x(p25 + 0.5)}%` }} />
                <span className="ft-range-dot" style={{ left: `${x(p50 + 0.5)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <figcaption className="ft-legend">
        <span><i className="swatch is-all" />All finishes (shaded)</span>
        <span><i className="is-women" />Recorded women</span>
        <span><i className="is-men" />Recorded men</span>
        <span className="ft-legend-ranges">Bars below: thin line 10th to 90th percentile, thick bar the middle half (25th to 75th), dot the median.</span>
      </figcaption>
    </figure>
  );
}
