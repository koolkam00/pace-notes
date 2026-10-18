/**
 * The runner tools, in the order a marathoner meets them. /tools lists them in two groups: the tools for a race (plan,
 * race day, afterwards) and the reference tools (pace and qualifying lookups), one line each.
 */

/** Kinds of evidence that carry a badge. Plain calculations from the visitor's own inputs carry none. */
export type ToolEvidence = 'data' | 'research' | 'official';
/** The /tools group: a tool for one race, or a reference lookup. */
export type ToolGroup = 'race' | 'reference';

export interface ToolDefinition {
  slug: string;
  /** Short name for the list, navigation and breadcrumbs. */
  title: string;
  /** The page's H1 when it should say more than the short title. */
  heading?: string;
  /** The tool's line on /tools. */
  short: string;
  /** The one-line purpose under the H1. */
  dek: string;
  group: ToolGroup;
  evidence: ToolEvidence[];
  /**
   * @deprecated No tool draws a per-tool hue any more (the redesign spec, section 7.14). Kept only because
   * components/course/CoursePlan.tsx (WP5) still reads it; remove both together.
   */
  accent: string;
  /** The index file in public/data/insights that must be in the verified manifest, if any. */
  file?: string;
}

export const EVIDENCE_LABEL: Record<ToolEvidence, string> = {
  data: 'Pace Notes data',
  research: 'Published research',
  official: 'Official standards',
};

/**
 * What each kind of evidence is, for the methodology page (/methodology#evidence); the tools show only the badge.
 * `{finishes}` is the tool cohort, filled from the published data where the text is shown (never typed here).
 */
export const EVIDENCE_TEXT: Record<ToolEvidence, string> = {
  data: 'Observed from {finishes} screened marathon finishes with all nine 5 km checkpoints. Descriptive, never a personal probability.',
  research: 'Published models and studies, cited. Not fitted to Pace Notes data.',
  official: 'Transcribed from official race pages, with the date they were checked.',
};

export const TOOLS: ToolDefinition[] = [
  { slug: 'plan', title: 'Race planner', heading: 'Marathon race planner', short: 'Course, goal and pace band', group: 'race', evidence: ['data'], accent: '#1D3FD8', file: 'tools/course-goal.json',
    dek: 'Pick a course and a goal: your splits, your pace band, and how that pace held up there.' },
  { slug: 'pace-band', title: 'Pace band', heading: 'Marathon pace band', short: 'A wristband for your goal', group: 'race', evidence: ['data'], accent: '#FF5B2E', file: 'tools/pace-band.json',
    dek: 'An even-pace wristband to print, beside the mat times of finishes that made your goal.' },
  { slug: 'course-chooser', title: 'Course chooser', short: 'Your goal pace, every course', group: 'race', evidence: ['data'], accent: '#0FA3A3', file: 'tools/course-goal.json',
    dek: 'How finishes on your goal pace held up on every course.' },
  { slug: 'predictor', title: 'Finish-time predictor', heading: 'Marathon time predictor', short: 'From a recent race', group: 'race', evidence: ['data', 'research'], accent: '#7A4DFF', file: 'tools/projector.json',
    dek: 'A marathon range from a recent race, and where finishes on that pace ended.' },
  { slug: 'weather-match', title: 'Weather match', short: 'Mornings like your forecast', group: 'race', evidence: ['data', 'research'], accent: '#F4B23E', file: 'tools/weather-match.json',
    dek: 'Past race mornings like your forecast, and how finishes at your pace held up.' },
  { slug: 'projector', title: 'Race-day projector', heading: 'Marathon race-day projector', short: 'A finish range from any mat', group: 'race', evidence: ['data'], accent: '#E2416B', file: 'tools/projector.json',
    dek: 'A tracker time from any mat, and where finishes on the same pace ended.' },
  { slug: 'split-check', title: 'Split check', heading: 'Marathon split check', short: 'Read your race afterwards', group: 'race', evidence: ['data', 'research'], accent: '#17A673', file: 'tools/pace-band.json',
    dek: 'Your nine mat times, read section by section, beside finishes at your time.' },
  { slug: 'pace-calculator', title: 'Pace calculator', heading: 'Running pace calculator', short: 'Pace, time and splits', group: 'reference', evidence: [], accent: '#2F5BFF',
    dek: 'Any two of pace, time and distance give the third, with splits to the mat.' },
  { slug: 'qualifying', title: 'Qualifying checker', heading: 'Marathon qualifying times checker', short: 'Boston, New York, London and more', group: 'reference', evidence: ['official'], accent: '#15171C',
    dek: 'Your time against each race’s standard for your age.' },
];

export const toolHref = (tool: ToolDefinition | string) => `/tools/${typeof tool === 'string' ? tool : tool.slug}`;
export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
