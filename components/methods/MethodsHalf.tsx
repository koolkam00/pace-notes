import { UnitLink as Link } from '@/components/UnitsProvider';
import { halfPin, halfStampCorrection, readHalf } from '@/lib/half-server';
import type { HalfBatteryId, HalfManifest } from '@/lib/half-types';
import { halfCardWords } from '@/lib/charts/text/half';
import { flagshipGuard, halfExtraFrom, womenBandsPublished } from '@/lib/nuggets/half';
import { STORIES, halfManifest, storyHref } from '@/lib/stories';
import { floorHM } from '@/lib/tools/half-to-full';
import { Definition, Detail, Topic, and, dataHref, day, editionList, n, pctText } from './shared';

/**
 * The half-marathon parts of /methodology (spec section 5): what the half results are, verified and unverified results,
 * how half and marathon records are linked, the definitions the half pages use, how the half figures and the flagship's
 * are worked out, the tools' half panels, the cards and the half downloads. Every count is read from the verified half
 * manifest or its family files, never typed; each piece renders nothing when the half data is not in this build. This
 * page is the one place the words "verified" and "unverified" appear outside the scope chip.
 */

const pct0 = (share: number) => pctText(share, 0);
/** Whole percent from 10% up, one decimal below (0.1% is not 0%). */
const pctFit = (share: number) => pctText(share, share >= 0.1 ? 0 : 1);
const min1 = (seconds: number) => `${seconds >= 0 ? '+' : '−'}${(Math.abs(seconds) / 60).toFixed(1)}`;
const minutesOf = (seconds: number) => Math.round(seconds / 60);
const plusMin = (seconds: number) => `${seconds >= 0 ? '+' : '−'}${Math.abs(minutesOf(seconds))}`;
/** The countries the verified results come from, by ISO 3166 code (field.json checks.countries). */
const COUNTRY: Record<string, string> = {
  AT: 'Austria', BE: 'Belgium', CH: 'Switzerland', CZ: 'Czechia', DE: 'Germany', DK: 'Denmark', ES: 'Spain', FR: 'France', GB: 'the United Kingdom',
  IE: 'Ireland', IT: 'Italy', NL: 'the Netherlands', NO: 'Norway', PL: 'Poland', PT: 'Portugal', SE: 'Sweden', US: 'the United States',
};
const countryName = (code: string) => COUNTRY[code] ?? code;
const NUMBER_WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const countWord = (k: number) => NUMBER_WORD[k] ?? n(k);
/**
 * An edition's city: the producer's label up to a long race label's colon ("Kraków: Cracovia …" is Kraków), so one race
 * under two labels reads as one ("Kraków 2022 and 2025", not "Kraków 2025" beside "Cracovia Półmaraton Królewski 2022";
 * review, October 30, 2026).
 */
const cityName = (label: string) => label.split(': ')[0];
const COUNTRY_ADJECTIVE: Record<string, string> = { NO: 'Norwegian', FR: 'French', PT: 'Portuguese', AT: 'Austrian', PL: 'Polish', DE: 'German' };
const BATTERY: Record<HalfBatteryId, string> = {
  pooled: 'all pairs',
  verified_halves: 'verified halves only',
  other_marathons: 'without the Valencia and Warsaw marathons',
  ns_keys_1: 'the rarest names only',
  one_per_person: 'one pair per record, the latest',
  editions_equal_20: 'marathon editions of at least 20 pairs, weighted equally',
  editions_equal_100: 'marathon editions of at least 100 pairs, weighted equally',
  city_equal: 'marathon cities weighted equally',
};

/** What each "From the half" card draws. */
const CARD_TOPICS: Record<string, string> = {
  'half-under-2': 'half finishes under 2:00',
  'half-more-women': 'women in the same city’s half and marathon',
  'half-double': 'the marathon against double the half',
  'half-same-half': 'women’s and men’s sustained slowdowns after the same half',
};

/** What each half file holds, for Downloads. */
const HALF_FILE_TOPICS: Record<string, string> = {
  'field.json': 'half finish times in verified results',
  'women.json': 'women’s share by finish band, and the same city’s half and marathon',
  'linked.json': 'the marathons after each half time, records linked by name',
  'tools/half-to-full.json': 'the predictor’s copy of those windows',
  'cards.json': 'the From the half cards’ plots and values',
};

function useHalf(): HalfManifest | null {
  return halfManifest();
}

