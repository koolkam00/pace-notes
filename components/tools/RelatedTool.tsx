import { UnitLink as Link } from '@/components/UnitsProvider';
import ToolIcon from '@/components/tools/ToolIcon';
import { toolBySlug, toolHref } from '@/lib/tools/registry';

/** Analysis pages that have a matching runner tool, and why a reader would open it. */
const RELATED: Record<string, { tool: string; text: string }> = {
  'pacing-pattern': { tool: 'pace-band', text: 'Turn a goal into a printable pace band, beside what finishes at that goal actually ran at every 5 km mat.' },
  'starting-pace': { tool: 'split-check', text: 'Type your own nine mat times to see your opening against your 5–20 km pace and whether you had a sustained slowdown.' },
  checkpoint: { tool: 'projector', text: 'The race-day projector does this from any 5 km mat and on each course, with arrival windows for the next mats.' },
  'where-time-is-gained': { tool: 'pace-band', text: 'See the elapsed time at every mat for finishes that achieved your goal, split by whether they held pace.' },
  'course-comparison': { tool: 'course-chooser', text: 'Pick a goal pace and see how finishes that ran it through 20 km held up on each course.' },
  'race-day-weather': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'humidity-and-pacing': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'warming-and-pacing': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'wind-and-pacing': { tool: 'weather-match', text: 'Type a forecast start temperature and your pace to see past race mornings like it.' },
  'hills-and-pacing': { tool: 'pace-band', text: 'Choose a course to see the mat-by-mat times of finishes that achieved your goal there.' },
  'downhill-start': { tool: 'pace-band', text: 'Choose a course to see the mat-by-mat times of finishes that achieved your goal there.' },
  'finish-time-context': { tool: 'predictor', text: 'Estimate a marathon range from a recent race, with the published formulas and how they tend to run fast.' },
};

export default function RelatedTool({ analysis }: { analysis: string }) {
  const related = RELATED[analysis];
  const tool = related && toolBySlug(related.tool);
  if (!tool) return null;
  return (
    <aside className="related-tool" aria-label="Related runner tool">
      <Link href={toolHref(tool)} className="related-tool-card" style={{ ['--tool' as string]: tool.accent }}>
        <ToolIcon slug={tool.slug} className="related-tool-icon" />
        <span className="related-tool-text">
          <span className="related-tool-kicker">Runner tool</span>
          <strong>{tool.title}</strong>
          <span>{related.text}</span>
        </span>
        <span className="related-tool-go" aria-hidden="true">→</span>
      </Link>
    </aside>
  );
}
