'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shareable tool state in the URL query (alongside the site's `units` parameter).
 * Reads once after mount (static export: no server query), then mirrors changes with history.replaceState.
 * A value equal to its default is left out of the URL; a cleared value whose default is not empty is written as
 * `key=` so a reload or shared link stays cleared instead of showing the example again.
 * The fourth element lists the keys the visitor's URL supplied, so a tool can tell a linked 4:00 from the example 4:00.
 * Never put personal data (birth dates, names) in here.
 */
export function useQueryState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void, boolean, ReadonlySet<keyof T & string>] {
  const [state, setState] = useState<T>(defaults);
  const [ready, setReady] = useState(false);
  const [fromUrl, setFromUrl] = useState<ReadonlySet<keyof T & string>>(() => new Set());
  const keys = useRef(Object.keys(defaults));
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaults };
    const supplied = new Set<keyof T & string>();
    for (const key of keys.current) {
      const value = params.get(key);
      if (value !== null) { (next as Record<string, string>)[key] = value; supplied.add(key as keyof T & string); }
    }
    setState(next);
    setFromUrl(supplied);
    setReady(true);
    // Read once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    for (const key of keys.current) {
      const value = state[key];
      if (value === defaults[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    // Colons and commas are valid in a query; keeping them makes shared links readable (goal=3:30, s=0:25:10,0:50:31).
    const search = url.searchParams.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');
    window.history.replaceState(window.history.state, '', url.pathname + (search ? `?${search}` : '') + url.hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready]);
  const update = useCallback((patch: Partial<T>) => setState((s) => ({ ...s, ...patch })), []);
  return [state, update, ready, fromUrl];
}
