import type { ReactNode } from 'react';

/**
 * The lap list (the redesign spec, section 7.12, "the lap screen"): one race's nine mats as a stopwatch list. Each row
 * is the mat (named the same in both unit modes), the split, the section pace and a bar from the race's own 5–20K pace:
 * right is slower, left quicker, the zero line is that pace. The rows the sentence is about are lit: in signal for the
 * report's sustained-slowdown sections, in ink for the runner view's sections from 30K (signal keeps one meaning on a
 * page). The race report draws it on its night
 * screen and the runner view on paper. It holds a visitor's or a runner's times, so it sits in figure.viz, which session
 * replay leaves out.
 */
export type LapRow = { mat: string; split?: string; pace: string; vs: number; lit?: boolean; sr: string };

export default function LapList({ rows, baseline, label, caption, className, tone = 'signal', by = 'mat' }: {
  rows: LapRow[];
  /** What the first column names: the mat a split ends at (the report, standing alone), or the section ("30–35K"), where
   *  the list sits beside a section-by-section comparison and the two should share one vocabulary (the runner view). */
  by?: 'mat' | 'section';
  /** How lit rows are marked: signal for the finding (the report's sustained slowdown), ink for a stretch the copy names. */
  tone?: 'signal' | 'ink';
  /** The zero line's pace ("8:35/mi"): the bars run from it, and the caption names it. */
  baseline: string;
  /** The finding, said in full: the list's accessible name. */
  label: string;
  caption?: ReactNode;
  className?: string;
}) {
  const values = rows.map((r) => r.vs);
  // The scale reaches 15% either side of the 5–20K pace at least, so an even race still draws visible bars.
  const lo = Math.min(-0.05, ...values);
  const hi = Math.max(0.15, ...values);
  const at = (v: number) => (100 * (v - lo)) / (hi - lo);
  const zero = at(0);
  const splits = rows.some((r) => r.split);
  return (
    <figure className={`viz lap-list${splits ? '' : ' no-split'}${tone === 'ink' ? ' is-ink' : ''}${by === 'section' ? ' by-section' : ''}${className ? ` ${className}` : ''}`} style={{ ['--zero' as string]: `${zero.toFixed(2)}%` }}>
      <div className="lap-head" aria-hidden="true">
        <span>{by === 'section' ? 'Section' : 'Mat'}</span>{splits ? <span>Split</span> : null}<span>Pace</span><span className="lap-head-bar"><span>5–20K</span></span>
      </div>
      <ol className="lap-rows" aria-label={label}>
        {rows.map((r, i) => (
          <li key={i} className={r.lit ? 'is-lit' : undefined}>
            <span className="lap-mat">{r.mat}</span>
            {splits ? <span className="lap-split">{r.split}</span> : null}
            <span className="lap-pace">{r.pace}</span>
            <span className="lap-bar" aria-hidden="true"><i style={{ left: `${Math.min(zero, at(r.vs)).toFixed(2)}%`, width: `${Math.max(0.8, Math.abs(at(r.vs) - zero)).toFixed(2)}%` }} /></span>
            <span className="sr-only">{r.sr}</span>
          </li>
        ))}
      </ol>
      <figcaption className="lap-caption">Bars run from the 5–20K pace, {baseline}: slower to the right.{caption ? <> {caption}</> : null}</figcaption>
    </figure>
  );
}
