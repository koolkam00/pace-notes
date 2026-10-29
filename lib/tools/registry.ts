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
  /** The tool's one name: its H1, its row on /tools, the navigation, the chapters and the breadcrumbs. */
  title: string;
  /**
   * The search phrase ("Marathon race planner"): the tool's social card only. The page's <title> and description carry it
   * too, from the page's own metadata; the H1 is the title, the name every link to the tool uses.
   */
  heading?: string;
  /** The tool's line on /tools: what it does, in plain words, with no number (each tool's first screen has its reading). */
  short: string;
  /** The one-line purpose under the H1. */
  dek: string;
  group: ToolGroup;
  evidence: ToolEvidence[];
  /**
   * The tool's share-card accent (scripts/build-og-images.cjs, public/og/tools/<slug>.png). No page draws a per-tool hue
   * (the redesign spec, section 7.14); changing a value redraws that card.
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
  data: 'Observed from {finishes} screened marathon finishes: the eligible finishes, less the editions with start delays or shifted mats. Descriptive, never a personal probability.',
  research: 'Published models and studies, cited: shown as ranges where studies differ, or as one named method where a tool needs a single plan. Not fitted to Pace Notes data.',
  official: 'Transcribed from official race pages, with the date they were checked.',
};

export const TOOLS: ToolDefinition[] = [
  { slug: 'plan', title: 'Plan your race', heading: 'Marathon race planner', short: 'Splits and a pace band for your course and goal', group: 'race', evidence: ['data', 'research'], accent: '#1D3FD8', file: 'tools/course-goal.json',
    dek: 'Pick a course and a goal: your splits, your pace band, and how that pace held up there.' },
  { slug: 'pace-band', title: 'Pace band', heading: 'Marathon pace band', short: 'A wristband to print for your course and goal', group: 'race', evidence: ['data', 'research'], accent: '#FF5B2E', file: 'tools/pace-band.json',
    dek: 'A wristband to print with your course’s climbs and bridges or at even pace, beside the mat times of finishes near your goal.' },
  { slug: 'course-chooser', title: 'Course chooser', short: 'How your goal pace held up, course by course', group: 'race', evidence: ['data'], accent: '#0FA3A3', file: 'tools/course-goal.json',
    dek: 'How finishes on your goal pace held up, course by course.' },
  { slug: 'predictor', title: 'Finish-time predictor', heading: 'Marathon time predictor', short: 'A marathon range from a recent race', group: 'race', evidence: ['data', 'research'], accent: '#7A4DFF', file: 'tools/projector.json',
    dek: 'A marathon range from a recent race, and where finishes on that pace ended.' },
  { slug: 'weather-match', title: 'Weather match', short: 'Past race mornings like your forecast', group: 'race', evidence: ['data', 'research'], accent: '#F4B23E', file: 'tools/weather-match.json',
    dek: 'Past race mornings like your forecast, and how finishes at your pace held up.' },
  { slug: 'projector', title: 'Race-day projector', heading: 'Marathon race-day projector', short: 'A finish range from a tracker time at any mat', group: 'race', evidence: ['data'], accent: '#E2416B', file: 'tools/projector.json',
    dek: 'A tracker time from any mat, and where finishes on the same pace ended.' },
  { slug: 'split-check', title: 'Split check', heading: 'Marathon split check', short: 'Your race afterwards, read 5K by 5K', group: 'race', evidence: ['data'], accent: '#17A673', file: 'tools/pace-band.json',
    dek: 'Your nine mat times, read section by section, beside finishes at your time.' },
  { slug: 'pace-calculator', title: 'Pace calculator', heading: 'Running pace calculator', short: 'Pace, time and distance, with splits', group: 'reference', evidence: [], accent: '#2F5BFF',
    dek: 'Any two of pace, time and distance give the third, with splits to the mat.' },
  { slug: 'qualifying', title: 'Qualifying checker', heading: 'Marathon qualifying times checker', short: 'Your time against Boston, London and more', group: 'reference', evidence: ['official'], accent: '#15171C',
    dek: 'Your time against each race’s standard for your age.' },
];

export const toolHref = (tool: ToolDefinition | string) => `/tools/${typeof tool === 'string' ? tool : tool.slug}`;
export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
