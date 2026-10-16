import { copyEditions, type CopyEdition } from '@/lib/duplicate-editions';
import { getInsightsManifest } from '@/lib/insights-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getStudyEvidence } from '@/lib/research-data';
import { countWord } from '@/lib/stories';
import { TEN_ANALYSES } from '@/lib/ten-analyses';
import { count } from '@/lib/viz/format';

const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** "Chicago 2018 and 2019, whose records largely repeat the 2024 field": each city's copy editions with the field they repeat. */
function copiesPhrase(copies: CopyEdition[]): string {
  const groups = new Map<string, CopyEdition[]>();
  for (const copy of copies) groups.set(`${copy.city}|${copy.duplicate_of}`, [...(groups.get(`${copy.city}|${copy.duplicate_of}`) ?? []), copy]);
  return and([...groups.values()].map((group) => `${group[0].city} ${and(group.map((c) => String(c.year)))}, whose records largely repeat the ${group[0].duplicate_of} field`));
}

/**
 * The two finish totals the site uses, each with the pages that use it (home and /research). The stories, the data
 * tools and the course pages leave out the copy editions (lib/duplicate-editions.ts) and use the story manifest's
 * `analysis_n`; the ten analyses and the sustained-slowdown study keep them, in `eligible_records`. Every year and count
 * is read from the verified manifests at build time, and the build stops if the totals do not add up. Once a release
 * without copies is adopted the two totals are one, and the note says so.
 */
export default function CohortNote() {
  const manifest = getInsightsManifest();
  const copies = copyEditions();
  const all = manifest.eligible_records;
  const screened = manifest.analysis_n;
  if (getStudyEvidence()?.n !== all || getPersonalSummary()?.n !== all) throw new Error('The ten analyses and the sustained-slowdown study must use the story manifest’s eligible records.');
  if (all - copies.reduce((sum, c) => sum + c.eligible_removed, 0) !== screened) throw new Error('The screened total must be the eligible records less the copy editions.');
  if (!copies.length || all === screened) return <p className="cohort-note">Every page uses the same {count(all)} finishes.</p>;
  const ten = countWord(TEN_ANALYSES.length) ?? String(TEN_ANALYSES.length);
  return (
    <p className="cohort-note">
      The stories, tools and course pages use {count(screened)} finishes. The {ten} analyses and the sustained-slowdown study use {count(all)}, which still include {copiesPhrase(copies)}.
    </p>
  );
}
