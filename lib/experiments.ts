// The A/B tests the site is running. This file is data only: add, pause or remove an experiment here, and wrap the
// markup it changes in <Variant> (components/Experiment.tsx). The autopilot guard reads it without running it, so it
// holds exactly one `export const EXPERIMENTS = [ ... ] as const;` of literal entries and nothing else: no imports,
// types, spreads, expressions or later changes. Comments, either kind of quote and trailing commas are fine.
//
// Each entry:
//   key         lower-case words joined by single hyphens, 3–40 characters, unique
//   status      'running' or 'paused' (paused: everyone sees the control, and no event names the experiment)
//   pages       where exposure counts: analytics paths such as '/' or '/tools', or ['*'] for every page
//   area        optional: the part of those pages it changes, a lower-case hyphenated slug ('hero'); omitted means the
//               whole page (so does '*'). Two running experiments may share a page only in different areas.
//   variants    2–4 names, the first 'control', each 1–24 lower-case letters, digits or hyphens
//   weights     optional: one positive whole number per variant, summing to 100 (default: equal shares)
//   started     the day it started, YYYY-MM-DD
//   hypothesis  one sentence in plain words
// At most two experiments run at once. The type, the checks (verify-analytics runs them, and so does the build) and
// the code that assigns and reports a variant are the framework, lib/experiment-runtime.ts.
//
// For example:
//   { key: 'home-hero', status: 'running', pages: ['/'], area: 'hero', variants: ['control', 'short-dek'],
//     started: '2026-10-19', hypothesis: 'A shorter first line gets more phone visitors to the first chapter.' },

export const EXPERIMENTS = [
  // The home hero: today's (control), or a marathon-time box and three ways in on the first phone screen.
  { key: 'home-hero-v1', status: 'running', pages: ['/'], area: 'hero', variants: ['control', 'make-it-yours'],
    started: '2026-10-16', hypothesis: 'Visitors who land on the home page reach a personal answer more often when the first phone screen offers their own marathon time as the way in.' },
] as const;
