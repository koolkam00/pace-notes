'use client';
import { useEffect } from 'react';

/**
 * /methodology keeps every topic closed, so the page reads short. A link that lands on a topic, or on anything inside
 * one (#tools-pace-band, #definition-sensitivity, #slowdown-method), opens it and every closed row around it, then shows
 * it: on arrival, when the address's #id changes, and when a link to the #id already in the address is followed again.
 * Find in page opens closed rows by itself.
 */
export default function MethodsHash() {
  useEffect(() => {
    const reveal = (scroll: boolean) => {
      let id = window.location.hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* keep it as written */ }
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      let opened = false;
      for (let node: Element | null = target; node; node = node.parentElement) {
        if (node instanceof HTMLDetailsElement && !node.open) { node.open = true; opened = true; }
      }
      if (opened || scroll) target.scrollIntoView({ block: 'start' });
    };
    reveal(false);
    const changed = () => reveal(true);
    const again = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (link && link.getAttribute('href') === window.location.hash) requestAnimationFrame(() => reveal(true));
    };
    window.addEventListener('hashchange', changed);
    document.addEventListener('click', again);
    return () => { window.removeEventListener('hashchange', changed); document.removeEventListener('click', again); };
  }, []);
  return null;
}
