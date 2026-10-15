// The A/B tests the site is running. This file is data only: add, pause or remove an experiment here, and wrap the
// markup it changes in <Variant> (components/Experiment.tsx). The rules below are checked by verify-analytics, and the
// framework that assigns and reports a variant is lib/experiment-runtime.ts.

export type ExperimentDefinition = {
  key: string;                 // /^[a-z0-9]+(-[a-z0-9]+)*$/, 3–40 chars
  variants: readonly string[]; // 2–4, first is 'control', each /^[a-z0-9-]{1,24}$/
  weights?: readonly number[]; // integers summing to 100; default equal
  pages: readonly string[];    // analytics paths where exposure counts, e.g. ['/']
  status: 'running' | 'paused';// paused => everyone sees control, no $feature property
  started: string;             // YYYY-MM-DD
  hypothesis: string;          // one sentence, plain words
};

export const EXPERIMENTS: readonly ExperimentDefinition[] = [];
