'use client';

import { RefObject, useEffect, useState } from 'react';

/** Width of a container, tracked with ResizeObserver. Starts from `initial` for static rendering. */
export function useWidth<T extends HTMLElement>(ref: RefObject<T>, initial = 720): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    setWidth(Math.floor(node.getBoundingClientRect().width) || initial);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, initial]);
  return width;
}