/** Part 1: the half results, verified and unverified results, and the links between half and marathon records. */
export function HalfDataTopics() {
  const m = useHalf();
  if (!m) return null;
  const c = m.policy.counts;
  const field = readHalf('field.json');
  const linked = readHalf('linked.json');
  const rules = m.link_rules;
  const top = field.checks.countries.slice(0, 5);
  const sr = field.checks.same_race;
  const ea = field.checks.editions_equal_all;
  const small = ea.editions - field.checks.editions_equal.editions;
  const smallTop = [...field.checks.countries].sort((a, b) => b.small_editions - a.small_editions)[0];
  const cov = linked.checks.coverage;
  const covHi = cov[0], covLo = cov[cov.length - 1];
  const correction = halfStampCorrection();
  // The largest withdrawn races by name, each with its runs of years (the full list is in the policy file).
  const NAMED = ['Paris', 'Valencia', 'Berlin', 'New York'];
  const withdrawnNamed = editionList(NAMED.flatMap((city) => correction.withdrawn.filter((w) => w.city === city)));
  const weaker = editionList(correction.weaker_source.map((x) => ({ city: cityName(x.city), year: x.year })));
  return <>
    <Topic id="half-data" title="The half-marathon results">
      <p>The half-marathon pages use a separate snapshot of recorded half-marathon results, taken {day(m.as_of)}. A row is one finish: a race, a year, a finish time and, where the source published it, a recorded sex (never inferred). Times mix chip and gun timing as each race published them. The results, the links between records and the scripts that built the links are the owner’s public releases under CC BY 4.0, downloadable without an account (<a href="#downloads-half">Downloads</a>). Pages show only totals, and so that each estimate rests on enough results, every group a page shows holds at least 100 finishes or pairs and any claim across editions rests on at least 3 editions.</p>
      <p>Of {n(c.raw)} recorded results, these rules leave out, in order:</p>
      <ul>
        <li>{n(c.R1)} the producer flagged as copies, other contests in the same lists, implausible times, disqualifications or other result-set problems;</li>
        <li>{n(c.R3)} in sub-races that are not running (skating, wheelchair, mountain bike and similar lists){c.R2 ? `, after ${n(c.R2)} with no readable finish` : ''};</li>
        <li>{n(c.R4)} in sub-races where many finishes are faster than any runner of the distance, and {n(c.R5_fast + c.R5_slow)} finishes under 56:42 or over 6:00:00;</li>
        <li>{n(c.R6)} repeated in one edition (the same name, finish and sex), keeping one copy;</li>
        <li>{n(c.R7)} in the Oslo Half’s bib block of same-day marathon finishers listed under the half (a bib range, never a list of people).</li>
      </ul>
      <p>That leaves {n(c.record_usable_after_R7)}. Editions then supply nothing when they have no registry row ({n(c.E0_editions)} editions), are held for review by the producer ({n(c.E1_held_editions)} editions, {n(c.E1_held_finishes)} finishes), or fail a reviewed check ({n(c.E2_E8_editions)} editions, {n(c.E2_E8_finishes)} finishes): copies or overlaps of another edition, another distance, a finisher count far from the published one, a list of one sex only, a top list, a round-number cap, an atypical field, or a median far from the same race’s other years. The Berlin half’s 2018, 2019, 2022 and 2023 lists are among them: their times fit gun times. {n(c.use_finish.finishes)} finishes in {n(c.use_finish.editions)} editions remain. {n(c.undated.editions)} of those editions have no race date, so they never enter a linked pair.</p>
      <p>The reviewed lists are frozen in <a href={`https://github.com/koolkam00/pace-notes/blob/main/${m.policy.file}`}>{m.policy.file.split('/').pop()}</a>; a new snapshot shows no half figure until its lists are reviewed again.</p>
    </Topic>

    <Topic id="half-coverage" title="Verified and unverified half results">
      <p>A verified result is one the producer stamped twice: in this snapshot, and again in the producer’s corrected edition metadata (<a href="#downloads-half">Downloads</a>). A stamp means the finisher count is within 0.5% of an independent published total and the year and both winners are confirmed. The corrected metadata withdrew the stamps whose count came from a source that is not independent (an aggregator, a timing platform’s own list or total, or a republished result): {n(c.stamp_withdrawn.editions)} editions of this snapshot, {n(c.stamp_withdrawn.finishes)} finishes, among them {withdrawnNamed}. They stay in as unverified results. {countWord(correction.weaker_source.length)} stamps rest on an organiser’s or a local paper’s count rather than a federation’s, so the producer marks them as weaker: {weaker}. They stay verified.</p>
      <p>{n(c.verified.editions)} usable editions are verified, with {n(c.verified.finishes)} finishes, mostly in {and(top.map((x) => `${countryName(x.label)} (${pct0(x.share)}${x === top[0] ? ' of their finishes' : ''})`))}. Within the same race, verified and unverified years look alike: in the {n(sr.races)} races with both, the verified years’ median finish differed from the unverified years’ by a median {min1(sr.diff_s.p50)} minutes (the middle half of races from {min1(sr.diff_s.p25)} to {min1(sr.diff_s.p75)}). The pooled sets differ mainly because they hold different races.</p>
      <p>The half-only figures on <Link href="/half">The half marathon</Link> and the half pace chart use verified results only and carry no label. The figures of records linked by name (the half-to-full story, the predictor’s half panel and the goal pages’ half line) also use unverified halves: {pct0(linked.set.verified_half_share)} of their halves are verified. They carry one chip, “Includes unverified half results”, which links here.</p>
      <p>Scope checks: across every usable result, verified or not, {pctText(field.checks.all_usable.under_7200)} of finishes came in under 2:00 and {pctText(field.checks.all_usable.under_6300)} under 1:45; taking each verified edition’s own share, the median of the {n(field.checks.editions_equal.editions)} editions of at least {n(field.checks.editions_equal.min_finishes)} finishes is {pctText(field.checks.editions_equal.under_7200)} under 2:00 and {pctText(field.checks.editions_equal.under_6300)} under 1:45, and the median of all {n(ea.editions)} is {pctText(ea.under_7200)} under 2:00{small > 0 ? `: the ${n(small)} editions under ${n(field.checks.editions_equal.min_finishes)} finishes${smallTop ? `, ${n(smallTop.small_editions)} of them ${COUNTRY_ADJECTIVE[smallTop.label] ?? `in ${countryName(smallTop.label)}`}` : ''}, ${ea.under_7200 > field.checks.editions_equal.under_7200 ? 'raise' : 'lower'} it` : ''}. The pages pool finishes, because their claims are about finishes and many small races would otherwise weigh as much as the largest.</p>
    </Topic>

    <Topic id="half-linking" title="Half and marathon records linked by name">
      <p>A half record and a marathon record are linked when they share a normalized name, the published sex and a year-of-birth or age-bin key, in the producer’s link build. Only links of {and(rules.tiers.map((t) => `${t}`))} confidence count, for names with at most {rules.ns_keys_max} age keys per name and sex; candidate merges are {rules.candidate_merges}. Both sides join on canonical record IDs: the marathon side is the adopted release’s eligible finish, read from the public runner records.</p>
      <p>Each eligible marathon is paired with the nearest earlier half of a record linked to it, {rules.window_days[0]} to {rules.window_days[1]} days before, one pair per linked record and marathon. A half on the same date as another half of the record, or on the date of one of its marathons, is left out, as are editions whose date is in doubt. That gives {n(linked.set.pairs)} pairs from {n(linked.set.people)} linked identities: {n(linked.set.marathon_editions)} marathon editions in {n(linked.set.marathon_cities)} cities and {n(linked.set.half_editions)} half editions.</p>
      <p>Some links join two different people. Those false links add a small excess of pairs; the medians barely move, while the tails widen. How many marathon finishers can be linked depends on how each source publishes age{cov.length >= 2 ? `: the share of eligible marathon finishes linked to a record with a usable half runs from ${pctFit(covHi.share)} in ${covHi.city} to ${pctFit(covLo.share)} in ${covLo.city}` : ''}. So no page shows how many marathoners run halves or compares cities by their linked share. The highest-confidence links are all to US halves, so link confidence is not a quality check here. Every count is a pair of records, never a verified person, and the pairs describe what went together, not why.</p>
    </Topic>
  </>;
}

