import { analyticsPath } from './analytics-policy';
import { EXPERIMENTS, type ExperimentDefinition } from './experiments';

// The experiments framework: self-assigned variants on a static export, with no feature-flag request and no flash of the
// wrong version. A small script in the root layout's <head> (experimentBootScript, rendered by components/Experiment.tsx)
// gives this browser tab one variant of each running experiment, keeps it in sessionStorage and names it on <html>, so
// the CSS from experimentCss shows only that variant's markup before the page is painted. Analytics then adds the
// variant to every event in the tab ($feature/<key>, lib/analytics.ts), and the event allowlist keeps it only for a
// running experiment and one of its variants. lib/experiments.ts holds the registry; this file does not change with it.

/** This tab's variant of an experiment, in sessionStorage. It holds the variant's name and nothing else. */
export const EXPERIMENT_STORAGE_PREFIX = 'pace-notes-exp:';
/** The <html> attribute that names this tab's variant: set only when the variant is kept in sessionStorage. */
export const experimentAttribute = (key: string) => 'data-exp-' + key;

const running = (defs: readonly ExperimentDefinition[]) => defs.filter(def => def.status === 'running');

/**
 * The registry's problems, as sentences (none means valid): keys, variants, weights, pages, status, start date and
 * hypothesis, and at most three experiments running at once. The build and verify-analytics both refuse a bad registry.
 */
export function experimentProblems(defs: readonly ExperimentDefinition[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const def of defs) {
    const name = `Experiment ${JSON.stringify(def.key)}`;
    if (typeof def.key !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(def.key) || def.key.length < 3 || def.key.length > 40) problems.push(`${name}: the key must be 3–40 lowercase letters, digits and single hyphens`);
    if (keys.has(def.key)) problems.push(`${name}: the key is used twice`);
    keys.add(def.key);
    const variants = Array.isArray(def.variants) ? def.variants : [];
    if (variants.length < 2 || variants.length > 4) problems.push(`${name}: it needs 2–4 variants`);
    if (variants[0] !== 'control') problems.push(`${name}: the first variant must be 'control'`);
    if (variants.some(variant => typeof variant !== 'string' || !/^[a-z0-9-]{1,24}$/.test(variant))) problems.push(`${name}: each variant must be 1–24 lowercase letters, digits or hyphens`);
    if (new Set(variants).size !== variants.length) problems.push(`${name}: a variant is listed twice`);
    if (def.weights !== undefined) {
      const weights = Array.isArray(def.weights) ? def.weights : [];
      if (weights.length !== variants.length || weights.some(weight => !Number.isInteger(weight) || weight < 1) || weights.reduce((sum, weight) => sum + weight, 0) !== 100) problems.push(`${name}: weights must be one positive integer per variant, summing to 100`);
    }
    const pages = Array.isArray(def.pages) ? def.pages : [];
    if (!pages.length) problems.push(`${name}: it must name the pages where it is shown`);
    for (const page of pages) if (typeof page !== 'string' || page === '/other' || analyticsPath(page) !== page) problems.push(`${name}: ${JSON.stringify(page)} is not a page analytics keeps under its own path`);
    if (def.status !== 'running' && def.status !== 'paused') problems.push(`${name}: the status must be 'running' or 'paused'`);
    const date = typeof def.started === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(def.started) ? new Date(def.started + 'T00:00:00Z') : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== def.started) problems.push(`${name}: 'started' must be a real date written YYYY-MM-DD`);
    if (typeof def.hypothesis !== 'string' || !/^[^\n]{10,240}[.?]$/.test(def.hypothesis.trim())) problems.push(`${name}: the hypothesis must be one sentence of 10–240 characters`);
  }
  if (running(defs).length > 3) problems.push('At most three experiments may run at once');
  return problems;
}

/**
 * The inline <head> script: for each running experiment, the variant kept in this tab's sessionStorage, or a weighted
 * random pick that is then kept there, named on <html>. Where sessionStorage cannot be read or written the tab sees the
 * control and no variant is named, so it is not reported either. It reads nothing but sessionStorage and sends nothing.
 * Empty when no experiment is running. Old-style JavaScript, because Next.js does not compile it.
 */
export function experimentBootScript(defs: readonly ExperimentDefinition[] = EXPERIMENTS): string {
  const list = running(defs).map(def => {
    const weights = def.weights ?? def.variants.map(() => 100 / def.variants.length);
    let total = 0;
    return { k: def.key, v: def.variants, c: weights.map(weight => (total += weight)) };
  });
  if (!list.length) return '';
  return `(function () {
  var list = ${JSON.stringify(list).replace(/</g, '\\u003c')};
  for (var i = 0; i < list.length; i++) {
    var e = list[i], v;
    try {
      v = sessionStorage.getItem('${EXPERIMENT_STORAGE_PREFIX}' + e.k);
      if (e.v.indexOf(v) < 0) {
        var r = Math.random() * 100;
        for (var j = 0; j < e.v.length; j++) { v = e.v[j]; if (r < e.c[j]) break; }
        sessionStorage.setItem('${EXPERIMENT_STORAGE_PREFIX}' + e.k, v);
      }
    } catch (x) {
      continue;
    }
    document.documentElement.setAttribute('data-exp-' + e.k, v);
  }
})();`;
}

/**
 * Markup wrapped for a variant (data-exp-show="<key>:<variant>") is hidden unless <html> names that variant; the
 * control shows otherwise, so without JavaScript, with storage blocked, for a paused experiment and for one no longer in
 * the registry, only the control is on the page.
 */
export function experimentCss(defs: readonly ExperimentDefinition[] = EXPERIMENTS): string {
  let css = '[data-exp-show]{display:none}[data-exp-show$=":control"]{display:contents}';
  for (const { key, variants } of running(defs)) {
    for (const variant of variants.slice(1)) {
      const active = `html[${experimentAttribute(key)}="${variant}"]`;
      css += `${active} [data-exp-show="${key}:control"]{display:none}${active} [data-exp-show="${key}:${variant}"]{display:contents}`;
    }
  }
  return css;
}

/** This tab's variant of each running experiment, as named on <html> (so only those kept in sessionStorage). */
export function activeVariants(defs: readonly ExperimentDefinition[] = EXPERIMENTS): Record<string, string> {
  const active: Record<string, string> = {};
  if (typeof document === 'undefined') return active;
  for (const { key, variants } of running(defs)) {
    const value = document.documentElement.getAttribute(experimentAttribute(key));
    if (value && variants.includes(value)) active[key] = value;
  }
  return active;
}
