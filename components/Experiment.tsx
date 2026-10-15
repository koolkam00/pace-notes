import type { ReactNode } from 'react';
import { EXPERIMENT_DEFINITIONS, experimentBootScript, experimentCss, experimentProblems } from '@/lib/experiment-runtime';

// The hook needs React state, so it lives in a client module; it is exported from here with the rest of the framework.
export { useVariant } from './ExperimentVariant';

/**
 * For the root layout's <head>: the CSS that shows only this tab's variant, and the script that picks it. The script is
 * a classic, parser-blocking inline script, so it always runs before the page is first painted: the parser stops at it
 * until the stylesheets before it have loaded (they block the first paint anyway) and builds no part of the body before
 * it has run. An async or module script can run after that paint on a slow phone, showing the control first. Next.js
 * puts its stylesheet links and its own (async) script tags at the top of <head>, ahead of this, so their downloads
 * have already started. With no experiment running there is no script at all.
 */
export function ExperimentHead() {
  const problems = experimentProblems(EXPERIMENT_DEFINITIONS);
  if (problems.length) throw new Error('lib/experiments.ts: ' + problems.join('; '));
  const script = experimentBootScript(EXPERIMENT_DEFINITIONS);
  return <>
    <style dangerouslySetInnerHTML={{ __html: experimentCss(EXPERIMENT_DEFINITIONS) }} />
    {script ? <script dangerouslySetInnerHTML={{ __html: script }} /> : null}
  </>;
}

/**
 * Markup for one variant of an experiment: `<Variant experiment="home-hero" show="control">…</Variant>` beside a
 * `show="short-dek"` sibling. Every variant is in the HTML; CSS shows the one this tab was given (display: contents, so
 * the wrapper adds no box). Use `as="span"` inside a paragraph.
 */
export function Variant({ experiment, show, as: Tag = 'div', children }: { experiment: string; show: string; as?: 'div' | 'span'; children?: ReactNode }) {
  return <Tag data-exp-show={`${experiment}:${show}`}>{children}</Tag>;
}