/** Part 1 #totals: the half pages' starting totals. */
export function HalfTotalsLine() {
  const m = useHalf();
  if (!m) return null;
  return <p>The half pages start from {n(m.cohort.verified.finishes)} half finishes in {n(m.cohort.verified.editions)} verified results; pages that say records linked by name start from {n(m.cohort.linked.pairs)} half and marathon pairs (<a href="#half-coverage">verified and unverified half results</a>).</p>;
}

/** Part 2: the definitions the half pages use. */
export function HalfMultipleDefinition() {
  const m = useHalf();
  if (!m) return null;
  // The pace against the half, the readout's minutes over double, the reading and its ruler are on the story only while
  // its reading holds (half.extra's guard); under its plain heading only the table's "Over double" column is, so this
  // describes that alone (post-merge review, round 3, October 31, 2026: it described pieces the page no longer showed).
  const reading = halfExtraFrom(readHalf('linked.json')).guard;
  return (
    <Definition id="half-multiple" term="Double the half, and a half near a time"
      rule={<p>The minutes over double the half are the marathon time minus twice the half time. A half “near 1:45” is one within 2:30 of that whole minute.</p>}>
      <p>A five-minute band centred on a round time (1:45 is 1:42:30 to 1:47:29) is the window at that minute. Quantiles are linear between observations, the method used everywhere on the site. The marks a window shows are quarter-hour times inside its 5th to 95th percentile, each with the exact share of marathons strictly under it. {reading
        ? 'The pace against the half is the minutes over double divided by the marathon distance: how much slower per mile (or km) the typical marathon ran than its half. On the story’s half-by-half readout and in its table, a window’s minutes over double are its typical marathon, as printed, minus twice the window’s half, so the two add up on screen; the reading and its ruler take each pair’s own half instead. In a slow window the halves run quicker than its centre, so there the pairs’ own minutes over double run a little higher.'
        : 'In the story’s half-by-half table, a window’s minutes over double (“Over double”) are its typical marathon, as printed, minus twice the window’s half, so the columns add up on screen. Taken with each pair’s own half instead, they run a little higher in a slow window, whose halves run quicker than its centre.'}</p>
    </Definition>
  );
}

