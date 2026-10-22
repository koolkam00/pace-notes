import type { ReactNode } from 'react';

/**
 * Shared pieces of the Methods & sources page (/methodology). Since October 16, 2026 every method, definition, data
 * source, coverage note and limit lives on that page only; the other pages show the insights and link here. Every id
 * used here is a stable anchor: the site links /methodology#<id> (verify-seo checks that each linked id exists).
 *
 * The page reads as five parts (the redesign spec, sections 7.15 and 00): each part is a heading and a list of topics,
 * and each topic opens on request, so the page is short with every topic closed. A link to a topic, or to anything
 * inside one, opens it (MethodsHash). Definitions are cards that show their rule, and open for the rest.
 *
 * The page's units switch works (lib/unit-preference.ts): the mats are named 5K … 40K in both units, and paces written
 * per km go through UnitText, so they read per mile in miles. Distances that define a method (42.195 km, the final
 * 2.195 km) stay as defined.
 */

export const base = () => process.env.NEXT_PUBLIC_BASE_PATH || '';
/** A public data file, with the base path the static export may run under. */
export const dataHref = (file: string) => `${base()}/data/${file}`;

export const n = (value: number) => new Intl.NumberFormat('en-US').format(value);
export const pctText = (share: number, digits = 1) => `${(share * 100).toFixed(digits)}%`;
export const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
export const day = (iso: string) => new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
/** "Madrid 2013–2018, New York 2006–2007 and Prague 2016–2019": editions grouped by city, runs of years joined. */
export function editionList(editions: readonly { city: string; year: number }[]): string {
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

/** One part of the page: its kicker, its heading (an H2) and a one-line lead, then its topics. A beat for the rail and the reading bar. */
export function Part({ id, n: number, short, title, lead, children }: { id: string; n: number; short: string; title: string; lead?: ReactNode; children: ReactNode }) {
  // tabIndex -1: a link to the part (the Menu's Open data, About's Downloads row) hands it the focus (MenuSheet.tsx).
  return <section id={id} className="methods-part" aria-labelledby={`${id}-title`} data-beat={short} tabIndex={-1}>
    <header className="methods-part-head">
      <p className="t-kicker">Part {number}</p>
      <h2 id={`${id}-title`} className="t-h2">{title}</h2>
      {lead ? <p className="methods-part-lead">{lead}</p> : null}
    </header>
    <div className="methods-rows">{children}</div>
  </section>;
}

/** The plus that turns into a minus as a row opens (drawn by app/styles/pages/info.css). */
export const Glyph = () => <span className="fold-glyph" aria-hidden="true" />;

/** One topic: a row that opens on request (a fold). A link to its id, or to an id inside it, opens it. */
export function Topic({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <details id={id} className="fold">
    <summary><h3 className="fold-title">{title}</h3><Glyph /></summary>
    <div className="fold-body">{children}</div>
  </details>;
}

/** A longer item inside a topic that opens on its own (each story's, question's and tool's method). */
export function Detail({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return <details className="fold is-sub" id={id}><summary><span className="fold-title">{title}</span><Glyph /></summary><div className="fold-body">{children}</div></details>;
}

/**
 * A definition: the term, its rule in a line or two and, where one helps, a small instrument that draws it. The rest
 * opens under "More". Shown open, so a link to the term lands on its rule.
 */
export function Definition({ id, term, rule, instrument, more, children }: {
  id: string; term: string; rule: ReactNode; instrument?: ReactNode; more?: string; children?: ReactNode;
}) {
  return <section id={id} className="methods-definition" aria-labelledby={`${id}-term`}>
    <h3 id={`${id}-term`} className="methods-term">{term}</h3>
    <div className="methods-rule">{rule}</div>
    {instrument ? <div className="methods-instrument">{instrument}</div> : null}
    {children ? <details className="fold is-sub methods-more"><summary><span className="fold-title">{more ?? `More on ${term.toLowerCase()}`}</span><Glyph /></summary><div className="fold-body">{children}</div></details> : null}
  </section>;
}
