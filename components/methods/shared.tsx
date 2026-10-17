import type { ReactNode } from 'react';

/**
 * Shared pieces of the Methods & sources page (/methodology). Since October 16, 2026 every method, definition, data
 * source, coverage note and limit lives on that page only; the other pages show the insights and link here. Every id
 * used here is a stable anchor: the site links /methodology#<id> (verify-seo checks that each linked id exists).
 * The page's units switch is inert, so nothing here converts units: distances are the recorded metric timing points.
 */

export const base = () => process.env.NEXT_PUBLIC_BASE_PATH || '';
/** A public data file, with the base path the static export may run under. */
export const dataHref = (file: string) => `${base()}/data/${file}`;

export const n = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const pctText = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;
export const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
export const day = (iso: string) => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
/** "Madrid 2013–2018, New York 2006–2007 and Prague 2016–2019": editions grouped by city, runs of years joined. */
export function editionList(editions: { city: string; year: number }[]): string {
  const byCity = new Map<string, number[]>();
  for (const { city, year } of editions) byCity.set(city, [...(byCity.get(city) ?? []), year]);
  return and([...byCity].map(([city, years]) => {
    const sorted = [...new Set(years)].sort((a, b) => a - b);
    const runs: string[] = [];
    for (let i = 0; i < sorted.length;) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
      runs.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
      i = j + 1;
    }
    return `${city} ${and(runs)}`;
  }));
}

/** One part of the page (an H2), such as "Definitions". */
export function Part({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return <section id={id} className="methods-part" aria-labelledby={`${id}-title`}>
    <p className="methods-eyebrow">{eyebrow}</p>
    <h2 id={`${id}-title`}>{title}</h2>
    {children}
  </section>;
}

/** One topic within a part (an H3), always visible, so a link to its id lands on readable text. */
export function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section id={id} className="methods-topic" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{title}</h3>
    {children}
  </section>;
}

/** A longer item that opens on request (the per-question, per-tool and per-story methods). */
export function Detail({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return <details className="methodology" id={id}><summary>{title}</summary><div className="methodology-content">{children}</div></details>;
}