/** Part 2 #evidence: what the data badge means on the half panels, and the chip. */
export function HalfEvidenceLines() {
  if (!useHalf()) return null;
  return <p>On the predictor’s half panel and the goal pages’ half line, Pace Notes data means marathon finishes of records linked by name to a half 3 to 16 weeks before; on the half marathon pace chart’s panel, half finishes in verified results. The chip “Includes unverified half results” qualifies a Pace Notes data badge; it is not a kind of evidence (<a href="#half-coverage">verified and unverified half results</a>).</p>;
}

/** Part 3: how /half's figures are worked out. */
export function HalfFieldTopic() {
  const m = useHalf();
  if (!m) return null;
  const field = readHalf('field.json');
  const women = readHalf('women.json');
  const sc = women.same_city;
  return (
    <Topic id="half-field" title="The half marathon’s figures">
      <p>The figures on <Link href="/half">The half marathon</Link> pool the {n(field.cohort.finishes)} finishes of the {n(field.cohort.editions)} verified editions. Shares under a time count finishes strictly under it, from whole-minute counts; recorded women’s and men’s shares use the {n(field.cohort.sex_editions)} editions where at least 95% of finishes carry a recorded sex and each sex is at least 3% ({n(field.cohort.sex_finishes)} finishes).</p>
      <p>Round times: the minute before each mark is compared with a smooth curve fitted to the minutes around it (a local cubic in the log of the counts, 25 minutes wide, the five minutes before and ten after each mark left out of the fit), the method of the round-number story. Its interval comes from 200 resamples of whole editions.</p>
      {womenBandsPublished(women)
        ? <p>Women’s share by finish band is the median over {n(women.band_editions.length)} verified editions with at least {n(women.band_rule.min_finishes)} finishes, at most {pct0(women.band_rule.max_unrecorded)} without a recorded sex and at least {n(women.band_rule.min_recorded_per_band)} recorded finishes in every band; the band where the shares pass one half is the same with any one edition left out. The marathon’s comparison (women’s finishes are the majority from {floorHM(women.marathon.cross_s)}) is the Top 100 chart’s, from <a href={dataHref(women.marathon.file)}>{women.marathon.file}</a>.</p>
        : <p>Women’s share by finish band would be the median over the verified editions with at least {n(women.band_rule.min_finishes)} finishes, at most {pct0(women.band_rule.max_unrecorded)} without a recorded sex and at least {n(women.band_rule.min_recorded_per_band)} recorded finishes in every band, every edition counting once, as the marathon’s chart counts them. The medians need at least {n(women.min_band_editions)} such editions; {n(women.band_editions_qualifying)} qualify, so the page leaves the bands out until a snapshot has enough.</p>}
      <p>Same city, same year: a half edition (verified, with at least 1,000 finishes and 100 recorded women and men) is paired with that city’s marathon in the same year when the marathon is not a gender-gap edition, has at most 2% without a recorded sex, kept at least 80% of its raw records and has at least 1,000 finishes and 100 of each sex. That gives {n(sc.summary.pairs)} pairs in {n(sc.summary.cities)} cities; the half had the larger women’s share in {n(sc.summary.half_higher)} of them, by a median {sc.summary.diff_median_points.toFixed(1)} points (from {sc.summary.diff_min_points.toFixed(1)} to {sc.summary.diff_max_points.toFixed(1)}). London’s 2025 and 2026 marathons and Berlin’s 2025 marathon publish too many finishes without a recorded sex, so they have no pair. Over every usable half edition, verified or not, the half was higher in {n(sc.all_scope_check.half_higher)} of {n(sc.all_scope_check.pairs)} pairs.{sc.summary.pairs < 10 || sc.summary.cities < 5 ? ` The page states a direction only with at least 10 verified pairs in 5 cities, so its ${n(sc.summary.pairs)} pairs in ${n(sc.summary.cities)} cities are drawn under a plain heading.` : ''} A city’s row is the mean of its pairs. These are the fields that entered each race, not anyone’s choice.</p>
      <p className="methods-links"><Link href="/half">Read the page</Link><a href={dataHref('half/field.json')}>half/field.json</a><a href={dataHref('half/women.json')}>half/women.json</a></p>
    </Topic>
  );
}

