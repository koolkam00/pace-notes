import type { Archetypes } from '@/lib/insights';
import { count } from '@/lib/viz/format';
import ArchetypeChapter from '../ArchetypeChapter';
import { ArchetypeRiver, PacingBarcode, RepeatHabits, WhichArchetype } from '../ArchetypeStory';
import { CourseTypes } from '../MoreCharts';
import { StorySection } from '../StoryShell';
import { Section } from '../Units';
import { StoryData } from '../StoryData';

export default function PacingTypesBody({ data }: { data: Archetypes }) {
  const common = data.archetypes.reduce((best, x) => (x.share > best.share ? x : best));
  const rare = data.archetypes.reduce((least, x) => (x.share < least.share ? x : least));
  const men = data.gender.men.standardized_shares;
  const women = data.gender.women.standardized_shares;
  const t = data.transitions;
  const fastBand = data.river[0];
  const slowBand = data.river[data.river.length - 1];
  const five = data.barcode.find((b) => b.lo_s <= 18000 && b.hi_s > 18000) ?? data.barcode[data.barcode.length - 1];
  return (
    <StoryData value={{ archetypes: data }}>
      <StorySection id="six" kicker="01 · The six types" title={<>Same finish time, <em>six journeys</em>.</>}
        dek={<>{count(data.cohort_n)} finishes fall into six recurring shapes. The {common.name} is the most common ({(common.share * 100).toFixed(1)}%), the {rare.name} the rarest ({(rare.share * 100).toFixed(1)}%). Watch them race: every runner below finishes at exactly the same moment.</>}>
        <ArchetypeChapter />
      </StorySection>
      <StorySection id="barcode" kicker="02 · The barcode" title={<>The red arrives <em>earlier</em> for slower finishes.</>}
        dek={<>The fastest {(100 / 200).toFixed(1)}% of finishes stay nearly even; by five hours the median finish runs <Section i={6} /> and <Section i={7} /> {Math.round(Math.min(five.median[6], five.median[7]))}–{Math.round(Math.max(five.median[6], five.median[7]))}% slower than its own average.</>}>
        <PacingBarcode />
      </StorySection>
      <StorySection id="river" kicker="03 · Who runs which way" title={<>Metronomes get <em>rarer</em> as the clock runs.</>}
        dek={<>At {fastBand.label}, {(fastBand.shares[0] * 100).toFixed(0)}% of finishes are Metronomes. At {slowBand.label}, {(slowBand.shares[0] * 100).toFixed(0)}% are, while Early drifters make up {(slowBand.shares[3] * 100).toFixed(0)}%.</>}>
        <ArchetypeRiver />
      </StorySection>
      <StorySection id="gender" kicker="04 · Recorded gender" title={<>Five times as many <em>Cliffs</em> among men.</>}
        dek={<>At the same finish times, {(men[4] * 100).toFixed(1)}% of men&apos;s finishes are Cliffs against {(women[4] * 100).toFixed(1)}% of women&apos;s, and {(women[0] * 100).toFixed(0)}% of women&apos;s finishes are Metronomes against {(men[0] * 100).toFixed(0)}% of men&apos;s.</>}>
        <div className="gender-compare">
          {data.archetypes.map((a, i) => (
            <div key={a.slug} className="gender-row">
              <span>{a.name}</span>
              <span className="gender-bars"><i className="w" style={{ width: `${(women[i] / 0.4) * 100}%` }} /><i className="m" style={{ width: `${(men[i] / 0.4) * 100}%` }} /></span>
              <strong>{(women[i] * 100).toFixed(1)}% · {(men[i] * 100).toFixed(1)}%</strong>
            </div>
          ))}
          <div className="legend-row"><span><i className="swatch" style={{ background: '#7A4DFF' }} />Women (recorded)</span><span><i className="swatch" style={{ background: '#0FA3A3' }} />Men (recorded)</span></div>
        </div>
      </StorySection>
      <StorySection id="habits" kicker="05 · Habits" title={<>Pacing shapes <em>tend to repeat</em>.</>}
        dek={<>In {count(t.pairs)} pairs of consecutive linked races, {(t.repeat_share * 100).toFixed(0)}% repeat the same type. After a Cliff, the next race is a Cliff {((t.rows[4].repeat_share ?? 0) * 100).toFixed(0)}% of the time, {((t.rows[4].repeat_share ?? 0) / t.rows[4].overall_share).toFixed(1)}× its overall share.</>}>
        <RepeatHabits />
      </StorySection>
      <StorySection id="courses" kicker="06 · Courses" title={<>Metronomes are <em>more common</em> on some courses.</>} dek="Sort the courses by any type to see where steady races are most and least common.">
        <CourseTypes />
      </StorySection>
      <StorySection id="you" kicker="07 · Your race" title={<>Which runner <em>were you</em>?</>} dek={<>Enter your checkpoint times to see your pacing sentence and type. {count(data.sentences.total_distinct)} different nine-letter sentences occur; the all-even <code>EEEEEEEEE</code> is shared by {count(data.sentences.all_even_n)} finishes.</>}>
        <WhichArchetype />
      </StorySection>
    </StoryData>
  );
}
