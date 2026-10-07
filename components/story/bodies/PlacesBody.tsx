import type { InsightsManifest, Positions } from '@/lib/insights';
import { count } from '@/lib/viz/format';
import { BreakEven, GainHistogram, GapGauge, Ledger, WomenMen } from '../PlacesStory';
import { StoryMethods, StorySection } from '../StoryShell';
import { Checkpoint } from '../Units';

export default function PlacesBody({ data, manifest }: { data: Positions; manifest: InsightsManifest }) {
  const at30 = data.coin_flip['30'].find((r) => r.gap_lo_s === 60)!;
  const at40 = data.coin_flip['40'].find((r) => r.gap_lo_s === 60)!;
  const fast = data.groups.find((g) => g.label === 'Faster second 20 km')!;
  const slow = data.groups.find((g) => g.label === 'Sustained slowdown')!;
  const top = [...data.shuffle].sort((a, b) => b.share - a.share)[0];
  const late = [...data.shuffle].filter((s) => ['30–35', '35–40', '25–30', '20–25'].includes(s.section)).sort((a, b) => b.share - a.share)[0];
  return (
    <>
      <StorySection id="gap" kicker="01 · The gap" title={<>At <Checkpoint km={30} />, a minute is <em>nearly a coin flip</em>.</>}
        dek={<>When one finish trailed another by 60–90 seconds at 30 km, the trailing one still crossed the line first {Math.round(at30.share * 100)}% of the time. From 40 km the same gap was overturned only {Math.round(at40.share * 100)}% of the time.</>}>
        <GapGauge data={data} />
      </StorySection>
      <StorySection id="gains" kicker="02 · Gains and losses" title={<>Small gains for many, <em>big losses</em> for a few.</>}
        dek={<>{Math.round(data.gained_share * 100)}% of finishes moved up the clock order after 30 km. Only {(data.surger_share * 100).toFixed(1)}% rose by 10 percentile points or more, while {(data.sinker_share * 100).toFixed(1)}% fell that far.</>}>
        <div className="chapter-grid">
          <GainHistogram data={data} />
          <div className="chapter-aside">
            <Ledger data={data} />
            <div className="bib"><span className="bib-tag">Who moves up late</span><span className="bib-number">{(fast.gained * 100).toFixed(1)}%</span><span className="bib-text">of finishes with a faster second 20 km gained places after 30 km, against {(slow.gained * 100).toFixed(0)}% of finishes with a sustained slowdown.</span></div>
          </div>
        </div>
      </StorySection>
      <StorySection id="break-even" kicker="03 · Break-even" title={<>Most of the field slows. The question is <em>how much</em>.</>}
        dek={<>Places are relative: most of the field slows after 30 km, so slowing a little still moves you up. The typical finish held its place at about {data.breakeven_crossing?.toFixed(1)}% slower than its 5–20 km pace.</>}>
        <BreakEven data={data} />
      </StorySection>
      <StorySection id="shuffle" kicker="04 · Reshuffles" title={<>The order shuffles <em>twice</em>.</>}
        dek={<>Pairs of finishes swap clock order most often in the {top.section} km section, and again in the {late.section} km section.</>}>
        <div className="viz-card">
          <div className="viz-head"><div><p className="viz-title">Share of pairs that swap clock order in each section</p><p className="viz-sub">Random same-race pairs; per kilometre so the short final section compares fairly</p></div></div>
          <div className="shuffle-bars">
            {data.shuffle.map((s) => {
              const max = Math.max(...data.shuffle.map((x) => x.per_km));
              return (
                <div key={s.section} className="shuffle-bar">
                  <i style={{ height: `${(s.per_km / max) * 100}%` }} />
                  <b>{(s.per_km * 100).toFixed(2)}%</b>
                  <span>{s.section}</span>
                </div>
              );
            })}
          </div>
          <p className="viz-note">Section labels are kilometres. A swap means the pair&apos;s clock order at the end of the section differs from the start.</p>
        </div>
      </StorySection>
      <StorySection id="women" kicker="05 · Recorded gender" title={<>Women move up <em>in every race</em>.</>}
        dek={<>In all {data.women_ahead_editions} of {data.gender_editions.length} race editions with at least 100 recorded women and men, women&apos;s average change in clock position after 30 km was better than men&apos;s. Women are {(data.women_share * 100).toFixed(0)}% of these finishes but {(data.women_share_of_surgers * 100).toFixed(0)}% of late surgers and {(data.women_share_of_sinkers * 100).toFixed(0)}% of late sinkers.</>}>
        <WomenMen data={data} />
      </StorySection>
      <StoryMethods manifest={manifest} files={['positions.json']} method={data.method}
        caveats={[
          'Clock ranks compare elapsed times within an edition. Because of wave starts, a clock pass is not necessarily a physical overtake on the road.',
          'Only eligible finishes are ranked: runners who did not finish or whose records were incomplete are absent.',
          'Slowing measures and places gained both use the late kilometres, so their link is partly arithmetic; it describes, it does not predict.',
          `${count(data.cohort_n)} finishes in ${data.editions_n} editions are ranked. Pair rates are estimated from sampled pairs with a fixed seed.`,
        ]} />
    </>
  );
}
