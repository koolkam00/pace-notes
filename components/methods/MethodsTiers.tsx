import fs from 'node:fs';
import path from 'node:path';
import release from '@/analysis/release.json';
import identity from '@/analysis/identity.json';
import { LinkLabel, LinkMark, LinkTier, SplitTierTag, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import { getCohortManifest } from '@/lib/insights-server';
import { raceFiles, type RaceNote } from '@/lib/nuggets/core';
import {
  FINISH_TIMES_ONLY, GUN_TIMING, LINK_CONFIDENCES, POSSIBLE_MATCH, POSSIBLE_MATCHES, SCREEN_WORDS, SHOWN_TIERS, TIER_WORDS, inline, isShownTier,
  type LinkConfidence, type ShownTier,
} from '@/lib/tiers';
import { countWord } from '@/lib/nuggets/format';
import { Definition, and, n } from './shared';

/**
 * Two definitions of Part 2 (/methodology#edition-tiers and #link-confidence): what the label on an edition says, what
 * a counted edition is, what the confidence of a link between a runner's results says and what a possible match is.
 * Every tier and link label on the site links here (lib/tiers.ts TIER_ANCHOR and LINK_ANCHOR; lead decision D16,
 * November 14, 2026). The labels are drawn by the shared components, so this page shows them as every page does.
 *
 * No number is typed here (November 19, 2026, the counts joined the words): editions and results by tier, split tier
 * and timing, the counted and not-counted editions, the three readings of the sustained-slowdown share and the
 * producer's notes come from the race list's summary (lib/nuggets/core.ts raceFiles); results by link confidence, by
 * status and by screen from analysis/identity.json; the runners with counted marathons from the cohort manifest's
 * `linkage`; the search's profiles from the runner lookup's manifest. scripts/verify-tiers.cjs renders this section
 * and recounts every number in it from those files. The stamp's own tolerance stays in words (ruling b).
 * Each meaning below restates the release's own definition (its data card and readme for the tiers; its person-link
 * documents and build code for the confidences), and the edition policy for what counted means.
 */

/** What each tier's label says about an edition, in the order the labels are listed everywhere. */
const TIER_MEANS: Record<ShownTier, string> = {
  stamped: 'The recorded results match an independent official count of finishers, and the winner was checked.',
  stamped_weaker_source: 'The same check, against a count that was probably built from the same timing file as the results. Such a count is less independent, so the label always says so.',
  partial: 'The producer has an official count for the edition and the recorded results do not match it. Most often part of the field is missing.',
  unverified: 'No independent count of finishers has been checked. The results are shown as their source published them.',
  held_for_review: 'The producer is holding the edition until an open question about its results is settled. It carries no verified badge.',
};

/**
 * What each confidence says about a link, restated from the producer's rules, from the strongest down. The record's
 * keys are every confidence (a new one fails the type check until it has a meaning).
 */
const LINK_MEANS: Record<LinkConfidence, string> = {
  high: 'An uncommon name that the data holds for one person, with a birth year or a nationality on record.',
  high_elite: 'The runner has a finish time at elite level. Elite results are matched under rules of their own.',
  medium: 'An uncommon name that the data holds for a few people, or a name with both a birth year and a nationality on record.',
  medium_variant: 'Two forms of one name joined as one person: a nickname, an added or dropped name, or another spelling of the same sounds.',
  low: 'A common name, or a name of a single word, without enough on record to tell its people apart.',
  low_noage: 'A result with no recorded age, attached to the one person of that name it fits.',
  low_noage_series: 'Results with no recorded age, joined only with results of the same name in other years of the same race.',
  low_nosex: 'A result with no recorded sex, attached to the one person of that name it fits.',
  low_city_pace: 'A result that fit more than one person of its name, placed with the one who raced in the same city at a similar pace.',
  low_carryover: 'A link from the producer’s earlier build that the current build did not make again, kept where the result still fits the person.',
};


/**
 * Why an edition is not counted, as a list item reads after its count: the edition policy's categories (the race
 * summary's `not_counted_by_category`). A new category stops the build until it has words.
 */
const CATEGORY_WORDS: Record<string, string> = {
  finish_time_only: `with ${inline(FINISH_TIMES_ONLY)}`,
  unverified: `${inline(TIER_WORDS.unverified)} with checkpoint times`,
  held_for_review: inline(TIER_WORDS.held_for_review),
  invalid_split_grid: 'whose checkpoint times fail the timing screens',
  partial_coverage: 'whose results are not close to the official count',
  unreconciled_hold: 'whose results the producer has not matched with the official count',
  selected_field: 'that hold a selected field, such as the first finishers only',
  mixed_distance_list: 'whose list mixes distances',
  incomplete_ingestion: 'whose results were only partly read',
};

const pct = (value: number) => `${value.toFixed(1)}%`;
type Distances = { marathon: number; half: number };
type LookupCounts = { profiles: number; profiles_by_kind: { one_result: number; confirmed_only: number; confirmed_and_possible: number; possible_only: number } };
type Linkage = { runners_with_a_counted_record: number; runners_with_two_or_more_counted_records: number; high_links: { runners_with_a_counted_record: number; runners_with_two_or_more_counted_records: number } };

/** Every count the two definitions print, read from the verified files (the build stops if they are not the adopted release's). */
export function tierCounts() {
  const { summary } = raceFiles();
  const cohort = getCohortManifest().manifest as ReturnType<typeof getCohortManifest>['manifest'] & { linkage: Linkage };
  const lookup = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/runners/manifest.json'), 'utf8')) as { schema_version: number; release_tag: string; counts: LookupCounts };
  if (identity.release_tag !== release.tag || lookup.release_tag !== release.tag || lookup.schema_version !== 2) throw new Error('The edition-tier and link counts must come from the adopted release.');
  for (const tier of Object.keys(summary.editions.by_tier)) if (!isShownTier(tier)) throw new Error(`The race summary counts editions of the tier ${tier}, which no page shows.`);
  for (const category of Object.keys(summary.editions.not_counted_by_category)) if (!CATEGORY_WORDS[category]) throw new Error(`lib: the edition policy's category ${category} has no words on /methodology#edition-tiers.`);
  return { summary, linkage: cohort.linkage, lookup: lookup.counts, identity: identity.counts };
}

/** "London 2015: London re-pull on hold (source 403)", with the edition's tier, as a list of the producer's notes. */
function Notes({ notes }: { notes: RaceNote[] }) {
  return <ul>{notes.map((note) => <li key={`${note.label}|${note.year}`}><span>{note.label} {note.year}</span> <TierTag tier={note.tier} link={false} /> <q>{note.note}</q></li>)}</ul>;
}

export default function MethodsTiers() {
  const possible = inline(POSSIBLE_MATCH);
  const { summary, linkage, lookup, identity: links } = tierCounts();
  const { editions, counted, sensitivity, notes } = summary;
  const tiers = SHOWN_TIERS.filter((tier) => editions.by_tier[tier]);
  const finishOnly = editions.by_split_tier.finish_time_only;
  const gun = editions.by_timing[GUN_TIMING];
  const notCounted = Object.entries(editions.not_counted_by_category).sort(([, a], [, b]) => b - a);
  const notCountedTotal = notCounted.reduce((sum, [, count]) => sum + count, 0);
  if (notCountedTotal + counted.editions !== editions.total.n) throw new Error('The counted and not-counted editions do not add up to every edition.');
  const verified = sensitivity.verified_tiers_only, strong = sensitivity.without_weaker_source_editions;
  const status = (key: 'keyed' | 'possible_match' | 'unlinked' | 'left_out'): Distances => ({ marathon: links.by_status.marathon[key], half: links.by_status.half[key] });
  const keyed = status('keyed'), possibleCount = status('possible_match');
  const tierOf = (distance: 'marathon' | 'half', key: string) => (links.by_link_tier[distance] as Record<string, number>)[key];
  const screens = (Object.keys(SCREEN_WORDS) as (keyof typeof SCREEN_WORDS)[]).map((screen) => ({ words: SCREEN_WORDS[screen], ...links.screens[screen] }));
  const failing = screens.filter((screen) => screen.results > 0), passing = screens.filter((screen) => screen.results === 0);
  const kinds = lookup.profiles_by_kind;
  return <>
    <Definition id="edition-tiers" term="Edition tiers"
      rule={<p>An edition is one race in one year. Each edition carries one label that says how far its recorded results were checked against an independent count of finishers, and up to two more that say what its times can show.</p>}
      instrument={<dl className="methods-badges">
        {SHOWN_TIERS.map((tier) => <div key={tier}><dt><TierTag tier={tier} link={false} /></dt><dd>{TIER_MEANS[tier]}</dd></div>)}
        <div><dt><SplitTierTag splitTier="finish_time_only" link={false} /></dt><dd>Fewer than half of the edition’s results have any checkpoint time, so it has finish times and no pacing.</dd></div>
        <div><dt><TimingClassTag timing={GUN_TIMING} link={false} /></dt><dd>The recorded times run from the starting gun, not from the moment each runner crossed the start line, so they include the wait to reach it.</dd></div>
      </dl>}>
      <p><strong>Counted editions.</strong> A pooled figure (a share, a median, a comparison between courses or between runners) uses an edition only when it is counted. A counted edition has checkpoint times; its results are verified, or lie close to an official count; its timing passes the screens; and no review has set it aside. Every other edition is listed with its label and supplies no pooled figure and no comparison between runners. The checks behind this are under <a href="#data-quality">which records are analyzed</a>.</p>
      <p>Where an edition is not counted only because its results are unverified, or are not close to the official count, a runner’s own record can still show its own pacing if its checkpoint times pass the screens. It is shown with the edition’s label and compared with no one.</p>
      <div className="table-wrap" role="region" tabIndex={0} aria-labelledby="edition-tiers-caption">
        <table className="table">
          <caption id="edition-tiers-caption">Marathon editions by label</caption>
          <thead><tr><th scope="col" className="is-text">Label</th><th scope="col">Editions</th><th scope="col">Races</th><th scope="col">Results</th></tr></thead>
          <tbody>
            {tiers.map((tier) => <tr key={tier}><th scope="row" className="is-text"><TierTag tier={tier} link={false} /></th><td>{n(editions.by_tier[tier].editions)}</td><td>{n(editions.by_tier[tier].races)}</td><td>{n(editions.by_tier[tier].results)}</td></tr>)}
            <tr><th scope="row" className="is-text"><SplitTierTag splitTier="finish_time_only" link={false} /></th><td>{n(finishOnly.editions)}</td><td>{n(finishOnly.races)}</td><td>{n(finishOnly.results)}</td></tr>
            <tr><th scope="row" className="is-text"><TimingClassTag timing={GUN_TIMING} link={false} /></th><td>{n(gun.editions)}</td><td>{n(gun.races)}</td><td>{n(gun.results)}</td></tr>
          </tbody>
        </table>
      </div>
      <p>Every edition has one of the first {countWord(tiers.length)} labels; the last two can join it, so their rows overlap the others. A race counts once in each row it has an edition in.</p>
      <p><strong>In this release</strong>, {n(counted.editions)} editions of {n(counted.races)} races are counted, with {n(counted.finishes)} finishes. The other {n(notCountedTotal)} editions are not counted: {and(notCounted.map(([category, count]) => `${n(count)} ${CATEGORY_WORDS[category]}`))}. Of those, {n(editions.by_use.own_record.editions)} still show a runner’s own record.</p>
      <p>The <a href="#sustained-slowdown">sustained-slowdown</a> share of the counted finishes is {pct(counted.sustained_slowdown_pct)}. Without the {n(counted.editions - verified.editions)} editions with {inline(TIER_WORDS.partial)}, it is {pct(verified.sustained_slowdown_pct)} of {n(verified.finishes)} finishes in {n(verified.editions)} editions; without the {n(counted.editions - strong.editions)} editions labelled “{TIER_WORDS.stamped_weaker_source}”, {pct(strong.sustained_slowdown_pct)} of {n(strong.finishes)} finishes in {n(strong.editions)} editions.</p>
      <p>The release also names {n(editions.without_results.n)} editions for which it holds no results. They are not listed anywhere.</p>
      <details className="fold is-sub"><summary><span className="fold-title">The producer’s notes on single editions</span><span className="fold-glyph" aria-hidden="true" /></summary>
        <div className="fold-body">
          <p>Quoted as the release gives them. Editions the producer is waiting to read again:</p>
          <Notes notes={notes.hold} />
          <p>Notes on how an edition’s results were recovered or trimmed:</p>
          <Notes notes={notes.release} />
        </div>
      </details>
    </Definition>

    <Definition id="link-confidence" term="Link confidence"
      rule={<p>Results from different races are joined into one runner by the producer’s person links, which compare the recorded name, sex and age. Each link carries a confidence: how much stands behind it. Every linked result shows its confidence.</p>}
      instrument={<dl className="methods-badges">
        <div><dt><LinkMark confidence="low" link={false} /></dt><dd>A link too weak to stand as the same runner: one of low confidence, one that joins two forms of a name, or one whose results disagree with each other. These results are listed apart from a runner’s other races and enter no figure. On Find a runner you can tick one into your own selection, as you can any race you recognize.</dd></div>
        {/* Each confidence as a page shows it: its quiet words, and the pill before them where the link joins no runner. */}
        {(Object.keys(LINK_MEANS) as LinkConfidence[]).map((confidence) => <div key={confidence}><dt><LinkLabel confidence={confidence} link={false} /></dt><dd>{LINK_MEANS[confidence]}</dd></div>)}
      </dl>}>
      <p><strong>What joins a runner.</strong> A link of high or medium confidence joins its result to a runner, and the runner’s results are read together. The exception is a runner whose joined results disagree: recorded sexes that differ, recorded ages too far apart, or two results in the same edition. Every result of such a runner is shown as a {possible}, with the reason after its confidence.</p>
      <p>A confidence describes the evidence for a link. It is not a certainty: these are records linked by name, not verified people. How the links are checked is under <a href="#linking">how runners are linked</a>.</p>
      <div className="table-wrap" role="region" tabIndex={0} aria-labelledby="link-confidence-caption">
        <table className="table">
          <caption id="link-confidence-caption">Results by the confidence of their link</caption>
          <thead><tr><th scope="col" className="is-text">Confidence</th><th scope="col">Marathon results</th><th scope="col">Half-marathon results</th></tr></thead>
          <tbody>
            {LINK_CONFIDENCES.map((confidence) => <tr key={confidence}><th scope="row" className="is-text"><LinkTier confidence={confidence} /></th><td>{n(tierOf('marathon', confidence))}</td><td>{n(tierOf('half', confidence))}</td></tr>)}
            <tr><th scope="row" className="is-text">No link</th><td>{n(tierOf('marathon', 'unlinked'))}</td><td>{n(tierOf('half', 'unlinked'))}</td></tr>
          </tbody>
        </table>
      </div>
      <p>{n(keyed.marathon)} marathon and {n(keyed.half)} half-marathon results join a runner. {n(possibleCount.marathon)} and {n(possibleCount.half)} are shown as a {possible}. {n(status('left_out').marathon)} and {n(status('left_out').half)} fail the release’s own row checks and are not shown; the table counts them under their link, as it counts every row of the release.</p>
      <p>Runners whose joined results disagree, by screen: {and(failing.map((screen) => `${screen.words}, ${n(screen.persons)} runners with ${n(screen.results)} results`))}{passing.length ? `; none where ${passing.map((screen) => screen.words).join(' or ')}` : ''}.</p>
      <p>{n(linkage.runners_with_a_counted_record)} runners have a counted marathon finish, and {n(linkage.runners_with_two_or_more_counted_records)} have two or more. On links of high confidence alone, {n(linkage.high_links.runners_with_a_counted_record)} and {n(linkage.high_links.runners_with_two_or_more_counted_records)}.</p>
      <p>Find a runner holds {n(lookup.profiles)} profiles: {n(kinds.one_result)} of a single result, {n(kinds.confirmed_only)} of joined results only, {n(kinds.confirmed_and_possible)} with {inline(POSSIBLE_MATCHES)} beside joined results and {n(kinds.possible_only)} of {inline(POSSIBLE_MATCHES)} only.</p>
    </Definition>
  </>;
}