/** Part 3 #story-half-to-full: the flagship's method, its weightings and its limits. */
export function HalfStoryDetail() {
  const m = useHalf();
  const story = STORIES.find((s) => s.slug === 'half-to-full');
  if (!m || !story) return null;
  const linked = readHalf('linked.json');
  const b = linked.checks.battery;
  const k = linked.checks;
  const all = linked.windows.all, F = linked.windows.F, M = linked.windows.M;
  const range = (w: { h: number }[]) => `${floorHM(w[0].h)} to ${floorHM(w[w.length - 1].h)}`;
  const s = linked.sexes;
  const bands = k.multiple_by_band;
  const mid = bands.filter((x) => x.h >= 6000 && x.h <= 8400).map((x) => x.ratio_p50);
  const cities = [...k.by_city].sort((a, b) => a.extra_p50_s - b.extra_p50_s);
  const within = cities.filter((c) => c.mid).sort((a, b) => a.mid!.extra_p50_s - b.mid!.extra_p50_s);
  const last = within[within.length - 1];
  // What each weighting's typical multiple gives at the median half of all pairs: (multiple − 2) × that half, in seconds.
  // A derived value, so the sentence says so and quotes the observed window at that half beside it.
  const overDouble = b.members.map((x) => (x.multiple_p50 - 2) * b.pooled_half_p50_s);
  const at105 = all.find((w) => w.h === Math.floor(b.pooled_half_p50_s / 60) * 60) ?? null;
  const verifiedMember = b.members.find((x) => x.id === 'verified_halves')!;
  return (
    <Detail id="story-half-to-full" title={story.title}>
      <p>Each eligible marathon finish is paired with the nearest earlier half of a record linked to it by name, {m.link_rules.window_days[0]} to {m.link_rules.window_days[1]} days before (<a href="#half-linking">how records are linked</a>). A half time’s window holds the pairs whose half was within 2:30 of that whole minute (<a href="#half-multiple">the definitions</a>). Windows are shown where they hold at least 100 pairs from at least 3 marathon editions, in one unbroken run: all pairs {range(all)}, recorded women’s {range(F)}, recorded men’s {range(M)}. Neighbouring windows share all but two one-minute slices, each of at least 10 pairs.</p>
      <p>The distributions pool pairs, as finish-time context does. The reading is checked against other weightings, each as the typical multiple of the half, the minutes over double and the share under double:</p>
      <ul>
        {b.members.map((x) => <li key={x.id}>{BATTERY[x.id]}{` (${n(x.n)} ${x.id.startsWith('editions') ? 'editions' : x.id === 'city_equal' ? 'cities' : 'pairs'})`}: {x.multiple_p50.toFixed(2)}×, {min1(x.extra_p50_s)} minutes, {pctText(x.under_double)}.</li>)}
      </ul>
      <p>The minutes move with the mix of half times each weighting gives (they grow with the half), while the multiple stays between {Math.min(...b.members.map((x) => x.multiple_p50)).toFixed(2)} and {Math.max(...b.members.map((x) => x.multiple_p50)).toFixed(2)}. Applied to the median half of all pairs ({floorHM(b.pooled_half_p50_s)}), each weighting’s typical multiple gives {min1(Math.min(...overDouble))} to {min1(Math.max(...overDouble))} minutes over double, around the pooled {minutesOf(linked.overall.extra_s.p50)}{at105 ? <> (a value computed from the multiples, not an observed one: the marathons after a {floorHM(at105.h)} half took a typical {plusMin(at105.extra_p50)})</> : null}. {flagshipGuard(linked)
        ? 'The story states only the pooled reading.'
        : `The story states a reading only when every weighting agrees with it within 3 minutes at that half, and the verified halves and one pair per record within 3 minutes of the pooled minutes too. With verified halves only (${pct0(linked.set.verified_half_share)} of the pairs) the typical marathon took ${min1(verifiedMember.extra_p50_s)} minutes over double, so the story shows the pairs under a plain heading and states no reading of its own${halfExtraFrom(linked).values.figure_is_share === 1 ? '' : ': its figure is the number of pairs'}.`} {mid.length > 0 && <>The multiple itself changes little with the half: {bands[0].ratio_p50.toFixed(2)} at a {floorHM(bands[0].h)} half and {Math.min(...mid).toFixed(2)} to {Math.max(...mid).toFixed(2)} from 1:40 to 2:20, so most of the growth in minutes over double is scale. </>}{cities.length >= 2 && within.length >= 3 && <>By marathon city (at least 100 pairs from 3 editions), the typical minutes over double run from {plusMin(cities[0].extra_p50_s)} ({cities[0].city}) to {plusMin(cities[cities.length - 1].extra_p50_s)} ({cities[cities.length - 1].city}); within halves of 1:40 to 1:59, from {plusMin(within[0].mid!.extra_p50_s)} ({within[0].city}) to {plusMin(within[within.length - 2].mid!.extra_p50_s)} ({within[within.length - 2].city}), with {last.city} at {plusMin(last.mid!.extra_p50_s)}{last.verified_half_share === 0 ? ', none of whose halves are verified' : ''}. Most of the spread between cities is the mix of half times, so no page shows a city. </>}After a 1:45 half, the share under 4:00 was {pct0(k.verified.w105_under_14400)} with verified halves only, {pct0(k.other_marathons.w105_under_14400)} without the Valencia and Warsaw marathons, {pct0(k.ns_keys_1.w105_under_14400)} for the rarest names, {pct0(k.one_per_person.w105_under_14400)} with one pair per record and {pct0(k.editions_equal.w105_under_14400)} in the median marathon edition.</p>
      <p>Women and men after the same half: within each five-minute half band and marathon city with at least 20 pairs of each sex ({n(s.strata)} strata), recorded women’s marathons had a lower sustained-slowdown share in {n(s.women_lower)}; standardised to the same mix, {pctText(s.women_std)} against {pctText(s.men_std)}. With verified halves only, women were lower in {n(k.verified.sexes.women_lower)} of {n(k.verified.sexes.strata)} strata. The typical marathons of the two sexes after the same half converge at slower halves, so the story makes no claim about the multiple by sex.</p>
      <p>Limits: linked records are candidates, not verified people; marathons are finishes with every mat; most pairs are from the Valencia and Warsaw marathons; and a half run as training, not raced, lowers the multiple. These are limits of the data, not claims about any runner. Several things measured showed no clear pattern and are not findings: how far before the marathon the half was (4 to 12 weeks), age bands, and a first recorded marathon.</p>
      <p className="methods-links"><Link href={storyHref(story)}>Read the story</Link><a href={dataHref('half/linked.json')}>half/linked.json</a></p>
    </Detail>
  );
}

