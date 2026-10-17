import type { ReactNode } from 'react';
import BigNumber, { type BigNumberSize } from './BigNumber';

/**
 * The Reading: every page opens on it (spec section 3.5). Crumbs, the H1, the question dek, a hairline, then the
 * figure with its unit line, the sentence that says what it means, and a small instrument (at most 120 px) that draws
 * the sentence's number. Analyses put their Receipt where the figure goes.
 *
 * Words come from lib/nuggets/ (never typed on a page). A headline marks its one accent phrase with *…*, which
 * `withEm()` renders as <em>. When the nugget's guard fails, pass `fallback`: the neutral sentence shows and the
 * figure is drawn as a plain observed value.
 *
 * The title is the page's H1; `titleAs="h2"` is for a preview of a Reading inside another page (the gallery).
 *
 * Variants: figure (default), receipt (analyses), pair ("20% · 45%"), range ("19–46%") and null (no clear difference:
 * the figure in --ink-3 with an approximately-zero mark).
 */

export type Figure = { value: string; unit?: string; sr: string; size?: BigNumberSize; key?: string };

/** Renders one *…* span of a nugget sentence as <em>; text without a marker comes back unchanged. */
export function withEm(text: string): ReactNode {
  const m = /^([\s\S]*?)\*([^*]+)\*([\s\S]*)$/.exec(text);
  if (!m) return text;
  return <>{m[1]}<em>{m[2]}</em>{m[3]}</>;
}

type Props = {
  crumbs?: ReactNode;
  title: ReactNode;
  titleId?: string;
  titleSize?: 'display' | 'title';
  titleAs?: 'h1' | 'h2';
  dek?: ReactNode;
  variant?: 'figure' | 'receipt' | 'pair' | 'range' | 'null';
  figure?: Figure;
  figures?: [Figure, Figure];
  range?: { from: number; to: number; min?: number; max?: number };
  receipt?: ReactNode;
  unitLine?: ReactNode;
  sentence?: string | ReactNode;
  instrument?: ReactNode;
  foot?: ReactNode;
  fallback?: boolean;
  stacked?: boolean;
  className?: string;
};

export default function Reading({
  crumbs, title, titleId, titleSize = 'display', titleAs: Title = 'h1', dek, variant = 'figure', figure, figures, range, receipt, unitLine, sentence,
  instrument, foot, fallback = false, stacked = false, className,
}: Props) {
  const cls = `reading${variant === 'null' ? ' is-null' : ''}${fallback ? ' is-fallback' : ''}${stacked || variant === 'receipt' ? ' is-stacked' : ''}${className ? ` ${className}` : ''}`;
  const tone = variant === 'null' ? 'quiet' : 'ink';
  let figureBlock: ReactNode = null;
  if (variant === 'receipt') figureBlock = receipt;
  else if (variant === 'pair' && figures) {
    figureBlock = (
      <div className="reading-pair">
        <span className="reading-pair-item"><BigNumber {...figures[0]} size={figures[0].size ?? 'l'} />{figures[0].key ? <span className="reading-pair-key">{figures[0].key}</span> : null}</span>
        <span className="reading-pair-item"><BigNumber {...figures[1]} size={figures[1].size ?? 'l'} />{figures[1].key ? <span className="reading-pair-key">{figures[1].key}</span> : null}</span>
      </div>
    );
  } else if (figure) {
    figureBlock = (
      <>
        <BigNumber {...figure} tone={tone} />
        {variant === 'range' && range ? <RangeStrip {...range} /> : null}
      </>
    );
  }
  return (
    <header className={cls}>
      <div className="reading-head">
        {crumbs ? <div className="reading-crumbs t-kicker">{crumbs}</div> : null}
        <Title id={titleId} className={`reading-title t-${titleSize}`}>{typeof title === 'string' ? withEm(title) : title}</Title>
        {dek ? <p className="reading-dek">{dek}</p> : null}
      </div>
      <hr className="reading-rule" />
      {figureBlock ? (
        <div className="reading-figure">
          {figureBlock}
          {unitLine && variant !== 'receipt' ? <p className="reading-unit-line">{unitLine}</p> : null}
        </div>
      ) : null}
      {sentence || instrument || foot ? (
        <div className="reading-main">
          {sentence ? <p className="reading-sentence t-sentence">{typeof sentence === 'string' ? (fallback ? sentence.replace(/\*/g, '') : withEm(sentence)) : sentence}</p> : null}
          {instrument ? <div className="reading-instrument">{instrument}</div> : null}
          {foot ? <div className="reading-foot">{foot}</div> : null}
        </div>
      ) : null}
    </header>
  );
}

/** A range strip for the `range` variant: the observed span in signal on a hairline from min to max. */
function RangeStrip({ from, to, min = 0, max = 1 }: { from: number; to: number; min?: number; max?: number }) {
  const span = max - min || 1;
  const left = Math.max(0, Math.min(1, (from - min) / span)) * 100;
  const right = Math.max(0, Math.min(1, (to - min) / span)) * 100;
  return (
    <div className="reading-range-strip" aria-hidden="true">
      <span className="reading-range-bar" style={{ left: `${left}%`, width: `${Math.max(1, right - left)}%` }} />
    </div>
  );
}
