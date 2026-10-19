import { Fragment, type ReactNode } from 'react';
import Reading from '@/components/ui/Reading';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import ChapterRail from '@/components/ChapterRail';
import ChapterEnd from '@/components/ChapterEnd';
import ByUnits from '@/components/ui/ByUnits.client';
import { keepTogether } from '@/components/ui/keepTogether';
import { readingAttrs } from '@/lib/chapters';
import { sentenceOf, settledReadingOf, textFor, type Nugget, type NuggetText } from '@/lib/nuggets';
import type { TRACKED_SECTIONS } from '@/lib/analytics-policy';

type Track = (typeof TRACKED_SECTIONS)[number];

/**
 * A nugget's sentence (guard ? headline : fallback), its one accent as <em>, in the reader's units when it has both.
 * `term` links the sentence's first "sustained slowdown" to the nugget's /methodology anchor: pass it where the page
 * uses the term first, so each page links it once.
 */
export function Say({ nugget, plain = false, term = false, quiet = false }: { nugget: Nugget; plain?: boolean; term?: boolean;
  /** A null result: its accent stays italic but in ink, never the signal (a null result looks null). */
  quiet?: boolean;
}) {
  const text: NuggetText = nugget.guard ? nugget.headline : nugget.fallback;
  return <SayText text={text} plain={plain || !nugget.guard} term={term ? nugget.term : undefined} quiet={quiet} />;
}

const TERM = /sustained slowdowns?/i;

/** One run of text: its ranges kept on one line and, when `link` is given, its first use of the term linked. */
function run(text: string, link: { href?: string; done: boolean }): ReactNode {
  const out: ReactNode[] = [];
  let key = 0;
  const k = link.href && !link.done ? TERM.exec(text) : null;
  const pieces = k ? [text.slice(0, k.index), k[0], text.slice(k.index + k[0].length)] : [text];
  pieces.forEach((piece, i) => {
    if (k && i === 1) { link.done = true; out.push(<Link key={key++} href={link.href!} className="term-link">{piece}</Link>); return; }
    out.push(<Fragment key={key++}>{keepTogether(piece)}</Fragment>);
  });
  return <>{out}</>;
}

/** A sentence with its one *…* accent as <em>, its ranges unbroken and, given `term`, its first use of the term linked. */
function sentence(s: string, plain: boolean, term?: string, quiet = false): ReactNode {
  const m = /^([\s\S]*?)\*([^*]+)\*([\s\S]*)$/.exec(s);
  const parts = m ? [{ t: m[1] }, { t: m[2], em: !plain }, { t: m[3] }] : [{ t: s.replace(/\*/g, '') }];
  const link = { href: term, done: false };
  return <>{parts.map((p, i) => {
    const node = run(p.t, link);
    return p.em ? <em key={i} className={quiet ? 'is-null' : undefined}>{node}</em> : <Fragment key={i}>{node}</Fragment>;
  })}</>;
}

/** A sentence, or its miles and kilometres versions. `plain` drops the accent (a fallback asserts nothing). */
export function SayText({ text, plain = false, term, quiet = false }: { text: NuggetText; plain?: boolean; term?: string; quiet?: boolean }) {
  const show = (s: string) => sentence(s, plain, term, quiet);
  if (typeof text === 'string') return <>{show(text)}</>;
  if (text.mi === text.km) return <>{show(text.mi)}</>;
  return <ByUnits mi={show(text.mi)} km={show(text.km)} />;
}

/** The plain text of a nugget's sentence (no accent), for labels and metadata. */
export const said = (n: Nugget, units: 'mi' | 'km' = 'mi') => sentenceOf(n, units).replace(/\*/g, '');
export { textFor };

/**
 * The analysis page (the redesign spec, section 4.2, under section 00): the finding H1 and its question, the answer on
 * one card, at most two beats, the explorer, then the closing stack. The whole page sits in .analysis-layout, masked in
 * session replays (the Make it yours sheet, the goal line and every result the visitor picks are inside it). From
 * 1180 px the chapter rail runs beside it.
 */
export default function AnalysisShell({ path, title, heading, dek, answer, children }: {
  path: string; title: Nugget; answer: ReactNode; children: ReactNode;
  /** The line under the H1: the finding's setup when the H1 is one clause (its second clause moved here), else the question. */
  dek: ReactNode;
  /** The H1's content when it is not the title nugget's sentence alone (race-day weather's tab-driven finding). The H1
   * never links the term: a dotted underline in the display face outweighed its accent, so pages link it in the dek. */
  heading?: ReactNode;
}) {
  return (
    <div className="analysis-page with-rail" {...readingAttrs(path)}>
      <ChapterRail path={path} />
      <div className="analysis-layout analysis-flow">
        <section className="analysis-hero" id="answer" data-track-section="hero" data-beat="The answer">
          <Reading crumbs={<ChapterCrumbs path={path} />} title={heading ?? <Say nugget={title} />} titleSize="title" dek={dek} variant="receipt" receipt={answer} />
        </section>
        {children}
        <ChapterEnd path={path} variant="analysis" readingOf={settledReadingOf} />
      </div>
    </div>
  );
}

/** One beat: its finding as the H2 (a nugget), one figure, nothing else. `label` names it in the rail. */
export function Beat({ id, track, label, title, term = false, children, className }: {
  id: string; track: Track; label: string; title: Nugget | ReactNode; children: ReactNode; className?: string;
  /** Link the heading's "sustained slowdown" (the page's first use of the term). */
  term?: boolean;
}) {
  const heading = title && typeof title === 'object' && 'guard' in (title as Nugget) ? <Say nugget={title as Nugget} term={term} /> : (title as ReactNode);
  return (
    <section id={id} className={`beat analysis-beat${className ? ` ${className}` : ''}`} data-beat={label} {...{ 'data-track-section': track }}>
      <div className="beat-head"><h2 className="t-h2 analysis-beat-title">{heading}</h2></div>
      {children}
    </section>
  );
}

/** The explorer's beat: always the last one, holding the page's Make it yours explorer. */
export function ExploreBeat({ track, children }: { track: Track; children: ReactNode }) {
  return (
    <section id="explore" className="beat analysis-explore miy-beat" data-beat="Make it yours" {...{ 'data-track-section': track }}>
      <p className="explore-kicker t-kicker">Make it yours</p>
      {children}
    </section>
  );
}

/** A night answer card for an answer that is a figure rather than a receipt (dot grids, a chart). */
export function AnswerCard({ kicker, children, foot, className }: { kicker?: ReactNode; children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={`answer-card night${className ? ` ${className}` : ''}`}>
      {kicker ? <p className="answer-kicker t-kicker">{kicker}</p> : null}
      {children}
      {foot ? <p className="answer-foot">{foot}</p> : null}
    </div>
  );
}