/**
 * Part 3 #tools-data: the half panels' own bases, beside the marathon tool groups' screens. The predictor's half panel
 * and the goal pages' half line use every eligible marathon finish (no start-delay or mat-grid screen: those screens
 * are the pace band's), paired with a half of a record linked by name; the half pace chart's panel counts half finishes
 * in verified results, which have no checkpoint rule. Counts from the half manifest.
 */
export function HalfToolData() {
  const m = useHalf();
  if (!m) return null;
  return <p>The half panels have bases of their own. The predictor’s half panel and the goal pages’ half line use every eligible marathon finish, the editions left out above included, paired with a half of a record linked by name: {n(m.cohort.linked.pairs)} pairs in {n(m.cohort.linked.marathon_editions)} marathon editions (<a href="#half-linking">how records are linked</a>). The half marathon pace chart’s panel counts {n(m.cohort.verified.finishes)} half finishes in {n(m.cohort.verified.editions)} verified results, where no checkpoint rule applies (<a href="#half-field">the half figures</a>).</p>;
}

/** Part 3 runner tools: what the predictor's half panel, the goal pages' half line and the pace chart's panel show. */
export function HalfToolNotes({ tool }: { tool: 'predictor' | 'goal-pages' | 'pace-charts' }) {
  const m = useHalf();
  if (!m) return null;
  if (tool === 'predictor') {
    const t = readHalf('tools/half-to-full.json');
    const g = t.groups;
    const ratio = readHalf('linked.json').overall.ratio_p50;
    // A multiple of the half as a half-to-full exponent (T₂ = T₁ × 2^b), and the published exponents as multiples.
    const exponent = Math.log(ratio) / Math.LN2;
    const multiple = (b: number) => (2 ** b).toFixed(2);
    return <p><strong>The half panel.</strong> For a recent half (or a distance within 0.5% of one) and a marathon to predict, the Pace Notes data panel shows the marathons of records linked by name 3 to 16 weeks after a half near the typed half’s whole minute (<a href="#story-half-to-full">the story’s method</a>), in place of the 20 km reading, from {floorHM(g.all.from)} to {floorHM(g.all.to)}; recorded women’s from {floorHM(g.F.from)} to {floorHM(g.F.to)} and recorded men’s from {floorHM(g.M.from)} to {floorHM(g.M.to)}. Its marks are quarter-hour times inside the window’s 5th to 95th percentile, never the estimate above. Outside those ranges, or for any other distance, the 20 km panel shows. The median multiple of the half, {ratio.toFixed(2)}, matches a half-to-full exponent of about {exponent.toFixed(2)}; the classic formula’s 1.06 assumes {(2 ** 1.06).toFixed(3)}, and the training-log exponents above (1.09 to 1.15) give {multiple(1.09)} to {multiple(1.15)}. Those comparisons are made here only, never in the tool, where the two kinds of evidence stay apart.</p>;
  }
  if (tool === 'goal-pages') {
    return <p><strong>The half marathon before.</strong> Each goal page names the slowest half window whose typical marathon (records linked by name) came in under the goal, so the predictor at that half shows a typical marathon under the goal and a minute slower does not. Recorded women’s and men’s halves are named where both sexes have a window there.</p>;
  }
  const under = readHalf('field.json').under;
  return <p><strong>The half marathon pace chart’s data panel</strong> shows the share of half finishes in verified results under each time from {floorHM(under[0].s)} to {floorHM(under[under.length - 1].s)} (<a href="#half-field">how it is worked out</a>), kept apart from the chart’s even-pace columns, which stay plain calculations.</p>;
}

