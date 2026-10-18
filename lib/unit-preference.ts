import { DEFAULT_UNITS, type UnitSystem } from './units';

// The pages whose header has the working miles/km switch: these pages, and these sections with every page under them.
// Everywhere else the switch is an inert, hidden placeholder that keeps the header's layout. A page that renders text
// that changes with the units must be listed: in the server render (the static export's build) useUnits, UnitText and
// MarathonDistance (components/UnitsProvider.tsx) throw on any other page, so a page left out stops the build.
// The moved addresses' stubs (/packs, /htw, /your-race …) show no such text, so their switch stays inert.
const UNIT_PAGES = ['/', '/about', '/methodology', '/slowdown', '/research'];
const UNIT_SECTIONS = ['/analyses', '/runners', '/report', '/courses', '/stories', '/tools', '/finish-times'];

/** Whether the header's units switch works on this page (a path without the base path, as usePathname gives it). */
export function unitSwitchShown(path: string): boolean {
  return UNIT_PAGES.includes(path) || UNIT_SECTIONS.some((section) => path === section || path.startsWith(section + '/'));
}

export function unitsFromSearch(search: string): UnitSystem | null {
  const value = new URLSearchParams(search).get('units');
  return value === 'mi' || value === 'km' ? value : null;
}

// Colons and commas are valid in a query and keep tool links readable (goal=3:30, s=0:25:10,0:50:31).
const readable = (query: URLSearchParams) => query.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',');

/** Splits a site-relative href into path, query and fragment, or returns null for external, relative and fragment-only links. */
function splitHref(href: string): { path: string; query: URLSearchParams; hash: string } | null {
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  const hashIndex = href.indexOf('#');
  const hash = hashIndex < 0 ? '' : href.slice(hashIndex);
  const pathAndQuery = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = pathAndQuery.indexOf('?');
  const path = queryIndex < 0 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  return { path, query: new URLSearchParams(queryIndex < 0 ? '' : pathAndQuery.slice(queryIndex + 1)), hash };
}

/** Always writes `units` into a site link. Shared "Copy link" buttons use it so a recipient opens the same units. */
export function withUnits(href: string, units: UnitSystem): string {
  const parts = splitHref(href);
  if (!parts) return href;
  parts.query.set('units', units);
  return parts.path + '?' + readable(parts.query) + parts.hash;
}

/**
 * The href for an internal link or address. Miles are the default, so a miles link carries no `units` parameter
 * (one clean URL per page); kilometres are written as `units=km` so the choice travels even without stored preferences.
 * A miles visitor whose link has no parameter falls back to the stored preference, which the units switch keeps current.
 */
export function unitHref(href: string, units: UnitSystem): string {
  if (units !== DEFAULT_UNITS) return withUnits(href, units);
  const parts = splitHref(href);
  if (!parts || !parts.query.has('units')) return href;
  parts.query.delete('units');
  const search = readable(parts.query);
  return parts.path + (search ? '?' + search : '') + parts.hash;
}

/** Comparison filters at these values select everything, so links leave them out: every course, every age group, every recorded gender. */
export const FILTER_DEFAULTS: Readonly<Record<string, string>> = { race: 'All courses', age: 'all', gender: 'all' };

/** A query string ('?…', or '' when nothing is left) without the comparison filters that equal their defaults. */
export function dropDefaults(params: URLSearchParams | string | Record<string, string>): string {
  const query = new URLSearchParams(params);
  for (const [key, value] of Object.entries(FILTER_DEFAULTS)) if (query.getAll(key).every(item => item === value)) query.delete(key);
  const search = readable(query);
  return search ? '?' + search : '';
}
