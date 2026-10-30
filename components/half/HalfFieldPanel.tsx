import { getNugget, sentenceOf } from '@/lib/nuggets';
import { hm, pct } from '@/lib/nuggets/format';
import { readHalf } from '@/lib/half-server';
import { halfManifest } from '@/lib/stories';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { ShareCurve } from './HalfCharts';
import Arrow from '@/components/ui/Arrow';
import ArrowTail from '@/components/ui/ArrowTail';
import { withEm } from '@/components/ui/withEm';
import { UnitLink as Link } from '@/components/UnitsProvider';

/** The marks the panel names, in minutes; the one the sentence is about is the signal. */
const MARKS = [90, 105, 120, 135, 150];
const READING = 120;

/**
 * The half marathon pace chart's observed panel (Pace Notes data, half finishes in verified results; no scope chip),
 * kept apart from the chart's pace columns, which stay unbadged calculations: the share of half finishes under each
 * time from the first published mark (1:15) to 3:00, five round times named on the curve, the field reading as its sentence with the recorded
 * women's and men's shares under 2:00, the way to /half and to the predictor. Server-drawn, so the page ships no chart script. Nothing
 * shows when the half data is not in this build.
 */
export default function HalfFieldPanel() {
  if (!halfManifest()?.files['field.json']) return null;
  const field = readHalf('field.json');
  const reading = getNugget('half.field');
  const under = field.under;
  const at = (minutes: number) => under.find((u) => u.s === minutes * 60);
  const two = at(READING);
  const last = under[under.length - 1].s / 60;
  // The curve starts at the histogram's first minute (1:10, the share under it from its tail), so the first round
  // time's share has room to its left on the narrowest screens.
  const { lo, under_lo: tail } = field.minutes;
  const first = lo;
  const curve = [{ x: lo, y: tail / field.cohort.finishes }, ...under.map((u) => ({ x: u.s / 60, y: u.all }))];
  const said = sentenceOf(reading);
  // Each sex's own share under 2:00, named as one: "recorded women’s 33%, men’s 67%" after the colon read as a split of
  // the finishes under 2:00, the two adding up to 100 (review, October 30, 2026).
  const sentence = reading.guard && two ? `${said.replace(/\.$/, '')}: ${pct(two.F)} of recorded women’s finishes and ${pct(two.M)} of men’s.` : said;
  const marks = MARKS.map((m) => at(m)).filter((u): u is NonNullable<typeof u> => !!u);
  return (
    <section className="tool-panel half-field" id="half-field" data-half-scope="verified" aria-labelledby="half-field-title">
      <EvidenceTag kind="data" />
      <h2 className="tool-nugget-text" id="half-field-title">{reading.guard ? withEm(sentence) : sentence.replace(/\*/g, '')}</h2>
      <ShareCurve curve={curve} xDomain={[first, last]}
        // Each round time's share sits left of its dot, above the curve (the time is the tick under it), so all five fit
        // on the narrowest phone ("1:30 · 7%" beside its dot did not, at the curve's foot).
        marks={marks.map((u) => ({ x: u.s / 60, y: u.all, text: pct(u.all), signal: u.s === READING * 60 }))}
        // Every 15 minutes from 1:15 to the scale's end (3:00), the half hours first and the quarters showing and hiding
        // together, so the steps stay even at every width (a lone gap from 2:30 to 3:00 read as a broken scale). The
        // quarters come before the end's 3:00, which shows where it fits beside 2:45: on a phone every round time the
        // curve names keeps its time under it (1:45 and 2:15 had none below desktop, so their 26% and 79% read against
        // no time; round 4 review, October 30, 2026). The ticks keep 4 px between labels rather than 6, so 3:00 fits
        // beside 2:45 from a 320 px plot (a 390 px phone; the 6 px rule hid it below 360 px, so the curve ran on
        // unlabelled past 2:45; review, October 30, 2026); the generous width estimate leaves about 7 px on screen.
        tickGap={4}
        xTicks={Array.from({ length: Math.floor((last - 75) / 15) + 1 }, (_, i) => 75 + i * 15).filter((m) => m >= first && m <= last)
          .map((m) => ({ value: m, label: hm(m), priority: m === READING ? 4 : m === last ? 0.5 : m % 30 === 0 ? 3 : 2, group: m % 30 === 0 ? undefined : 'quarters' }))}
        yTicks={[0.25, 0.5, 0.75].map((v) => ({ value: v, label: pct(v) }))}
        label={`The share of half marathon finishes under each time from ${hm(under[0].s / 60)} to ${hm(last)}: ${marks.map((u) => `${pct(u.all)} under ${hm(u.s / 60)}`).join(', ')}.`} />
      <p className="half-field-more"><Link href="/half">The half marathon<Arrow /></Link></p>
      {/* The question a half runner who lands here asks next, one hop away (review, October 30, 2026: it took two). The
          tool carries its own badge and chip; this line has no figure. */}
      <p className="half-field-next arrow-line">The marathon after a half? <Link href="/tools/predictor?d=half"><ArrowTail text="Finish-time predictor" /></Link></p>
    </section>
  );
}