/** Part 3 #half-cards: the unnumbered "From the half" cards, and the ones withdrawn because their takeaway fails. */
export function HalfCardsDetail() {
  const m = useHalf();
  if (!m || !m.files['cards.json']) return null;
  const docs = { field: readHalf('field.json'), women: readHalf('women.json'), linked: readHalf('linked.json') };
  const cards = readHalf('cards.json').cards;
  const shown = cards.filter((c) => halfCardWords(c, docs).guard), withdrawn = cards.filter((c) => !halfCardWords(c, docs).guard);
  return (
    <Detail id="half-cards" title="From the half: cards outside the hundred">
      <p>{countWord(shown.length)} share card{shown.length === 1 ? '' : 's'} draw the half pages’ findings in the Top 100 charts’ style, unnumbered: {and(shown.map((c) => CARD_TOPICS[c.slug]))}. Each reads its values from the half file it names; a card of records linked by name prints “Includes unverified half results” in its footer.{withdrawn.length ? ` A card is drawn only while its takeaway holds, so the card${withdrawn.length === 1 ? '' : 's'} on ${and(withdrawn.map((c) => CARD_TOPICS[c.slug]))} ${withdrawn.length === 1 ? 'is' : 'are'} withdrawn for now.` : ''}</p>
    </Detail>
  );
}

