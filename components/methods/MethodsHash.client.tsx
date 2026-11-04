'use client';
import { useEffect } from 'react';

/**
 * /methodology keeps every topic closed, so the page reads short. A link that lands on a topic, or on anything inside
 * one (#tools-pace-band, #definition-sensitivity, #slowdown-method), opens it and every closed row around it, then shows
 * it: on arrival, when the address's #id changes, and when a link to the #id already in the address is followed again.
 * Find in page opens closed rows by itself.
 *
 * A fold opens with an animation (`.fold` and `.values` grow their ::details-content from height 0, its content hidden
 * until the transition ends), and Chromium ignores scrollIntoView on anything inside a fold still drawn shut: a topic
 * two folds deep (#story-half-to-full, #tools-predictor) had been opened but left 1,100 to 5,500 px below the screen
 * after an in-site link (post-merge review, round 6, October 31, 2026; two animation frames alone, measured November 4,
 * 2026, were not enough, as the folds were still 0 px tall). So a fold opened here is marked `data-landing`, which
 * skips the animation (info.css, values.css), and the scroll waits two animation frames for it to be drawn open (the
 * first comes before that rendering, the second after it); the mark is then removed, so the reader's own toggles
 * animate. The scroll also comes after the router's own.
 */
export default function MethodsHash() {
  useEffect(() => {
    let frame = 0;
    const landing: HTMLDetailsElement[] = [];
    const settle = () => { for (const fold of landing.splice(0)) delete fold.dataset.landing; };
    const reveal = (scroll: boolean) => {
      let id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* keep it as written */ }
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      cancelAnimationFrame(frame);
      settle();
      for (let node: Element | null = target; node; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && !node.open) { node.dataset.landing = ''; node.open = true; landing.push(node); }
      }
      const show = () => { target.scrollIntoView({ block: 'start' }); settle(); };
      if (landing.length) frame = requestAnimationFrame(() => { frame = requestAnimationFrame(show); });
      else if (scroll) show();
    };
    reveal(false);
    const changed = () => reveal(true);
    const again = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link && link.getAttribute('href') === window.location.hash) requestAnimationFrame(() => reveal(true));
    };
    window.addEventListener('hashchange', changed);
    document.addEventListener('click', again);
    return () => {
      cancelAnimationFrame(frame);
      settle();
      window.removeEventListener('hashchange', changed);
      document.removeEventListener('click', again);
    };
  }, []);
  return null;
}
