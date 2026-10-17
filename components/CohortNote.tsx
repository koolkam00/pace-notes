import { copyEditions, type CopyEdition } from '@/lib/duplicate-editions';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import { getPersonalSummary } from '@/lib/personalized-data';
import { getStudyEvidence } from '@/lib/research-data';
import { capital, countWord } from '@/lib/stories';
import { TEN_ANALYSES } from '@/lib/ten-analyses';
import { EVIDENCE_LABEL, TOOLS, type ToolDefinition } from '@/lib/tools/registry';
import { count } from '@/lib/viz/format';

const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const lower = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** "Chicago 2018 and 2019, whose records largely repeat the 2024 field": each city's copy editions with the field they repeat. */
function copiesPhrase(copies: CopyEdition[]): string {
  const groups = new Map<string, CopyEdition[]>();
  for (const copy of copies) groups.set(`${copy.city}|${copy.duplicate_of}`, [...(groups.get(`${copy.city}|${copy.duplicate_of}`) ?? []), copy]);
  return and([...groups.values()].map((group) => `${group[0].city} ${and(group.map((c) => String(c.year)))}, whose records largely repeat the ${group[0].duplicate_of} field`));
}

/**
 * The tools /tools shows (the rule app/tools/page.tsx and lib/seo-routes.ts use), split by their badges: those with
 * Pace Notes data, and the rest (plain calculations from the visitor's own inputs, published research, official
 * standards). The build stops unless every data tool's index file starts from the story manifest's `analysis_n`.
 */
function toolsByEvidence() {
  const manifest = getInsightsManifest();
  const shown = TOOLS.filter((tool) => !tool.file || manifest.files[tool.file]);
  const data = shown.filter((tool) => tool.evidence.includes('data'));
  for (const tool of data) {
    if (!tool.file) throw new Error(`The ${tool.slug} tool has a ${EVIDENCE_LABEL.data} badge but no data file in lib/tools/registry.ts.`);
    if (readInsight<{ analysis_n?: number }>(tool.file).analysis_n !== manifest.analysis_n) throw new Error(`${tool.file} (the ${tool.slug} tool) must start from the story manifest's analysis_n.`);
  }
  return { data, other: shown.filter((tool) => !tool.evidence.includes('data')) };
}

/** What starts from the screened total: the stories, the course pages and "the seven tools that use Pace Notes data". */
function screenedList(data: ToolDefinition[]): string[] {
  const tools = `the ${countWord(data.length) ?? data.length} ${data.length === 1 ? 'tool that uses' : 'tools that use'} ${EVIDENCE_LABEL.data}`;
  return ['the stories', 'the course pages', ...(data.length ? [tools] : [])];
}

/**
 * "the stories, the course pages and the seven tools that use Pace Notes data", the list the note opens with, for any
 * page that names what starts from the screened finishes (verify-tools checks it). Tools without that badge are not in it.
 */
export const screenedPages = () => and(screenedList(toolsByEvidence().data));

/** "The pace calculator uses only your own inputs. The qualifying checker uses official standards.", from their badges. */
function otherToolsSentence(other: ToolDefinition[]): string | null {
  if (!other.length) return null;
  const from = (tool: ToolDefinition) => (tool.evidence.length ? and(tool.evidence.map((kind) => lower(EVIDENCE_LABEL[kind]))) : 'only your own inputs');
  return other.map((tool) => `The ${lower(tool.title)} uses ${from(tool)}.`).join(' ');
}

/**
 * The build-time checks behind the two finish totals, with what the note needs. The home page and /research call this
 * although they no longer show the note (methods and sources are only on /methodology since October 16, 2026), so the
 * build still stops when the totals do not add up or a data tool's file starts from another total.
 */
export function assertCohortTotals() {
  const manifest = getInsightsManifest();
  const copies = copyEditions();
  const all = manifest.eligible_records;
  const screened = manifest.analysis_n;
  if (getStudyEvidence()?.n !== all || getPersonalSummary()?.n !== all) throw new Error('The ten analyses and the sustained-slowdown study must use the story manifest’s eligible records.');
  if (all - copies.reduce((sum, c) => sum + c.eligible_removed, 0) !== screened) throw new Error('The screened total must be the eligible records less the copy editions.');
  return { copies, all, screened, ...toolsByEvidence() };
}

/**
 * The two finish totals the site starts from, each with the pages that start from it (for /methodology). The stories,
 * the course pages and the tools with a Pace Notes data badge leave out the copy editions (lib/duplicate-editions.ts) and
 * start from the story manifest's `analysis_n` (the tools then apply their own screens, and each prints the total it
 * uses); the ten analyses and the sustained-slowdown study keep them, in `eligible_records`. The tools without that badge
 * start from no finishes, and the note says what each uses instead, from its badges. Every year, count and tool is read
 * from the verified manifests and lib/tools/registry.ts at build time, and the build stops if the totals do not add up or
 * a data tool's file starts from another total. Once a release without copies is adopted the two totals are one, and the
 * note says so.
 */
export default function CohortNote() {
  const { copies, all, screened, data, other } = assertCohortTotals();
  const ten = countWord(TEN_ANALYSES.length) ?? String(TEN_ANALYSES.length);
  const others = otherToolsSentence(other);
  if (!copies.length || all === screened) {
    const every = and([...screenedList(data), `the ${ten} analyses`, 'the sustained-slowdown study']);
    return <p className="cohort-note">{capital(every)} start from the same {count(all)} finishes.{others ? ` ${others}` : ''}</p>;
  }
  return (
    <p className="cohort-note">
      {capital(and(screenedList(data)))} start from {count(screened)} finishes. The {ten} analyses and the sustained-slowdown study use {count(all)}, which still include {copiesPhrase(copies)}.{others ? ` ${others}` : ''}
    </p>
  );
}
