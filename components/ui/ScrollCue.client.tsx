'use client';
import { useEffect } from 'react';

/**
 * Marks a Values disclosure with data-overflow="true" while its table is wider than its scroll region, so the "Scroll"
 * cue shows only when there is more to see. Renders nothing.
 */
export default function ScrollCue({ target }: { target: string }) {
  useEffect(() => {
    const details = document.getElementById(target);
    const wrap = details?.querySelector<HTMLElement>('.table-wrap');
    if (!details || !wrap) return;
    const update = () => {
      const more = wrap.scrollWidth > wrap.clientWidth + 2 && wrap.scrollLeft + wrap.clientWidth < wrap.scrollWidth - 2;
      details.setAttribute('data-overflow', String(more));
    };
    update();
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    ro?.observe(wrap);
    wrap.addEventListener('scroll', update, { passive: true });
    details.addEventListener('toggle', update);
    return () => { ro?.disconnect(); wrap.removeEventListener('scroll', update); details.removeEventListener('toggle', update); };
  }, [target]);
  return null;
}
