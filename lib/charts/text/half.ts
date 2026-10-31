/**
 * The words of the four unnumbered "From the half" cards (spec 3.5): a registry of their own, outside catalog.json and
 * the Top 100's CHART_TEXT, so CHART_COUNT stays 100 and the numbered series is untouched.
 *
 * Each card's guard is its page's nugget guard (the pure `…From` builders of lib/nuggets/half.ts) plus the card's own
 * checks, so a card never states what its page has fallen back from. Every number comes from the card's values in
 * public/data/half/cards.json, which verify-half holds equal to their sources. scripts/build-chart-cards.cjs --set half
 * draws the cards with the Top 100 ChartCard (scripts/half/card-images.cjs sets the kicker and the footer). A card of
 * records linked by name says so in its takeaway and prints the chip in its footer stamp line.
 */
import type { HalfCard, HalfCardSlug, HalfField, HalfLinked, HalfWomen } from '@/lib/half-types';
import { pct } from '@/lib/nuggets/format';
import { flagshipWindow, halfCitiesFrom, halfExtraFrom, halfFieldFrom, halfSexesFrom } from '@/lib/nuggets/half';
import { floorHM } from '@/lib/tools/half-to-full';
import { typo } from '../typo';

/** The family files a card's guard reads (its values come from the card itself). */
export type HalfDocs = { field: HalfField; women: HalfWomen; linked: HalfLinked };

/** The kicker every half card carries in place of "No. N of 100". */
export const HALF_CARD_KICKER = 'From the half';
/** The scope chip a linked card prints in its footer (the same words as ScopeTag, components/tools/EvidenceTag.tsx). */
export const HALF_CARD_CHIP = 'Includes unverified half results';

type V = Record<string, number | string>;
type Said = { guard: boolean; title: string; headline: string; titleFallback: string; fallback: string };

export type HalfCardText = {
  /** The kicker's right-hand side, as a Top 100 card names its theme. */
  theme: string;
  /** The page the footer names: the one that carries the finding (and its "Save the image" link). */
  page: '/half' | '/stories/half-to-full';
  /** Titles at most 47 characters; headlines with one *…* accent; fallbacks that assert no direction. */
  words: (v: V, d: HalfDocs) => Said;
};

const n = (x: number | string | undefined) => (typeof x === 'number' ? x : Number(x));
const fin = (...xs: number[]) => xs.every((x) => Number.isFinite(x));
const same = (a: number, b: number) => Number.isFinite(a) && a === b;

