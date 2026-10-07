import ToolIcon from '@/components/tools/ToolIcon';
import RelatedToolLink, { type RelatedLinkPlan } from '@/components/tools/RelatedToolLink';
import { getInsightsManifest, readInsight } from '@/lib/insights-server';
import type { PaceBandIndex, ProjectorIndex, WeatherMatch } from '@/lib/tools/data';
import { courseSlug } from '@/lib/tools/links';
import { toolBySlug, toolHref } from '@/lib/tools/registry';

/** Analysis pages that have a matching runner tool, why a reader would open it, and which of the reader's choices travel with the link. */
const RELATED: Record<string, { tool: string; text: string; goal?: 'goal' | 'target' }> = {
  'pacing-pattern': { tool: 'pace-band', goal: 'goal', text: 'Turn a goal into a printable pace band, beside what finishes at that goal actually ran at every 5 km mat.' },
  'starting-pace': { tool: 'split-check', text: 'Type your own nine mat times to see your opening against your 5–20 km pace and whether you had a sustained slowdown.' },
  checkpoint: { tool: 'projector', goal: 'target', text: 'The race-day projector does this from any 5 km mat and on each course, with arrival windows for the next mats.' },
  'where-time-is-gained': { tool: 'pace-band', goal: 'goal', text: 'See the elapsed time at every mat for finishes that achieved your goal, split by whether they had a sustained slowdown.' },
  'course-comparison': { tool: 'course-chooser', text: 'Pick a goal pace and see how finishes that ran it from 5 to 20 km held up on each course.' },
  'race-day-weather': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'warming-and-pacing': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'wind-and-pacing': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'hills-and-pacing': { tool: 'pace-band', goal: 'goal', text: 'Choose a course to see the mat-by-mat times of finishes that achieved your goal there.' },
  'downhill-start': { tool: 'pace-band', text: 'Choose a course to see the mat-by-mat times of finishes that achieved your goal there.' },
  'finish-time-context': { tool: 'predictor', text: 'Estimate a marathon range from a recent race, with the published formulas and how they tend to run fast.' },
};

const scopeCache = new Map<string, string[] | null>();
/** Course slugs the tool publishes, read once at build time; null when the tool takes no course. */
function toolScopes(tool: string): string[] | null {
  if (scopeCache.has(tool)) return scopeCache.get(tool)!;
  const manifest = getInsightsManifest();
  let scopes: string[] | null = null;
  if (tool === 'pace-band' && manifest.files['tools/pace-band.json']) scopes = readInsight<PaceBandIndex>('tools/pace-band.json').scopes.map((s) => s.slug).filter((s) => s !== 'all');
  if (tool === 'projector' && manifest.files['tools/projector.json']) scopes = readInsight<ProjectorIndex>('tools/projector.json').scopes.map((s) => s.slug).filter((s) => s !== 'all');
  if (tool === 'weather-match' && manifest.files['tools/weather-match.json']) scopes = [...new Set(readInsight<WeatherMatch>('tools/weather-match.json').editions.map((e) => courseSlug(e.city)))];
  scopeCache.set(tool, scopes);
  return scopes;
}

export default function RelatedTool({ analysis }: { analysis: string }) {
  const related = RELATED[analysis];
  const tool = related && toolBySlug(related.tool);
  if (!tool) return null;
  const plan: RelatedLinkPlan = { base: toolHref(tool), scopes: toolScopes(tool.slug), goal: related.goal ?? null, emptyTime: tool.slug === 'projector' };
  return (
    <aside className="related-tool" aria-label="Related runner tool">
      <RelatedToolLink plan={plan} className="related-tool-card" style={{ ['--tool' as string]: tool.accent }}>
        <ToolIcon slug={tool.slug} className="related-tool-icon" />
        <span className="related-tool-text">
          <span className="related-tool-kicker">Runner tool</span>
          <strong>{tool.title}</strong>
          <span>{related.text}</span>
        </span>
        <span className="related-tool-go" aria-hidden="true">→</span>
      </RelatedToolLink>
    </aside>
  );
}
