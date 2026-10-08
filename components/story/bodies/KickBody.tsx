import type { InsightsManifest, Kick } from '@/lib/insights';
import { count, mss } from '@/lib/viz/format';
import { BankAndPay, BreakRiver, GenderKick, Magnet, StateFlow, TwinRunners, WarningLight } from '../KickStory';
import { StoryMethods, StorySection } from '../StoryShell';
import { Checkpoint, Distance, Section } from '../Units';
import { StoryData } from '../StoryData';
import { shareInWords } from '@/lib/stories';

const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`;

/** Start of a section label in km ("35–40" gives 35), for ordering break sections. */
const sectionStart = (section: string) => Number.parseFloat(section);

/**
 * The break pattern across 5–20 km pace bands, read from the data: the bands that never reach a break before the first one that does,
 * and the run of bands from there in which the break comes no later as the early pace gets slower. Each limit is the band label's
 * upper marathon time ("2:30–3:00" or "Under 3:00" gives 3:00), or null when the data do not show that part of the pattern.
 */
function breakPattern(bands: Kick['breaks']['bands']) {
  const first = bands.findIndex((b) => b.break_section);
  if (first < 0) return { neverUnder: null, earlierUpTo: null };
  let last = first;
  while (last + 1 < bands.length && bands[last + 1].break_section && sectionStart(bands[last + 1].break_section!) <= sectionStart(bands[last].break_section!)) last += 1;
  const upper = (label: string) => (/^(?:[^–]+–|Under )(\d+:\d{2})$/.exec(label)?.[1] ?? null);
  const earlier = sectionStart(bands[last].break_section!) < sectionStart(bands[first].break_section!);
  return {
    neverUnder: first > 0 ? upper(bands[first - 1].label) : null,
    earlierUpTo: earlier && last < bands.length - 1 ? upper(bands[last].label) : null,
  };
}

export default function KickBody({ data, manifest }: { data: Kick; manifest: InsightsManifest }) {
  const k = data.kick;
  const earlier = data.magnet.slice(0, -1).map((r) => r.all);
  const rec = data.recovery;
  const stay = rec.stay;
  const brk = data.breaks.all.sections;
  const at30 = brk[6];
  const warn = data.warning.find((w) => w.after === '25–30')!;
  const warnHigh = warn.rows.find((r) => r.label === '15–20% slower');
  const warnLow = warn.rows.find((r) => r.label === 'Faster');
  const fast = data.bank.bands.find((b) => b.label === 'More than 10% faster');
  const best = data.bank.curve.reduce((b, r) => (r.finish_s < b.finish_s ? r : b), data.bank.curve[0]);
  const twin = data.cost.bands.find((b) => b.lo_min === 225) ?? data.cost.bands[0];
  const st = data.cost.stratified;
  const allWomen = data.gender_kick.every((r) => r.women > r.men);
  const exceptions = data.gender_kick.filter((r) => r.women <= r.men).map((r) => r.label);
  const rc = data.recurrence;
  const firstGk = data.gender_kick.find((r) => r.label === '3:30–4:00');
  const pattern = breakPattern(data.breaks.bands);
  return (
    <StoryData value={{ kick: data }}>
      <StorySection id="magnet" kicker="01 · The finish-line magnet" title={<>{shareInWords(k.share)} finishes <em>speed up</em> for the last <Distance km={2.195} />.</>}
        dek={<>{pct(k.share, 1)} of {count(k.n)} finishes ran the final <Distance km={2.195} /> faster than their <Section i={7} />. In each earlier 5 km section after <Checkpoint km={20} />, only {pct(Math.min(...earlier))} to {pct(Math.max(...earlier))} beat the section before.
          Even among finishes with a sustained slowdown, {pct(k.slowdown_share)} found a final kick.</>}>
        <Magnet />
      </StorySection>

      <StorySection id="states" kicker="02 · No second wind" title={<>After a sustained slowdown, <em>{rec.share_any < 0.2 ? 'few finishes' : rec.share_any < 0.5 ? 'most finishes do not' : 'many finishes'}</em> get back to their early pace.</>}
        dek={<>Once a 5 km section was 25% or more slower than the runner&apos;s 5–20 km pace, the next 5 km was still 25% or more slower {pct(stay[0].stay)} of the time from <Section i={5} /> and {pct(stay[1].stay)} from <Section i={6} />.
          Of the {count(rec.room_n)} finishes whose sustained slowdown ended in time to leave a full 5 km section, {pct(rec.share_full_section_room, 1)} ran one back within 10% of their early pace. Only {pct(k.slowdown_final_below_baseline, 1)} of all finishes with a sustained slowdown ran the final section faster than their early pace, against {pct(k.other_final_below_baseline)} of the rest.</>}>
        <StateFlow />
        <p className="story-aside">Recorded women with a sustained slowdown got back within 10% of their early pace at some later point {pct(rec.women_any)} of the time; men {pct(rec.men_any)}. This is not matched on pace, age or course.</p>
      </StorySection>

      <StorySection id="break" kicker="03 · The break" title={<>At <Section i={6} />, most of the field is <em>more than 10% off</em> its early pace.</>}
        dek={<>Through <Checkpoint km={15} /> almost everyone runs close to their own 5–20 km pace. By <Section i={6} />, {pct(at30.over10, 1)} of finishes are more than 10% slower than it, and the middle half of the field is spread {((at30.p75 - at30.p25) / (brk[0].p75 - brk[0].p25)).toFixed(1)} times wider than over <Section i={0} />, the only early section outside the 5–20 km baseline.{pattern.earlierUpTo ? <> Up to a {pattern.earlierUpTo} marathon pace, the slower the early pace, the earlier the break</> : null}{pattern.neverUnder ? <>{pattern.earlierUpTo ? '; p' : ' P'}aces under {pattern.neverUnder} never reach it</> : null}{pattern.earlierUpTo || pattern.neverUnder ? '.' : null}</>}>
        <BreakRiver />
      </StorySection>

      <StorySection id="warning" kicker="04 · The warning light" title={<>A slow <Section i={5} /> <em>is a warning</em>.</>}
        dek={warnHigh && warnLow ? <>Among finishes with no sustained slowdown by <Checkpoint km={30} />, those whose <Section i={5} /> was already 15–20% slower than their early pace went on to have one {pct(warnHigh.later)} of the time. Those who ran it faster than their early pace: {pct(warnLow.later, 1)}.</> : undefined}>
        <WarningLight />
      </StorySection>

      <StorySection id="bank" kicker="05 · Bank and pay" title={<>Time banked early <em>went with more time lost later</em>.</>}
        dek={fast ? <>Compared with finishes in the same race at the same 5–20 km pace, those who ran the first 5 km more than 10% faster than that pace banked {mss(Math.abs(fast.open_s))}, then spent {mss(fast.after20_s)} more after <Checkpoint km={20} /> and finished {mss(fast.finish_s)} behind on average.
          They had a sustained slowdown {pct(fast.slowdown, 1)} of the time, against {pct(fast.expected, 1)} for their race and pace. The best average finish went with a first 5 km {best.lo}–{best.lo + 1}% slower than the 5–20 km pace.</> : undefined}>
        <BankAndPay />
      </StorySection>

      <StorySection id="twins" kicker="06 · Twin runners" title={<>Same pace to <Checkpoint km={20} />, <em>{Math.round((twin.slowdown_finish_s - twin.other_finish_s) / 60)} minutes apart</em> at the finish.</>}
        dek={<>Finishes with a {twin.label} marathon pace over 5–20 km reached <Checkpoint km={20} /> in the same median time, with or without a sustained slowdown. Their median finishes were {mss(twin.slowdown_finish_s - twin.other_finish_s)} apart.
          Compared within the same race, recorded gender and 5 s/km band, the typical gap is {Math.round(st.median_gap_s / 60)} minutes ({count(st.strata)} groups).</>}>
        <TwinRunners />
      </StorySection>

      <StorySection id="women-men" kicker="07 · Women and men" title={<>Women <em>out-kick</em> men at {allWomen ? 'every pace' : exceptions.length === 1 && exceptions[0] === 'Under 2:30' ? 'all but the fastest pace' : 'most paces'}.</>}
        dek={firstGk ? <>At a 3:30–4:00 pace over 5–20 km, {pct(firstGk.women, 1)} of recorded women&apos;s finishes sped up over the final section, against {pct(firstGk.men, 1)} of men&apos;s, even though women had slowed less by <Section i={7} /> ({pct(firstGk.women_35_40, 1)} against {pct(firstGk.men_35_40, 1)} slower than their early pace).{exceptions.length ? <> The exception{exceptions.length > 1 ? 's are the' : ' is the'} {exceptions.map((x) => x.toLowerCase()).join(', ')} band{exceptions.length > 1 ? 's' : ''}, where few recorded women run.</> : null}</> : undefined}>
        <GenderKick />
      </StorySection>

      {rc.after_slowdown && rc.after_none ? (
        <StorySection id="follows" kicker="08 · The next linked race" title={<>A sustained slowdown <em>tends to come back</em>.</>}
          dek="Pairs of consecutive races linked to one screened candidate profile (not a verified person), one to three years apart, compared with what was typical in the later race at the same 5–20 km pace.">
          <div className="bibs">
            <div className="bib"><span className="bib-tag">After a sustained slowdown</span><span className="bib-number">{pct(rc.after_slowdown.observed)}</span><span className="bib-text">of next races had one too, against {pct(rc.after_slowdown.expected)} typical for that race and pace ({count(rc.after_slowdown.pairs)} pairs).</span></div>
            <div className="bib"><span className="bib-tag">After a race without one</span><span className="bib-number">{pct(rc.after_none.observed)}</span><span className="bib-text">against {pct(rc.after_none.expected)} typical ({count(rc.after_none.pairs)} pairs).</span></div>
            {rc.after_slowdown_other_course ? <div className="bib"><span className="bib-tag">On a different course</span><span className="bib-number">{pct(rc.after_slowdown_other_course.observed)}</span><span className="bib-text">after a sustained slowdown, against {pct(rc.after_slowdown_other_course.expected)} typical ({count(rc.after_slowdown_other_course.pairs)} pairs).</span></div> : null}
          </div>
        </StorySection>
      ) : null}

      <StoryMethods manifest={manifest} files={['kick.json']} method={data.method}
        caveats={[
          'The final section is 2.195 km, so finish-mat placement and course shape matter more there than in a 5 km section.',
          'Recorded 5 km sections cannot show walking breaks, stops or recoveries inside a section; runners who did not finish are absent.',
          `${data.grid_screen.length + data.start_offset_editions.length} editions are left out of the section statistics: ${data.grid_screen.map((g) => `${g.city} ${g.year} (${g.reason.toLowerCase()})`).join('; ')}, plus the start-offset editions. These are inferences from the timing data.`,
          'Same-race comparisons hold the race and the 5–20 km pace fixed, not fitness, goals, experience or conditions. The 5–20 km pace can already reflect a fast opening.',
          'Repeat pairs link screened candidate profiles, not verified people, and only runners who raced again appear.',
          'Counts are race finishes, not unique people. Associations describe, they do not explain why.',
        ]} />
    </StoryData>
  );
}
