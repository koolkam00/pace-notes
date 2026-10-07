import type { Demographics, InsightsManifest } from '@/lib/insights';
import { count, mss } from '@/lib/viz/format';
import { AgeLadder, GenderDumbbell, GhostRace, WomenShare } from '../DemographicsStory';
import { StoryMethods, StorySection } from '../StoryShell';
import { StoryData } from '../StoryData';

export default function DemographicsBody({ data, manifest }: { data: Demographics; manifest: InsightsManifest }) {
  const o = data.overall;
  const peak = data.bands.reduce((best, b) => (b.men_slowdown / Math.max(b.women_slowdown, 1e-9) > best.men_slowdown / Math.max(best.women_slowdown, 1e-9) ? b : best), data.bands[0]);
  const a = data.age_contrast;
  const womenTop = Math.max(...data.ladder.filter((l) => l.gender === 'Women').map((l) => l.slowdown_vs_field));
  const menBottom = Math.min(...data.ladder.filter((l) => l.gender === 'Men').map((l) => l.slowdown_vs_field));
  const share = data.women_share_by_band;
  const majority = share.find((s) => s.women_share >= 0.5);
  return (
    <StoryData value={{ demographics: data }}>
      <StorySection id="unmask" kicker="01 · Line them up" title={<>Pooled, the gap looks small. <em>Matched</em>, it is {((o.men_block - o.women_block) / (o.pooled_men_block - o.pooled_women_block)).toFixed(0)} times as big.</>}
        dek={<>Across all recorded women&apos;s and men&apos;s finishes between 2:30 and 6:00, the average 20–40 km block is {o.pooled_women_block.toFixed(1)}% slower than 0–20 km for recorded women and {o.pooled_men_block.toFixed(1)}% for men. But women finish later on average, and later finishers slow more. Compared within the same race and finish minute, the averages are {o.women_block.toFixed(1)}% and {o.men_block.toFixed(1)}%.</>}>
        <div className="bibs">
          <div className="bib"><span className="bib-tag">Sustained slowdown, matched</span><span className="bib-number">{(o.women_slowdown * 100).toFixed(0)}% <small>vs</small> {(o.men_slowdown * 100).toFixed(0)}%</span><span className="bib-text">of women&apos;s and men&apos;s finishes. Interval for the gap: {(o.slowdown_gap_ci95[0] * 100).toFixed(1)} to {(o.slowdown_gap_ci95[1] * 100).toFixed(1)} points.</span></div>
          <div className="bib"><span className="bib-tag">Biggest ratio</span><span className="bib-number">{(peak.men_slowdown / peak.women_slowdown).toFixed(1)}×</span><span className="bib-text">At {peak.label}, {(peak.men_slowdown * 100).toFixed(1)}% of men&apos;s finishes had a sustained slowdown against {(peak.women_slowdown * 100).toFixed(1)}% of women&apos;s.</span></div>
          <div className="bib"><span className="bib-tag">Final kick</span><span className="bib-number">{(o.women_kick * 100).toFixed(0)}% <small>vs</small> {(o.men_kick * 100).toFixed(0)}%</span><span className="bib-text">ran the last 2.2 km faster than their own 0–40 km average pace.</span></div>
        </div>
      </StorySection>
      <StorySection id="ghost" kicker="02 · The ghost race" title={<>Same finish time, <em>different race</em>.</>}
        dek={<>Averaged across every matched finish band, men reach 20 km {mss(data.ghost_s[3])} earlier on the clock than women with the same finish times, and are up to {mss(Math.max(...data.ghost_s))} ahead at {[5, 10, 15, 20, 25, 30, 35, 40][data.ghost_s.indexOf(Math.max(...data.ghost_s))] ?? 25} km. They give all of it back by the line.</>}>
        <GhostRace />
      </StorySection>
      <StorySection id="bands" kicker="03 · Every finish time" title={<>The gap holds <em>from 2:40 to 6:00</em>.</>}
        dek="From 2:40 to 6:00, fewer women’s than men’s finishes have a sustained slowdown in every 10-minute band. In the fastest band, 2:30–2:40, the two are essentially level.">
        <GenderDumbbell />
      </StorySection>
      <StorySection id="age" kicker="04 · Age" title={<>Every women&apos;s age group paces <em>more evenly</em> than every men&apos;s.</>}
        dek={<>Against the same race&apos;s same-minute field, the least even women&apos;s group sits {Math.abs(womenTop * 100).toFixed(1)} points below the field, further below than even the most even men&apos;s group ({Math.abs(menBottom * 100).toFixed(1)} points below). Within each gender, older runners slow less: matched 18–29s had a sustained slowdown {(a.young_slowdown * 100).toFixed(0)}% of the time, 60–69s {(a.older_slowdown * 100).toFixed(0)}%.</>}>
        <AgeLadder />
      </StorySection>
      <StorySection id="field" kicker="05 · The field" title={<>Women are a <em>growing share</em> of finishes.</>}
        dek={<>Women&apos;s share of eligible finishes has grown in most cities. They are the majority only among finishes slower than {majority ? majority.label.split('–')[0] : '5:30'}.</>}>
        <WomenShare />
      </StorySection>
      <StoryMethods manifest={manifest} files={['demographics.json']} method={data.method}
        caveats={[
          'Matching on finish time conditions on the result: a man in a given band is more often someone who started faster and slowed into it. Same finish does not mean same fitness.',
          'Gender is as recorded by the source; "Other / not recorded" finishes are left out of two-group comparisons.',
          `Exact ages are available for ${count(data.granular_age_n)} finishes from ${data.granular_age_cities.join(', ')}. Age comparisons are cross-sectional: different people, not the same runners aging.`,
          `${data.composition_flagged.length} editions with incomplete gender or result coverage are left out of the composition charts.`,
          'Counts are race finishes, not unique people. Associations describe, they do not explain why.',
        ]} />
    </StoryData>
  );
}
