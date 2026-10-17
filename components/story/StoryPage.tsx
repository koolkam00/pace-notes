import type { ReactNode } from 'react';
import Reading, { type Figure } from '@/components/ui/Reading';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import ChapterRail from '@/components/ChapterRail';
import ChapterEnd from '@/components/ChapterEnd';
import { UnitLink as Link } from '@/components/UnitsProvider';
import ByUnits from './ByUnits.client';
import type { TRACKED_SECTIONS } from '@/lib/analytics-policy';
import { readingAttrs } from '@/lib/chapters';
import { readingOf, type Nugget, type NuggetText } from '@/lib/nuggets';

type Track = (typeof TRACKED_SECTIONS)[number];

const TERM = /\bsustained[ -]slowdowns?\b/i;
export const TERM_HREF = '/methodology#sustained-slowdown';

/** A range ("35–40K", "2022–26") never breaks at its dash: a word joiner holds the two ends together. */
export const keep = (text: string) => text.replace(/(\d)–(?=\d)/g, '$1–\u2060');

/**
 * A sentence with its one *…* accent as <em>. With `term`, the first "sustained slowdown" in it links to its definition
 * on /methodology (.term-link): pages pass it once, at the term's first use (the redesign spec, section 3.10).
 */
export function rich(text: string, { term = false, plain = false }: { term?: boolean; plain?: boolean } = {}): ReactNode {
  const parts = keep(text).split(/(\*[^*]+\*)/).filter(Boolean);
  let linked = !term;
  return parts.map((part, i) => {
    const accent = part.startsWith('*') && part.endsWith('*') && part.length > 2;
    const body = accent ? part.slice(1, -1) : part;
    let node: ReactNode = body;
    if (!linked) {
      const m = TERM.exec(body);
      if (m) {
        linked = true;
        node = <>{body.slice(0, m.index)}<Link href={TERM_HREF} className="term-link">{m[0]}</Link>{body.slice(m.index + m[0].length)}</>;
      }
    }
    return accent && !plain ? <em key={i}>{node}</em> : <span key={i}>{node}</span>;
  });
}

/** A nugget text (or both unit versions of it), rendered with its accent; a fallback is shown without one. */
export function SayText({ text, term = false, plain = false }: { text: NuggetText; term?: boolean; plain?: boolean }) {
  if (typeof text === 'string' || text.mi === text.km) return <>{rich(typeof text === 'string' ? text : text.mi, { term, plain })}</>;
  return <ByUnits mi={rich(text.mi, { term, plain })} km={rich(text.km, { term, plain })} />;
}

/** The sentence a page shows for a nugget: the headline when its guard holds, the plain fallback when it does not. */
export function Say({ nugget, term = false }: { nugget: Nugget; term?: boolean }) {
  return <SayText text={nugget.guard ? nugget.headline : nugget.fallback} term={term} plain={!nugget.guard} />;
}

/**
 * A story page (the redesign spec, section 4.1, under section 00): the reading, at most six beats and the closing stack,
 * with the chapter rail beside them from 1180 px. Every section is a tracked beat: hero, chapter-1 … chapter-n, related.
 */
export function StoryPage({ path, className, children }: { path: string; className?: string; children: ReactNode }) {
  return (
    <div className={`story-page with-rail${className ? ` ${className}` : ''}`} {...readingAttrs(path)}>
      <ChapterRail path={path} />
      <article className="story-flow">
        {children}
        <ChapterEnd path={path} readingOf={readingOf} />
      </article>
    </div>
  );
}

/** The opener: crumbs, the H1, the question, then the reading (figure, unit line, sentence, a small instrument). */
export function StoryHero({ path, title, dek, figure, figures, variant, unitLine, sentence, instrument, fallback, label = 'The reading', children }: {
  path: string; title: ReactNode; dek?: ReactNode; figure?: Figure; figures?: [Figure, Figure]; variant?: 'figure' | 'pair';
  unitLine?: ReactNode; sentence?: ReactNode; instrument?: ReactNode; fallback?: boolean; label?: string; children?: ReactNode;
}) {
  return (
    <section className="story-hero-beat" data-track-section="hero" data-beat={label}>
      <Reading crumbs={<ChapterCrumbs path={path} />} title={typeof title === 'string' ? rich(title) : title} dek={dek}
        variant={variant ?? (figures ? 'pair' : 'figure')} figure={figure} figures={figures} unitLine={unitLine}
        sentence={sentence} instrument={instrument} fallback={fallback} />
      {children}
    </section>
  );
}

/**
 * One beat: its finding as the H2, at most one short dek, one figure. `label` names it in the rail and the reading bar;
 * `aliases` keep the ids of beats folded into this one, so old links still land here.
 */
export function Beat({ id, track, label, title, dek, aliases = [], className, children }: {
  id: string; track: Track; label: string; title: Nugget | ReactNode; dek?: ReactNode; aliases?: string[]; className?: string; children: ReactNode;
}) {
  const heading = title && typeof title === 'object' && 'guard' in (title as Nugget) ? <Say nugget={title as Nugget} /> : (title as ReactNode);
  return (
    <section id={id} className={`beat story-beat${className ? ` ${className}` : ''}`} aria-labelledby={`${id}-title`} data-beat={label} {...{ 'data-track-section': track }}>
      {aliases.map((alias) => <span key={alias} id={alias} className="beat-alias" aria-hidden="true" />)}
      <div className="beat-head">
        <h2 id={`${id}-title`} className="t-h2 story-beat-title">{heading}</h2>
        {dek ? <p className="story-beat-dek">{typeof dek === 'string' ? keep(dek) : dek}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A beat that moved to another page. Its old anchor stays, holding one line that shows only when a link lands on it
 * (:target), so deep links into the old page still arrive somewhere and nobody else sees a second way out.
 */
export function Moved({ id, href, children }: { id: string; href: string; children: ReactNode }) {
  return <p id={id} className="story-moved"><Link href={href}>{children}</Link></p>;
}
