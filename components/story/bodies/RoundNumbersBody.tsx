import type { FinishTimes, InsightsManifest } from '@/lib/insights';
import { count } from '@/lib/viz/format';
import { FinishHistogram, Rescue, SecondsLens } from '../FinishTimeStory';
import { StoryMethods, StorySection } from '../StoryShell';
import { StoryData } from '../StoryData';
import { Checkpoint, Distance, Section } from '../Units';
import { UnitLink as Link } from '@/components/UnitsProvider';

export default function RoundNumbersBody({ data, manifest }: { data: FinishTimes; manifest: InsightsManifest }) {
  const marks = data.marks;
  const three = marks.find((m) => m.minutes === 180)!;
  const half = marks.find((m) => m.minutes === 210)!;
  const four = marks.find((m) => m.minutes === 240)!;
  const five = marks.find((m) => m.minutes === 300)!;
  const b4 = data.bubble.find((b) => b.minutes === 240)!;
  const fiveMin = data.cliff_index.filter((c) => c.kind === 'five');
  const fastFive = fiveMin.filter((c) => c.minute < 210);
  const slowFive = fiveMin.filter((c) => c.minute >= 270);
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] ?? NaN;
  return (
    <StoryData value={{ finish: data }}>
      <StorySection id="towers" kicker="01 · The towers" title={<>Against the curve, the tallest tower is <em>2:59</em>.</>}
        dek={<>{count(three.minute_before)} finishes landed between 2:59:00 and 2:59:59, {three.ratio.toFixed(2)}× what a smooth curve expects. In raw counts the busiest minutes are just before 4:00, where far more finishes land; relative to the curve, 2:59 stands tallest. The minute before 3:30 holds {half.ratio.toFixed(2)}×, before 4:00 {four.ratio.toFixed(2)}×, and before 5:00 {five.ratio.toFixed(2)}×. For the median and the whole spread of finish times, see <Link href="/finish-times">marathon finish times</Link>.</>}>
        <FinishHistogram />
      </StorySection>
      <StorySection id="scoreboard" kicker="02 · Every mark" title={<>Faster finish times bunch at <em>more marks</em>.</>}
        dek={<>Below 3:30 even five-minute marks leave a step (median cliff index {med(fastFive.map((c) => c.cliff)).toFixed(2)}); after 4:30 the hours and half-hours leave the clearest steps, while five-minute marks barely do (median {med(slowFive.map((c) => c.cliff)).toFixed(2)}, where 1.00 means no step).</>}>
        <div className="viz-card">
          <div className="viz-head"><div><p className="viz-title">The round-number scoreboard</p><p className="viz-sub">Minute before each mark: recorded finishes against the smooth curve</p></div></div>
          <div className="table-scroll">
            <table className="data-table scoreboard">
              <thead><tr><th>Mark</th><th>Finishes in the minute before</th><th>Smooth curve</th><th>Ratio (interval)</th><th>Minute after</th><th>Men</th><th>Women</th></tr></thead>
              <tbody>
                {marks.map((m) => (
                  <tr key={m.mark} className={m.ratio >= 1.25 ? 'is-hot' : ''}>
                    <td><strong>{m.mark}</strong></td><td>{count(m.minute_before)}</td><td>{count(m.expected_minute_before)}</td>
                    <td><span className="ratio-pill" style={{ ['--w' as string]: `${Math.min(100, Math.max(0, (m.ratio - 0.8) * 100))}%` }}>{m.ratio.toFixed(2)}×</span> <small>{m.ratio_ci95[0].toFixed(2)}–{m.ratio_ci95[1].toFixed(2)}</small></td>
                    <td>{count(m.minute_after)}</td><td>{m.men_ratio.toFixed(2)}×</td><td>{m.women_ratio === null ? 'fewer than 100' : `${m.women_ratio.toFixed(2)}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="viz-note">Quarter-hour marks such as 2:45 and 3:45 sit inside neighbouring marks&apos; windows, so their smooth curves are less reliable. Intervals resample whole race editions.</p>
        </div>
      </StorySection>
      <StorySection id="seconds" kicker="03 · Seconds" title={<>The cushion is widest before <em>5:00</em>.</>}
        dek="Zoom to ten-second bins. Before 3:00 the pile sits tight against the line; before 5:00 it spreads back over several minutes.">
        <SecondsLens />
      </StorySection>
      <StorySection id="rescue" kicker="04 · The final stretch" title={<>More finishes <em>slip under 4:00</em> after <Checkpoint km={40} />.</>}
        dek={<>Of {count(b4.over.n)} finishes projected 0–2 minutes over 4:00 at <Checkpoint km={40} />, {Math.round(b4.over.share_under * 100)}% got under it, against {Math.round(b4.over.expected_share_under * 100)}% for comparable finishes away from a round mark. Over the final <Distance km={2.195} /> they finished a median {b4.over.median_final_gain_s.toFixed(0)} seconds ahead of their own <Section i={7} /> pace{b4.over.expected_median_final_gain_s != null ? `, against ${b4.over.expected_median_final_gain_s.toFixed(0)} seconds for the comparison finishes` : ""}.</>}>
        <Rescue />
      </StorySection>
      <StoryMethods manifest={manifest} files={['finish-times.json']} method={data.method}
        caveats={[
          'Goals, pacers, pace bands and watches are not recorded. Bunching is consistent with round-number targets but cannot prove why anyone sped up.',
          'The smooth curve and the late-race comparison are references fitted from the data, not counterfactual outcomes for any runner.',
          'Elapsed times are as published by the timing sources; wave and start offsets are not recorded.',
          `Across hours and half-hours from 2:30 to 6:00, about ${count(Math.round(data.total_excess_hour_half_hour / 1000) * 1000)} finishes sit in the five minutes before a mark beyond the curve. That total is sensitive to the fitting window.`,
        ]} />
    </StoryData>
  );
}
