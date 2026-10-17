import type { ReactNode } from 'react';
import BigNumber from './BigNumber';
import { withEm } from './Reading';

/**
 * The race receipt, an analysis's answer (spec section 3.5). A night card: a kicker row, a tear line, at most four
 * lines (label, key, value), a tear line, the result in the figure size and signal, an optional extra line with an
 * inline ruler (typical hollow, observed signal), and the footer kicker. No paragraph inside, and the page does not
 * repeat these values in prose. Direction is carried by the sign and the words; only the result is signal.
 *
 * `goal` sits under the card on paper: the goal line ("For your goal 4:00: …") with its Change button. It lives inside
 * the page's masked .analysis-layout. When a guard fails, pass `result.fallback` (a neutral "Finished 5:00 behind").
 */
export type ReceiptLine = { label: string; key?: string; value: string; sr?: string };

type Props = {
  kicker?: string;
  tag?: string;
  lines: ReceiptLine[];
  result: { label: string; value: string; sr: string; fallback?: string };
  extra?: { label: string; key?: string; value: string; sr?: string; typical?: number; observed?: number };
  footer?: string;
  goal?: ReactNode;
  className?: string;
};

export default function Receipt({ kicker = 'Race receipt', tag, lines, result, extra, footer, goal, className }: Props) {
  const shown = lines.slice(0, 4);
  const pct = (v: number) => `${Math.max(0, Math.min(1, v)) * 100}%`;
  return (
    <div className={`receipt-wrap${className ? ` ${className}` : ''}`}>
      <div className="receipt night">
        <div className="receipt-kickers">
          <span className="t-kicker">{kicker}</span>
          {tag ? <span className="t-kicker">{tag}</span> : null}
        </div>
        <hr className="receipt-tear" />
        <dl className="receipt-lines">
          {shown.map((line) => (
            <div className="receipt-line" key={line.label}>
              <dt>{line.label}{line.key ? <span className="receipt-key">{line.key}</span> : null}</dt>
              <dd>{line.sr ? <><span aria-hidden="true">{line.value}</span><span className="sr-only">{line.sr}</span></> : line.value}</dd>
            </div>
          ))}
        </dl>
        <hr className="receipt-tear" />
        <div className="receipt-result">
          <span className="receipt-result-label">{result.label}</span>
          {result.fallback
            ? <span className="receipt-result-fallback t-sentence">{result.fallback}</span>
            : <BigNumber value={result.value} sr={result.sr} size="l" tone="signal" />}
        </div>
        {extra ? (
          <div className="receipt-extra">
            <span className="receipt-extra-label">{extra.label}</span>
            <span className="receipt-extra-value">{extra.sr ? <><span aria-hidden="true">{extra.value}</span><span className="sr-only">{extra.sr}</span></> : extra.value}</span>
            {extra.key ? <span className="receipt-extra-key">{extra.key}</span> : null}
            {typeof extra.observed === 'number' ? (
              <span className="receipt-ruler" aria-hidden="true">
                {typeof extra.typical === 'number' ? <span className="receipt-ruler-mark is-typical" style={{ left: pct(extra.typical) }} /> : null}
                <span className="receipt-ruler-mark is-observed" style={{ left: pct(extra.observed) }} />
              </span>
            ) : null}
          </div>
        ) : null}
        {footer ? <p className="receipt-foot t-kicker">{footer}</p> : null}
      </div>
      {goal ? <p className="receipt-goal">{typeof goal === 'string' ? withEm(goal) : goal}</p> : null}
    </div>
  );
}
