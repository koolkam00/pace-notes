import { LinkMark, LinkTier, SplitTierTag, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import { GUN_TIMING, LINK_CONFIDENCES, POSSIBLE_MATCH, SHOWN_TIERS, inline, type LinkConfidence, type ShownTier } from '@/lib/tiers';
import { Definition } from './shared';

/**
 * Two definitions of Part 2 (/methodology#edition-tiers and #link-confidence): what the label on an edition says, what
 * a counted edition is, what the confidence of a link between a runner's results says and what a possible match is.
 * Every tier and link label on the site links here (lib/tiers.ts TIER_ANCHOR and LINK_ANCHOR; lead decision D16,
 * November 14, 2026). The labels are drawn by the shared components, so this page shows them as every page does.
 *
 * Words only. The counts by tier and by confidence, the thresholds of the counted rule and the producer's notes on
 * single editions come from data files and join these definitions when those files are final; no number is typed here.
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

/** What each confidence says about a link, restated from the producer's rules. */
const LINK_MEANS: Record<LinkConfidence, string> = {
  high_elite: 'The runner has a finish time at elite level. Elite results are matched under rules of their own.',
  high: 'An uncommon name that the data holds for one person, with a birth year or a nationality on record.',
  medium: 'An uncommon name that the data holds for a few people, or a name with both a birth year and a nationality on record.',
  medium_variant: 'Two forms of one name joined as one person: a nickname, an added or dropped name, or another spelling of the same sounds.',
  low: 'A common name, or a name of a single word, without enough on record to tell its people apart.',
  low_noage: 'A result with no recorded age, attached to the one person of that name it fits.',
  low_noage_series: 'Results with no recorded age, joined only with results of the same name in other years of the same race.',
  low_nosex: 'A result with no recorded sex, attached to the one person of that name it fits.',
  low_city_pace: 'A result that fit more than one person of its name, placed with the one who raced in the same city at a similar pace.',
  low_carryover: 'A link from the producer’s earlier build that the current build did not make again, kept where the result still fits the person.',
};

export default function MethodsTiers() {
  const possible = inline(POSSIBLE_MATCH);
  return <>
    <Definition id="edition-tiers" term="Edition tiers"
      rule={<p>An edition is one race in one year. Each edition carries one label that says how far its recorded results were checked against an independent count of finishers, and up to two more that say what its times can show.</p>}
      instrument={<dl className="methods-badges">
        {SHOWN_TIERS.map((tier) => <div key={tier}><dt><TierTag tier={tier} link={false} /></dt><dd>{TIER_MEANS[tier]}</dd></div>)}
        <div><dt><SplitTierTag splitTier="finish_time_only" link={false} /></dt><dd>Fewer than half of the edition’s results have any checkpoint time, so it has finish times and no pacing.</dd></div>
        <div><dt><TimingClassTag timing={GUN_TIMING} link={false} /></dt><dd>The recorded times run from the starting gun, not from the moment each runner crossed the start line, so they include the wait to reach it.</dd></div>
      </dl>}>
      <p><strong>Counted editions.</strong> A pooled figure (a share, a median, a comparison between courses or between runners) uses an edition only when it is counted. A counted edition has checkpoint times; its results are verified, or lie close to an official count; its timing passes the screens; and no review has set it aside. Every other edition is listed with its label and supplies no pooled figure and no comparison between runners. The checks behind this are under <a href="#data-quality">which records are analyzed</a>.</p>
      <p>A runner’s own record keeps its own pacing in an edition that is not counted only because its results are unverified or are not close to the official count, where its checkpoint times pass the screens. It is shown with the edition’s label and compared with no one.</p>
      <p>The release also names editions for which it holds no results. They are not listed anywhere.</p>
    </Definition>

    <Definition id="link-confidence" term="Link confidence"
      rule={<p>Results from different races are joined into one runner by the producer’s person links, which compare the recorded name, sex and age. Each link carries a confidence: how much stands behind it. Every linked result shows its confidence.</p>}
      instrument={<dl className="methods-badges">
        <div><dt><LinkMark confidence="low" link={false} /></dt><dd>A link too weak to stand as the same runner: one of low confidence, one that joins two forms of a name, or one whose results disagree with each other. These results are listed apart from a runner’s other races and enter no figure. On Find a runner you can tick one into your own selection, as you can any race you recognize.</dd></div>
        {LINK_CONFIDENCES.map((confidence) => <div key={confidence}><dt><LinkTier confidence={confidence} /></dt><dd>{LINK_MEANS[confidence]}</dd></div>)}
      </dl>}>
      <p><strong>What joins a runner.</strong> A link of high or medium confidence joins its result to a runner, and the runner’s results are read together. The exception is a runner whose joined results disagree: recorded sexes that differ, recorded ages too far apart, or two results in the same edition. Every result of such a runner is shown as a {possible}, with the reason after its confidence.</p>
      <p>A confidence describes the evidence for a link. It is not a certainty: these are records linked by name, not verified people. How the links are checked is under <a href="#linking">how runners are linked</a>.</p>
    </Definition>
  </>;
}