/** The words of the half cards, by slug. */
export const HALF_CARD_TEXT: Record<HalfCardSlug, HalfCardText> = {
  'half-under-2': {
    theme: 'Finish times',
    page: '/half',
    words: (v, d) => {
      const nugget = halfFieldFrom(d.field);
      const all = n(v.under_7200), women = n(v.women_under_7200), men = n(v.men_under_7200);
      const guard = nugget.guard && same(all, n(nugget.values.under_7200)) && same(women, n(nugget.values.women_under_7200))
        && same(men, n(nugget.values.men_under_7200)) && all > 0.5 && all < 0.6;
      return {
        guard,
        title: 'Just over half broke 2:00',
        // Each sex's own share under 2:00, named as one ("33% of recorded women's finishes"): after the colon, "recorded
        // women's 33%, men's 67%" read as a split of the finishes under 2:00, and the two add up to 100 (review, October
        // 30, 2026; women's finishes are 22% of those under 2:00). No colon after the time: "2:00: 33%" read at a glance
        // as 2:00:33 where the dek broke after "under" (post-merge review, round 3, October 31, 2026).
        headline: `*${pct(all)}* of half marathon finishes came in under 2:00, as did ${pct(women)} of recorded women's finishes and ${pct(men)} of men's.`,
        titleFallback: 'Half marathon finishes and 2:00',
        fallback: 'Half marathon finishes, under 2:00 and 2:00 or slower.',
      };
    },
  },
  'half-more-women': {
    theme: 'Who runs',
    page: '/half',
    words: (v, d) => {
      const nugget = halfCitiesFrom(d.women);
      const half = n(v.half_median), marathon = n(v.marathon_median);
      const guard = nugget.guard && same(half, n(nugget.values.half_median)) && same(marathon, n(nugget.values.marathon_median))
        && same(n(v.half_higher), n(v.pairs)) && half > marathon;
      return {
        guard,
        title: 'More women in the half, city by city',
        // Two medians across the pairs, worded as two (no one city and year has that pair), as the page's dek says them.
        headline: `In the same city and year, the half always had *more women*. Typical shares: ${pct(half)} of half finishes, ${pct(marathon)} of marathon finishes.`,
        titleFallback: 'Women in the half and the marathon, by city',
        fallback: "Women's share of half and marathon finishes in the same city and year.",
      };
    },
  },
  'half-double': {
    theme: 'Half to full',
    page: '/stories/half-to-full',
    words: (v, d) => {
      const nugget = halfExtraFrom(d.linked);
      const under = n(v.under_double), minutes = Math.round(n(v.extra_p50_s) / 60);
      const [from, to] = d.linked.set.window_days.map((days) => days / 7);
      // The figure on the story is this share only when its own guard holds (figure_is_share); so is the card's.
      const guard = nugget.guard && n(nugget.values.figure_is_share) === 1 && same(under, n(nugget.values.under_double))
        && minutes === n(nugget.values.extra_min) && under > 0 && under < 0.15 && Number.isInteger(from) && Number.isInteger(to);
      return {
        guard,
        title: `Double the half, plus ${minutes} minutes`,
        headline: `Of records linked by name, only *${Math.round(under * 100)} in 100* marathons came in under double the half ${from} to ${to} weeks before them.`,
        titleFallback: 'The marathon after a half',
        fallback: 'Marathons of records linked by name, against double the half before them.',
      };
    },
  },
  'half-same-half': {
    theme: 'Half to full',
    page: '/stories/half-to-full',
    words: (v, d) => {
      const nugget = halfSexesFrom(d.linked);
      const wf = flagshipWindow(d.linked, 'F'), wm = flagshipWindow(d.linked, 'M');
      const women = wf ? n(v[`F_${wf.h}`]) : NaN, men = wm ? n(v[`M_${wm.h}`]) : NaN;
      const guard = nugget.guard && !!wf && !!wm && wf.h === wm.h && same(women, wf.sus) && same(men, wm.sus)
        && wf.n >= 100 && wm.n >= 100 && fin(women, men) && women < men;
      return {
        guard,
        title: 'Same half, fewer sustained slowdowns for women',
        headline: `Of records linked by name with a half near ${wf ? floorHM(wf.h) : ''}, *${pct(women)}* of recorded women's marathons had a sustained slowdown, against ${pct(men)} of men's.`,
        titleFallback: 'Sustained slowdowns after the same half',
        fallback: "Sustained slowdowns in recorded women's and men's marathons after the same half.",
      };
    },
  },
};

export type HalfCardWords = {
  slug: HalfCardSlug;
  title: string;
  /** The takeaway with its one *…* accent (the guard holds), or the neutral fallback. */
  headline: string;
  /** The takeaway without the accent marks: the card's accessible name and its caption. */
  plain: string;
  fallback: string;
  guard: boolean;
  kicker: string;
  theme: string;
  page: HalfCardText['page'];
  /** The footer's chip (a card of records linked by name), or null. */
  chip: string | null;
};

/** A half card's words, rendered from its values and guarded by its page's nugget. */
export function halfCardWords(card: HalfCard, docs: HalfDocs): HalfCardWords {
  const text = HALF_CARD_TEXT[card.slug];
  if (!text) throw new Error(`No words registered for the half card ${card.slug}.`);
  const said = text.words(card.values, docs);
  const fallback = typo(said.fallback);
  const headline = said.guard ? typo(said.headline) : fallback;
  return {
    slug: card.slug, title: typo(said.guard ? said.title : said.titleFallback), headline, plain: headline.replace(/\*/g, ''), fallback,
    guard: said.guard, kicker: HALF_CARD_KICKER, theme: text.theme, page: text.page, chip: card.scope === 'linked' ? HALF_CARD_CHIP : null,
  };
}