/**
 * A file name, tag or DOI with a line-break opportunity after each '-', '.', '/' and '_', so on a narrow phone it wraps
 * between its parts ("half-20261029-1133.sqlite.zst." / "part00") rather than one character from its end (200% zoom,
 * review, October 30, 2026).
 */
function breakable(text: string) {
  // Each part ends on its separator (no lookbehind: Safari before 16.4 cannot parse one, verify-browser-compat).
  const parts = text.match(/[^-./_]*[-./_]|[^-./_]+$/g) ?? [text];
  return parts.map((part, i) => <span key={i}>{i ? <wbr /> : null}{part}</span>);
}

/** Part 5 #downloads-half: the owner's public half releases (the sources) and the half pages' totals, with checksums. */
export function HalfDownloads() {
  const m = useHalf();
  if (!m) return null;
  const pin = halfPin();
  const releaseUrl = (tag: string) => `https://github.com/${pin.repository}/releases/tag/${tag}`;
  const assetUrl = (tag: string, name: string) => `https://github.com/${pin.repository}/releases/download/${tag}/${name}`;
  const doi = pin.half.doi.replace(/\.v(\d+)$/, '');
  const version = /\.v(\d+)$/.exec(pin.half.doi)?.[1];
  const sources: [string, string, string][] = [
    [pin.half.tag, Object.keys(pin.half.assets).find((a) => a.includes('.sqlite.zst.part'))!, 'the half-marathon results as one SQLite database, zstd-compressed'],
    [pin.links.tag, Object.keys(pin.links.assets).find((a) => a.includes('.sqlite.zst.part'))!, 'the links between half and marathon records, as a SQLite database'],
    [pin.links.tag, 'MATCHING_HALF.md', 'how the links are built, their confidence tiers and their audit'],
    [pin.links.tag, Object.keys(pin.links.assets).find((a) => a.endsWith('.tar.gz'))!, 'the scripts that built the links'],
  ];
  const digest = (tag: string, name: string) => (tag === pin.half.tag && pin.half.assets[name]) || pin.links.assets[name];
  return (
    <Detail id="downloads-half" title="The half-marathon files">
      <p>The half-marathon results and the links between records are the owner’s public releases, under {pin.license}, downloadable without an account or key. The pages read this snapshot and these links, with the verified status from the corrected edition metadata below:</p>
      <ul className="methods-files is-wrapped">
        {sources.map(([tag, name, what]) => <li key={name}><a href={assetUrl(tag, name)}>{breakable(name)}</a><span> · {what}, sha256 <code className="methods-sha">{digest(tag, name)}</code></span></li>)}
        <li><a href={assetUrl(pin.metadata_correction.tag, pin.metadata_correction.asset)}>{breakable(pin.metadata_correction.asset)}</a><span> · the corrected edition metadata the pages take verified status from, sha256 <code className="methods-sha">{pin.metadata_correction.sha256}</code></span></li>
      </ul>
      <p>The first {countWord(sources.length).toLowerCase()} files are in the release <a href={releaseUrl(pin.half.tag)}>{pin.half.tag}</a>, archived as <a data-long="" href={`https://doi.org/${pin.half.doi}`}>{breakable(`doi:${doi}`)}{version ? ` version ${version}` : ''}</a>, with its own README, comma-separated tables and SHA256SUMS. That version’s edition metadata overstated the verified editions; the release <a href={releaseUrl(pin.metadata_correction.tag)}>{pin.metadata_correction.tag}</a> supersedes it, and the pages use its corrected metadata only (its newer results are not in the pages yet). The page totals are:</p>
      <ul className="methods-files is-wrapped">
        {Object.entries(m.files).map(([file, meta]) => <li key={file}><a href={dataHref(`half/${file}`)}>{file.replace(/^tools\//, '')}</a><span> · {file === 'women.json' && !womenBandsPublished(readHalf('women.json')) ? 'women’s share of finishes in the same city’s half and marathon' : HALF_FILE_TOPICS[file] ?? 'totals'}, sha256 <code>{meta.sha256.slice(0, 12)}</code></span></li>)}
        <li><a href={dataHref('half/manifest.json')}>manifest.json</a><span> · the snapshot, link build, corrected metadata and policy behind them, and every file’s checksum</span></li>
      </ul>
    </Detail>
  );
}
