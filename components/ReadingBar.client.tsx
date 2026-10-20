'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/** Reading speed (words a minute) and the time a figure takes to read, for "{n} min left". */
const WPM = 238;
const FIGURE_S = 12;

type Page = { marker?: string; short?: string; ticks: number[] };

/**
 * The reading bar (the redesign spec, sections 2.4 and 3.5), mounted by SiteHeader under its row: on a page whose root
 * carries data-reading (lib/chapters.ts readingAttrs), it takes the header's place while the header is away (scrolling
 * down, under 1180 px). Left, the chapter's marker and the page's short title; right, the minutes left; along the bottom
 * a 2 px line, ink up to the reading position, a signal dot at it and a tick at every beat ([data-beat]) start.
 *
 * Minutes left: the words of the beats still below the screen ÷ 238 (Values tables left out), plus 12 s for each figure
 * below it, rounded up, at least 1. Words, ticks and the line are measured in the browser after the page loads and again
 * whenever the page's height changes. Nothing is sent anywhere. Decorative
 * (aria-hidden): the page's headings say the same.
 */
export default function ReadingBar() {
  const path = usePathname();
  const bar = useRef<HTMLDivElement>(null), left = useRef<HTMLSpanElement>(null);
  const [page, setPage] = useState<Page | null>(null);
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('main[data-reading], main [data-reading]');
    if (!root) { setPage(null); return; }
    const marked = Array.from(root.querySelectorAll<HTMLElement>('[data-beat]'));
    // Words are counted again whenever the page's height changes (a Values table or a disclosure opened), so the
    // minutes left and the line always describe the same page. A chart's Values twin is reference, not reading: its
    // table never counts, even when a page opens it.
    const wordsIn = (el: HTMLElement) => (el.innerText.match(/\S+/g) || []).length;
    const count = () => (marked.length ? marked : [root]).map((el) => ({ el, words: wordsIn(el) - Array.from(el.querySelectorAll<HTMLElement>('details.values[open]')).reduce((n, v) => n + wordsIn(v), 0) }));
    let beats = count();
    const figures = beats.flatMap(({ el }) => Array.from(el.querySelectorAll('figure')));
    let frame = 0, settle = 0, top = 0, span = 1, live = true;
    // A beat that starts within the last screen of the page has no place on the line (it would sit on the bar's right
    // edge): its tick is left out, so ticks stop short of the end.
    const ticksOf = () => {
      const box = root.getBoundingClientRect();
      top = box.top + window.scrollY;
      span = Math.max(1, box.height - window.innerHeight);
      return marked.map((el) => Math.max(0, (el.getBoundingClientRect().top + window.scrollY - top) / span)).filter((t) => t < 0.99);
    };
    const update = () => {
      frame = 0;
      const el = bar.current, out = left.current;
      if (!el || !out) return;
      const p = Math.min(1, Math.max(0, (window.scrollY - top) / span));
      el.style.setProperty('--p', String(p));
      el.toggleAttribute('data-done', p > 0.995);
      const h = window.innerHeight;
      let words = 0;
      for (const { el: beat, words: n } of beats) {
        const r = beat.getBoundingClientRect();
        if (r.height) words += n * Math.min(1, Math.max(0, (r.bottom - h) / r.height));
      }
      const seconds = (words / WPM) * 60 + FIGURE_S * figures.filter((f) => f.getBoundingClientRect().top > h).length;
      const text = `${Math.max(1, Math.ceil(seconds / 60))} min left`;
      if (out.textContent !== text) out.textContent = text;
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const remeasure = () => { if (!live) return; beats = count(); setPage((was) => (was ? { ...was, ticks: ticksOf() } : was)); onScroll(); };
    setPage({ marker: root.dataset.marker, short: root.dataset.short, ticks: ticksOf() });
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', remeasure);
    document.fonts?.ready.then(remeasure);
    // Charts and the replay that load their data after the page grow the page: measure again when its height settles.
    const grown = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => { if (!settle) settle = requestAnimationFrame(() => { settle = 0; remeasure(); }); });
    grown?.observe(root);
    return () => {
      live = false;
      grown?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', remeasure);
      if (frame) cancelAnimationFrame(frame);
      if (settle) cancelAnimationFrame(settle);
    };
  }, [path]);
  if (!page) return null;
  return (
    <div ref={bar} className="reading-bar" aria-hidden="true">
      <div className="container reading-bar-row">
        <span className="reading-bar-place">{page.marker ? <span className="marker-badge">{page.marker}</span> : null}<span className="reading-bar-short">{page.short}</span></span>
        <span ref={left} className="reading-bar-left" />
      </div>
      <span className="reading-bar-line">
        {page.ticks.map((t, i) => <i key={i} style={{ left: `min(${(t * 100).toFixed(2)}%, 100% - 1px)` }} />)}
        <b className="reading-bar-fill" /><b className="reading-bar-dot" />
      </span>
    </div>
  );
}
