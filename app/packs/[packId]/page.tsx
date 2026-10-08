import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PACK_IDS, getPackInfo } from '@/lib/packs';
import { getExtraAnswer } from '@/lib/research-data';
import ResearchQuestion from '@/components/ResearchQuestion';
import { QUESTIONS } from '@/lib/question-catalog';
import { getExtensions } from '@/lib/extension-data';
import { broaderArchive } from '@/lib/broader-analysis-catalog';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import FastStartAnalysis from '@/components/FastStartAnalysis';
import { getFastStartStarts } from '@/lib/fast-start-server';
import { DEFAULT_UNITS, distanceLabel, unitText } from '@/lib/units';
import { packCanonical } from '@/lib/seo-routes';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';

const routes = [...new Set([...PACK_IDS, ...QUESTIONS.map(question => question.id), ...getExtensions().map(pack => pack.id)])];

// ---------- Search metadata ----------

const BRAND = ' | Pace Notes';
const MAX_TITLE = 60;
const MAX_DESCRIPTION = 155;
const miles = (text: string) => unitText(text, DEFAULT_UNITS);
const mi = (km: number) => distanceLabel(km, DEFAULT_UNITS, 1);

/**
 * Search titles for pages whose own question runs past 60 characters, targets a search phrase, or is worded
 * causally or as a time translation the page says it does not give (r12, r16, r24, r33).
 * Metadata only: each page keeps its question as the heading.
 */
const SEO_TITLES: Record<string, string> = {
  r30_negative_split_success: 'Marathon Negative Splits and Improved Finishes | Pace Notes',
  r03_accel_vs_decel_20k: `Pace Trend at ${mi(20)} and the Marathon Finish | Pace Notes`,
  r17_milestone_kick: 'Finishing Speed Near a Marathon Time Milestone | Pace Notes',
  r32_where_pbs_are_gained: 'Where Do Runners Gain Time for a Personal Best? | Pace Notes',
  p4_even_effort_gap: 'Does Pacing Change After Course Adjustment? | Pace Notes',
  r12_fastest_by_ability: 'Same Runners on Different Marathon Courses | Pace Notes',
  r24_interval_after_pb: 'Time Between Marathons and the Next Finish | Pace Notes',
  r16_groups_hold_or_fall: 'Running in a Group During a Marathon | Pace Notes',
  r33_start_congestion: 'Crowded Marathon Starts and Later Pace | Pace Notes',
};

/**
 * Search descriptions written for a page when its own text does not suit one: the first sentence runs past
 * 155 characters, leans on the question, or counts runners rather than finishes. Thresholds stay in the data;
 * the only figures here are mat distances, converted from the metric definitions.
 */
const SEO_DESCRIPTIONS: Record<string, string> = {
  r30_negative_split_success: `How often marathon finishes improved on an earlier benchmark, by split pattern: a faster second 20 km (${mi(20)}), even 20 km blocks or slowing.`,
  r03_accel_vs_decel_20k: `At the same 20 km (${mi(20)}) time, how did marathon finishes that were speeding up, steady or slowing go on to finish? Matched comparisons from 5 km splits.`,
  r07_wall_clock_vs_distance: 'Do marathon slowdowns line up with distance covered or with time on the clock? Compare where the first slow section ended with the elapsed time there.',
  r09_bad_patch_recoverable: `How often marathon finishes regained their rhythm in the next 5 km (${mi(5)}) after a first bad patch, and how that varied with where the patch came.`,
  r14_knowing_course: 'A matched Boston comparison of late-race slowing for finishes with and without an earlier recorded Boston finish. An association, not proof of a benefit.',
  r17_milestone_kick: `How much marathon finishes sped up in the final section when a round finish time was within reach at 40 km (${mi(40)}), just ahead of it or just behind.`,
  r18_bq_rule_changes: 'How marathon finishes near a qualifying standard compared before and after a rule change, where city samples were large enough. A narrow comparison.',
  r19_near_miss_return: 'Whether finishing just over a round marathon target, rather than just under it, goes with appearing again in recorded results in the following years.',
  r21_learn_from_blowup: 'How late-race slowing differs with the number of earlier recorded marathon finishes. Age, course choice and who keeps racing are not separated.',
  r25_huge_kick_next: 'After a marathon with a strong finishing section, how often was the next recorded race a clear improvement? Compared with similar or slower finishes.',
  s10_goal_slips: `How often marathon finishes near a round target at 20 km (${mi(20)}) still broke it after first slipping behind its even-pace budget, by checkpoint.`,
};

/** The heading the page shows (in miles, the default unit). */
const pageTitle = (id: string) => miles(broaderArchive(id)?.title || getExtraAnswer(id).title);

/** `text | Pace Notes` when it fits in 60 characters, the bare text when only that fits, otherwise null. */
const fitTitle = (text: string) => (text + BRAND).length <= MAX_TITLE ? text + BRAND : text.length <= MAX_TITLE ? text : null;

/** Cut at a word boundary so the text plus an ellipsis fits in `max` characters. */
const shorten = (text: string, max: number) => text.length <= max ? text : text.slice(0, max - 1).replace(/[\s,;:]+\S*$/, '') + '…';

