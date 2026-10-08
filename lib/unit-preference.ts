import type { UnitSystem } from './units';

export function unitsFromSearch(search: string): UnitSystem | null {
  const value = new URLSearchParams(search).get('units');
  return value === 'mi' || value === 'km' ? value : null;
}

export function withUnits(href: string, units: UnitSystem): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href;
  const hashIndex = href.indexOf('#');
  const hash = hashIndex < 0 ? '' : href.slice(hashIndex);
  const pathAndQuery = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const queryIndex = pathAndQuery.indexOf('?');
  const path = queryIndex < 0 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  const query = new URLSearchParams(queryIndex < 0 ? '' : pathAndQuery.slice(queryIndex + 1));
  query.set('units', units);
  // Colons and commas are valid in a query and keep tool links readable (goal=3:30, s=0:25:10,0:50:31).
  return path + '?' + query.toString().replace(/%3A/gi, ':').replace(/%2C/gi, ',') + hash;
}
