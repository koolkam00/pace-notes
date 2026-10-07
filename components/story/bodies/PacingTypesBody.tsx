import type { Archetypes, InsightsManifest } from '@/lib/insights';
import { count } from '@/lib/viz/format';
import ArchetypeChapter from '../ArchetypeChapter';
import { ArchetypeRiver, PacingBarcode, RepeatHabits, WhichArchetype } from '../ArchetypeStory';
import { CourseTypes } from '../MoreCharts';
import { StoryMethods, StorySection } from '../StoryShell';

export default function PacingTypesBody({ data, manifest }: { data: Archetypes; manifest: InsightsManifest }) {
  const [metronome, gentle, late, , cliff, fast] = data.archetypes;
  const men = data.gender.men.standardized_shares;
  const women = data.gender.women.standardized_shares;
  const t = data.transitions;
  const fastBand = data.river[0];
  const slowBand = data.river[data.river.length - 1];
  return (
    <>
      <StorySection id="six" kicker="01 · The six types" title={<>Same finish time, <em>six journeys</em>.</>}
        dek={<>Each finish&apos;s nine section paces are compared with its own whole-race average. Grouping {count(data.cohort_n)} of those shapes gives six landmarks. Watch them race: every runner below finishes at exactly the same moment.</>}>
        <ArchetypeChapter data={data} />
      </StorySection>
      <StorySection id="barcode" kicker="02 · The barcode" title={<>The red arrives <em>earlier</em> for slower finishes.</>}
        dek={<>Sort every finish from fastest to slowest and colour each section by how it compares with that finish&apos;s own average. The fastest {(100 / 200).toFixed(1)}% stay nearly even; by five hours the final 15 km are deep red.</>}>
        <PacingBarcode data={data} />
      </StorySection>
      <StorySection id="river" kicker="03 · Who runs which way" title={<>Metronomes get <em>rarer</em> as the clock runs.</>}
        dek={<>Under 2:30, {(fastBand.shares[0] * 100).toFixed(0)}% of finishes are Metronomes. At {slowBand.label}, {(slowBand.shares[0] * 100).toFixed(0)}% are, while Early drifters make up {(slowBand.shares[3] * 100).toFixed(0)}%.</>}>
        <ArchetypeRiver data={data} />
      </StorySection>
      <StorySection id="gender" kicker="04 · Recorded gender" title={<>Five times as many <em>Cliffs</em> among men.</>}
        dek={<>Compared at the same mix of finish times, {(men[4] * 100).toFixed(1)}% of men&apos;s finishes are Cliffs against {(women[4] * 100).toFixed(1)}% of women&apos;s, and {(women[0] * 100).toFixed(0)}% of women&apos;s finishes are Metronomes against {(men[0] * 100).toFixed(0)}% of men&apos;s.</>}>
        <div className="gender-compare">
          {data.archetypes.map((a, i) => (
            <div key={a.slug} className="gender-row">
              <span>{a.name}</span>
              <span className="gender-bars"><i className="w" style={{ width: `${(women[i] / 0.4) * 100}%` }} /><i className="m" style={{ width: `${(men[i] / 0.4) * 100}%` }} /></span>
              <strong>{(women[i] * 100).toFixed(1)}% · {(men[i] * 100).toFixed(1)}%</strong>
            </div>
          ))}
          <div className="legend-row"><span><i className="swatch" style={{ background: '#7A4DFF' }} />Women (recorded)</span><span><i className="swatch" style={{ background: '#0FA3A3' }} />Men (recorded)</span><span>Standardized to the same 30-minute finish-band mix</span></div>
        </div>
      </StorySection>
      <StorySection id="habits" kicker="05 · Habits" title={<>Pacing habits <em>follow runners</em>.</>}
        dek={<>Across {count(t.pairs)} pairs of consecutive races, {(t.repeat_share * 100).toFixed(0)}% repeat the same type. After a Cliff, the next race is a Cliff {((t.rows[4].repeat_share ?? 0) * 100).toFixed(0)}% of the time, {((t.rows[4].repeat_share ?? 0) / t.rows[4].overall_share).toFixed(1)}× its overall share.</>}>
        <RepeatHabits data={data} />
      </StorySection>
      <StorySection id="courses" kicker="06 · Courses" title={<>Some courses make <em>Metronomes</em>.</>} dek="Sort the courses by any type to see where steady races are most and least common.">
        <CourseTypes data={data} />
      </StorySection>
      <StorySection id="you" kicker="07 · Your race" title={<>Which runner <em>were you</em>?</>} dek={<>Enter your checkpoint times to see your pacing sentence and type. {count(data.sentences.total_distinct)} different nine-letter sentences occur; the all-even <code>EEEEEEEEE</code> is shared by {count(data.sentences.all_even_n)} finishes.</>}>
        <WhichArchetype data={data} />
      </StorySection>
      <StoryMethods manifest={manifest} files={['archetypes.json']} method={data.method}
        caveats={[
          'Types are assigned after the race from its own splits; they describe shapes, not fitness, physiology or advice.',
          `Shapes form a continuum. ${gentle.name}s and ${late.name}s, for example, blend into each other; the six names mark common regions.`,
          `Relative paces compare each section with the same finish's average, so "quick early" partly reflects a slow ending.`,
          `${data.start_offset_editions.length} editions whose first 5 km appears to include start delay are left out of these shape statistics.`,
          'Repeat pairs use screened identity candidates, not verified people, and only runners who raced again appear.',
          `Recorded gender only; "Other / not recorded" finishes are included in totals but not in the gender comparison. ${metronome.name} and ${cliff.name} shares by gender hold finish time constant but not course, age or conditions. ${fast.name}s are rarest among the fastest finishes.`,
        ]} />
    </>
  );
}
