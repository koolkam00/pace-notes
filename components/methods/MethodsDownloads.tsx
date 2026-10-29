import release from '@/analysis/release.json';
import Arrow from '@/components/ui/Arrow';
import { sourceReleaseHref } from '@/lib/data-source';
import { getExtensions } from '@/lib/extension-data';
import { getInsightsManifest } from '@/lib/insights-server';
import { STORIES, storyPublished } from '@/lib/stories';
import { TOOLS } from '@/lib/tools/registry';
import { Detail, Part, dataHref } from './shared';

/** What each story's downloadable summary file holds. Every one is an aggregate; none holds a runner name or a single runner's record. */
export const STORY_FILE_TOPICS: Record<string, string> = {
  'archetypes.json': 'pacing-type shares',
  'finish-times.json': 'finish-time distributions',
  'replay.json': 'race replay snapshots of how fields spread out',
  'positions.json': 'place changes after 20K',
  'kick.json': 'final-stretch pace',
  'demographics.json': 'pacing by recorded gender and age group',
  'courses.json': 'course pacing profiles, with race-morning weather as context',
};

const RELEASES = 'https://github.com/koolkam00/pace-notes/releases';
const SOURCE = 'https://github.com/koolkam00/pace-notes';
/**
 * The race records on Figshare. The DOI without a version resolves to the newest version there, which need not be the
 * release the site uses (version 2 is 0829, never adopted; 1652 is not there), so the row does not call it the current
 * release; analysis/ACCESS.md gives the versioned DOI of the adopted one.
 */
const FIGSHARE = 'https://doi.org/10.6084/m9.figshare.33965155';
/** How to open the full records of the adopted release (rewritten at every adoption: docs/OPERATIONS.md). */
const ACCESS = 'https://github.com/koolkam00/pace-notes/blob/main/analysis/ACCESS.md';
/** The terrain splits' file and the audited route-profile corrections it is built from (the registry lives in the source, not in public/data). */
const TERRAIN_FILE = 'tools/course-terrain.json';
const CORRECTIONS = 'https://github.com/koolkam00/pace-notes/blob/main/analysis/course_terrain/corrections.json';

/** A file, or a set of files, as one link row: its name, what it holds, and where it goes. */
function FileRow({ href, name, what }: { href: string; name: string; what: string }) {
  return <a className="methods-file" href={href}>
    <span className="methods-file-name">{name}</span>
    <span className="methods-file-what">{what}</span>
    <Arrow dir="up-right" className="methods-file-go" />
  </a>;
}

/** A list of files inside a group: the file's name, then what it holds. */
function Files({ files }: { files: { href: string; name: string; what?: string }[] }) {
  return <ul className="methods-files">{files.map((f) => <li key={f.href}><a href={f.href}>{f.name}</a>{f.what ? <span> · {f.what}</span> : null}</li>)}</ul>;
}

/**
 * Part 5: every public file behind the site (AGENTS.md: the records, the exports and every analysis output, free to
 * download without an account). The research packs that the archive pages showed until October 17, 2026 are listed
 * here (#archive): /packs and /packs/<id> redirect to #downloads. Under the four rows (the Figshare copy joined them on
 * October 22, 2026), one line says what kind of file each is and links to analysis/ACCESS.md for opening the full
 * records, so the release's packaging (parts, checksums, formats) is written once, there, and no sentence here goes
 * stale when it changes.
 */