/** Whole sentences of the page's own description (or answer), in miles, up to 155 characters. */
function ownDescription(id: string): string {
  if (SEO_DESCRIPTIONS[id]) {
    if (SEO_DESCRIPTIONS[id].length > MAX_DESCRIPTION) throw new Error(`The written description of /packs/${id} is over 155 characters.`);
    return SEO_DESCRIPTIONS[id];
  }
  const source = miles(broaderArchive(id)?.description || getExtraAnswer(id).answer).trim();
  let text = '';
  for (const sentence of source.split(/(?<=[.!?])\s+(?=[A-Z0-9“"(])/)) {
    const next = text ? `${text} ${sentence}` : sentence;
    if (next.length > MAX_DESCRIPTION) break;
    text = next;
  }
  // No whole sentence fits: describe the page by its question instead of cutting a sentence short.
  return text || `${pageTitle(id)} An answer from recorded marathon 5 km splits in the Pace Notes research archive.`;
}

/** Short archive code for an alternate address: S9, RN3, P1 from the pack registry, or "Extension". */
const aliasTag = (id: string) => id.startsWith('ext_') ? 'Extension' : getPackInfo(id)?.title.split(' — ')[0] ?? id;

type PackSeo = { title: string; description: string; canonical: string | null; heading: string };
let seoCache: Map<string, PackSeo> | null = null;

/**
 * Titles and descriptions for every pack page, unique across the archive. Primary and thin pages use their
 * own question; the alternate addresses (aliases) canonicalise to their primary page and are described as such,
 * with the archive code added where their heading repeats another page's.
 */
function packSeo(): Map<string, PackSeo> {
  if (seoCache) return seoCache;
  const map = new Map<string, PackSeo>();
  const used = new Set<string>();
  const ids = routes.filter(id => id !== 'smyth_htw');
  const own = (id: string) => {
    const heading = pageTitle(id);
    const title = SEO_TITLES[id] ?? fitTitle(heading);
    if (!title) throw new Error(`The title of /packs/${id} is over 60 characters; add one to SEO_TITLES.`);
    return { title, heading };
  };
  for (const id of ids.filter(id => packCanonical(id) === id || packCanonical(id) === null)) {
    const { title, heading } = own(id);
    if (used.has(title)) throw new Error(`Two archive pages share the title "${title}".`);
    map.set(id, { title, description: ownDescription(id), canonical: packCanonical(id), heading });
    used.add(title);
  }
  for (const id of ids.filter(id => !map.has(id))) {
    const primary = map.get(packCanonical(id)!)!;
    const primaryName = primary.title.replace(BRAND, '');
    const heading = pageTitle(id);
    const plain = fitTitle(heading);
    const tag = ` (${aliasTag(id)})`;
    const tagged = fitTitle(heading + tag) ?? fitTitle(primaryName + tag) ?? fitTitle(shorten(heading, MAX_TITLE - tag.length) + tag);
    const title = plain && !used.has(plain) ? plain : tagged;
    if (!title || used.has(title)) throw new Error(`No unique title for /packs/${id}.`);
    used.add(title);
    map.set(id, { title, heading, canonical: packCanonical(id), description: `Alternate address (${aliasTag(id)}) for “${primaryName}” in the Pace Notes marathon pacing research archive.` });
  }
  seoCache = map;
  return map;
}

export function generateMetadata({ params }: { params: { packId: string } }) {
  const seo = packSeo().get(params.packId);
  if (!seo) return { title: 'Research question not found | Pace Notes', robots: { index: false, follow: true } };
  const path = `/packs/${params.packId}`;
  // Primary pages are their own canonical; alternate addresses point at their primary; thin pages are noindex.
  const policy = seo.canonical === null ? { noindex: true } : seo.canonical === params.packId ? {} : { canonicalPath: `/packs/${seo.canonical}` };
  return pageMetadata({ title: seo.title, description: seo.description, path, ...policy });
}

export default function Page({ params }: { params: { packId: string } }) {
  if (!routes.includes(params.packId)) notFound();
  const seo = packSeo().get(params.packId);
  // The crumb is the search title without the brand (as Open Graph shows it), so it carries the SEO_TITLES rewording.
  const crumbs = seo && seo.canonical === params.packId ? <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Research archive', '/packs'], [seo.title.replace(BRAND, '')]])} /> : null;
  return <>{crumbs}{packBody(params.packId)}</>;
}

function packBody(packId: string) {
  const broader = broaderArchive(packId);
  if (broader) {
    const history = <ResearchQuestion question={getExtraAnswer(packId)} standalone headingLevel={broader.kind === 'opening' ? 2 : undefined} />;
    if (broader.kind === 'opening') return <><FastStartAnalysis starts={getFastStartStarts()} defaultOpening={broader.opening} title={broader.title} description={broader.description} archive /><details className="methodology"><summary>Original comparison with earlier recorded results</summary><p>This original archive analysis needs an earlier result. Its definitions and smaller cohort differ from the single-race view above.</p>{history}</details></>;
    return <AllFinisherAnalysis kind={broader.kind} start={getAllFinisherContextStart(broader.kind)} title={broader.title} description={broader.description} archive history={history} />;
  }
  return <><ResearchQuestion question={getExtraAnswer(packId)} standalone /><p><Link href="/">All research questions</Link></p></>;
}
// The dedicated compatibility page owns this path in the static export.
export function generateStaticParams() { return routes.filter(packId => packId !== 'smyth_htw').map(packId => ({ packId })); }
