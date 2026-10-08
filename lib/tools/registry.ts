/** The runner tools, in the order a marathoner meets them: plan, race day, afterwards, qualifying. */

/** Kinds of evidence that carry a badge. Plain calculations from the visitor's own inputs carry none. */
export type ToolEvidence = 'data' | 'research' | 'official';
export type ToolGroup = 'Plan' | 'Race day' | 'Afterwards' | 'Qualify';

export interface ToolDefinition {
  slug: string;
  title: string;
  short: string;
  dek: string;
  group: ToolGroup;
  evidence: ToolEvidence[];
  accent: string;
  /** The index file in public/data/insights that must be in the verified manifest, if any. */
  file?: string;
}

export const EVIDENCE_LABEL: Record<ToolEvidence, string> = {
  data: 'Pace Notes data',
  research: 'Published research',
  official: 'Official standards',
};

export const EVIDENCE_TEXT: Record<ToolEvidence, string> = {
  data: 'Observed from 3.26 million screened marathon finishes with all nine 5 km checkpoints. Descriptive, never a personal probability.',
  research: 'Published models and studies, cited. Not fitted to Pace Notes data.',
  official: 'Transcribed from official race pages, with the date they were checked.',
};

export const TOOLS: ToolDefinition[] = [
  { slug: 'pace-calculator', title: 'Pace calculator', short: 'Pace, time and splits', group: 'Plan', evidence: [], accent: '#2F5BFF',
    dek: 'Solve any two of pace, time and distance. Splits every 400 m, quarter mile, kilometre, mile or timing mat, a printable pace chart, and what your watch will say if it reads long.' },
  { slug: 'predictor', title: 'Finish-time predictor', short: 'From a recent race', group: 'Plan', evidence: ['research', 'data'], accent: '#7A4DFF', file: 'tools/projector.json',
    dek: 'A marathon range from a recent race, with the classic formulas, the evidence that they run fast, and what happened to real finishes on that pace at 20 km.' },
  { slug: 'pace-band', title: 'Pace band', short: 'Wristband for your goal', group: 'Plan', evidence: ['data'], accent: '#FF5B2E', file: 'tools/pace-band.json',
    dek: 'A printable even-pace band, next to what finishes that actually hit your goal on your course ran at every 5 km mat, split by whether they held pace.' },
  { slug: 'course-chooser', title: 'Course chooser', short: 'Your goal pace, every course', group: 'Plan', evidence: ['data'], accent: '#0FA3A3', file: 'tools/course-goal.json',
    dek: 'For your goal, how finishes that ran its pace from 5 to 20 km held up on each course, with race month, morning temperatures and route profile.' },
  { slug: 'weather-match', title: 'Weather match', short: 'Mornings like your forecast', group: 'Plan', evidence: ['data', 'research'], accent: '#F4B23E', file: 'tools/weather-match.json',
    dek: 'Past marathons that started at your forecast temperature, and how finishes at your pace held up there, beside published heat guidance.' },
  { slug: 'projector', title: 'Race-day projector', short: 'Finish range from any 5 km mat', group: 'Race day', evidence: ['data'], accent: '#E2416B', file: 'tools/projector.json',
    dek: 'Type a time from the tracker at any 5 km mat. See the finish range and the next mats’ arrival windows from what similar finishes actually ran, not a constant-pace guess.' },
  { slug: 'split-check', title: 'Split check', short: 'Read your race afterwards', group: 'Afterwards', evidence: ['data', 'research'], accent: '#17A673', file: 'tools/pace-band.json',
    dek: 'Paste your nine mat times. See your section paces, whether you had a sustained slowdown, your pacing type and how you compare with finishes at your time.' },
  { slug: 'qualifying', title: 'Qualifying checker', short: 'Boston, NYC, London and more', group: 'Qualify', evidence: ['official'], accent: '#15171C',
    dek: 'Check a time against Boston (with the downhill index and every past cut-off), New York, London, Chicago, Berlin and Sydney, each with its own age rule.' },
];

export const toolHref = (tool: ToolDefinition | string) => `/tools/${typeof tool === 'string' ? tool : tool.slug}`;
export const toolBySlug = (slug: string) => TOOLS.find((t) => t.slug === slug);
