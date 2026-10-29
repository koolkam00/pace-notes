import { dataFetch } from './data-fetch';

/**
 * Browser loading of the half-marathon aggregates (public/data/half/). Every request goes through `dataFetch`, carries
 * no referrer (the page URL can hold a visitor's typed time) and is checked against the sha256 the build recorded in
 * the verified half manifest (lib/half-server.ts `halfSha`), so a page never shows a file other than the one it was
 * built for.
 */

const cache = new Map<string, Promise<unknown>>();

async function digest(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fetch one half file by its path under /data/ (for example 'half/tools/half-to-full.json'), verifying its digest. */
export function loadHalf<T>(file: string, sha256: string): Promise<T> {
  if (!/^half\/[a-z0-9/-]+\.json$/.test(file)) return Promise.reject(new Error('This data is not available.'));
  const key = file + '@' + sha256;
  if (!cache.has(key)) {
    const request = (async () => {
      const response = await dataFetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/data/' + file + '?v=' + sha256, { referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('This data could not be loaded. Check the connection and try again.');
      const buffer = await response.arrayBuffer();
      if (typeof crypto !== 'undefined' && crypto.subtle && (await digest(buffer)) !== sha256) throw new Error('This data could not be verified, so it is not shown.');
      return JSON.parse(new TextDecoder().decode(buffer)) as T;
    })();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return cache.get(key) as Promise<T>;
}
