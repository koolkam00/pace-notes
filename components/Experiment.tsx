import type { ReactNode } from 'react';
import { EXPERIMENTS } from '@/lib/experiments';
import { experimentBootScript, experimentCss, experimentProblems } from '@/lib/experiment-runtime';

// The hook needs React state, so it lives in a client module; it is exported from here with the rest of the framework.
export { useVariant } from './ExperimentVariant';

/**
 * For the root layout's <head>: the CSS that shows only this tab's variant, and the script that picks it. The script is
 * an async module script, like RELOAD_ON_FAILED_FILE in lib/chunk-reload.ts, so it runs as soon as it is parsed rather
 * than waiting for the stylesheets (and holding back the page's scripts); the page cannot paint before those
 * stylesheets arrive, so the right variant is the first one shown. A browser without module scripts sees the control.
 */
export function ExperimentHead() {
  const problems = experimentProblems(EXPERIMENTS);
  if (problems.length) throw new Error('lib/experiments.ts: ' + problems.join('; '));
  const script = experimentBootScript(EXPERIMENTS);
  return <>
    <style dangerouslySetInnerHTML={{ __html: experimentCss(EXPERIMENTS) }} />
    {script ? <script type="module" async dangerouslySetInnerHTML={{ __html: script }} /> : null}
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