export default function MethodsDownloads() {
  const manifest = getInsightsManifest();
  const sourceHref = sourceReleaseHref(release.tag);
  // The marathon stories' files: a half story's aggregates are listed under #downloads-half, never as insights files.
  const storyFiles = [...new Set(STORIES.filter((story) => story.source !== 'half' && storyPublished(story)).map((story) => story.file))];
  const toolFiles = [...new Set(TOOLS.filter((tool) => tool.file && manifest.files[tool.file]).map((tool) => tool.file as string))];
  const terrainFiles = manifest.files[TERRAIN_FILE] ? [
    { href: dataHref(`insights/${TERRAIN_FILE}`), name: 'course-terrain.json', what: `${TOOLS.filter((tool) => tool.slug === 'plan' || tool.slug === 'pace-band').map((tool) => tool.title).join(', ')}: the terrain splits, with each checked course’s corrected route` },
    { href: CORRECTIONS, name: 'corrections.json', what: 'the audited route-profile corrections behind them, with their sources and licences' },
  ] : [];
  const packs = getExtensions().slice().sort((a, b) => a.title.localeCompare(b.title));
  return <Part id="downloads" n={5} short="Downloads" title="Downloads" lead="Every file is public. No account, no key.">
    <div className="methods-file-rows">
      <FileRow href={sourceHref} name="Full race records" what="Every record in the current release, recorded names included" />
      <FileRow href={FIGSHARE} name="On Figshare" what="Exports of the race records, each version with its own DOI, under a CC BY 4.0 licence" />
      <FileRow href={RELEASES} name="Every data release" what="Each export, with its checksums" />
      <FileRow href={SOURCE} name="Source code" what="The site and every calculation behind it" />
    </div>
    <p className="methods-part-note">The full race records are large archives for data tools: <a href={ACCESS}>how to open them</a> gives the steps and checksums for the current release. Every other file below is a JSON or CSV summary.</p>

    <Detail id="downloads-stories" title="The stories’ data">
      <Files files={[
        ...storyFiles.map((file) => ({ href: dataHref(`insights/${file}`), name: file, what: STORY_FILE_TOPICS[file] })),
        { href: dataHref('insights/course-geometry.json'), name: 'course-geometry.json', what: 'the courses’ supplied route files' },
        { href: dataHref('insights/manifest.json'), name: 'manifest.json', what: 'the release, the cohort and every file’s checksum' },
      ]} />
      <p>The race replay also has one file per race in <code>/data/insights/replay/</code>.</p>
    </Detail>

    <Detail id="downloads-analyses" title="The analyses’ data">
      <Files files={[
        { href: dataHref('study/evidence.json'), name: 'Sustained-slowdown study', what: 'results, methods and source checksums' },
        { href: dataHref('fast-start/all-finishers.json'), name: 'Fast starts, all eligible finishes', what: 'every opening group and what followed' },
        { href: dataHref('fast-start/evidence.json'), name: 'Fast starts, the earlier-result comparison', what: 'openings against an earlier best' },
        { href: dataHref('all-finisher-context/evidence.json'), name: 'Courses, race-day weather and downhill starts', what: 'calculation data and methods' },
        { href: dataHref('weather/evidence.json'), name: 'Weather questions', what: 'all three screening results and edition values' },
        { href: dataHref('packs/ext_personalized_guide/pack_meta.json'), name: 'Personalized analyses', what: 'coverage, provenance and calculation details' },
      ]} />
    </Detail>

    {toolFiles.length + terrainFiles.length > 0 && <Detail id="downloads-tools" title="The tools’ data">
      <Files files={[
        ...toolFiles.map((file) => ({ href: dataHref(`insights/${file}`), name: file.replace(/^tools\//, ''), what: TOOLS.filter((tool) => tool.file === file).map((tool) => tool.title).join(', ') })),
        ...terrainFiles,
      ]} />
    </Detail>}

    {packs.length > 0 && <Detail id="archive" title="The research packs’ data">
      <p>The {packs.length} earlier research questions, each with its method and the tables behind its charts. Their methods are under <a href="#question-methods">Research questions</a>.</p>
      <ul className="methods-packs">{packs.map((pack) => <li key={pack.id}>
        <span className="methods-pack-title">{pack.title}</span>
        <span className="methods-links">{pack.answer.sources.filter((source) => source.href.includes('/data/packs/')).map((source) => <a key={source.href} href={source.href}>{source.label.replace(/ \((JSON|CSV)\)$/, '')}</a>)}</span>
      </li>)}</ul>
    </Detail>}

    <p className="methods-part-note">Every file except the full race records is an aggregate, and each one states its own cohort, screens and method.</p>
  </Part>;
}
