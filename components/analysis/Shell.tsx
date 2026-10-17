import type { ReactNode } from 'react';
import Reading from '@/components/ui/Reading';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import { withEm } from '@/components/ui/withEm';
import ChapterRail from '@/components/ChapterRail';
import ChapterEnd from '@/components/ChapterEnd';
import ByUnits from './ByUnits.client';
import { readingAttrs } from '@/lib/chapters';
import { readingOf, sentenceOf, textFor, type Nugget, type NuggetText } from '@/lib/nuggets';
import type { TRACKED_SECTIONS } from '@/lib/analytics-policy';

type Track = (typeof TRACKED_SECTIONS)[number];

/** A nugget's sentence (guard ? headline : fallback), its one accent as <em>, in the reader's units when it has both. */
export function Say({ nugget, plain = false }: { nugget: Nugget; plain?: boolean }) {
  const text: NuggetText = nugget.guard ? nugget.headline : nugget.fallback;
  return <SayText text={text} plain={plain || !nugget.guard} />;
}

/** A sentence, or its miles and kilometres versions. `plain` drops the accent (a fallback asserts nothing). */
export function SayText({ text, plain = false }: { text: NuggetText; plain?: boolean }) {
  const show = (s: string) => (plain ? s.replace(/\*/g, '') : withEm(s));
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
export default function AnalysisShell({ path, title, dek, answer, children }: {
  path: string; title: Nugget; dek: string; answer: ReactNode; children: ReactNode;
}) {
  return (
    <div className="analysis-page with-rail" {...readingAttrs(path)}>
      <ChapterRail path={path} />
      <div className="analysis-layout analysis-flow">
        <section className="analysis-hero" id="answer" data-track-section="hero" data-beat="The answer">
          <Reading crumbs={<ChapterCrumbs path={path} />} title={<Say nugget={title} />} titleSize="title" dek={dek} variant="receipt" receipt={answer} />
        </section>
        {children}
        <ChapterEnd path={path} variant="analysis" readingOf={readingOf} />
      </div>
    </div>
  );
}

/** One beat: its finding as the H2 (a nugget), one figure, nothing else. `label` names it in the rail. */
export function Beat({ id, track, label, title, children, className }: {
  id: string; track: Track; label: string; title: Nugget | ReactNode; children: ReactNode; className?: string;
}) {
  const heading = title && typeof title === 'object' && 'guard' in (title as Nugget) ? <Say nugget={title as Nugget} /> : (title as ReactNode);
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
export function AnswerCard({ kicker, children, foot, className }: { kicker?: string; children: ReactNode; foot?: ReactNode; className?: string }) {
  return (
    <div className={`answer-card night${className ? ` ${className}` : ''}`}>
      {kicker ? <p className="answer-kicker t-kicker">{kicker}</p> : null}
      {children}
      {foot ? <p className="answer-foot">{foot}</p> : null}
    </div>
  );
}
