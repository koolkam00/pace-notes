import type { CSSProperties, ReactNode } from 'react';
import Readout, { type ReadoutProps } from './Readout';

/**
 * The frame every figure sits in (the redesign spec, section 3.5): figure.viz, which keeps charts out of session
 * replay. Top to bottom: an optional lens (one Segmented or Chips), the readout (the tooltip, above the plot), a hairline,
 * the plot (its box reserved by CSS so nothing moves when it draws), the axis, the scrubber's crown row, a key (forms
 * pass one only for encodings a direct label does not name: two or more marks, a reference line, a band), and the
 * Values table twin.
 *
 * Pass `scrub` (a Scrubber holding plot and axis) in place of `plot` and `axis` when the chart can be scrubbed; it draws
 * its own live readout. The plot carries role="img" and the finding as its label (a scrubbable plot is a slider instead).
 *
 * States: `status="empty"` shows the explorer's "No published values for this selection" (role="status"), and
 * `status="error"` "This chart could not load" with a Retry link (role="alert"). An answer is never empty.
 */
export type KeyItem = { label: string; mark: 'dot' | 'ring' | 'line' | 'dash' | 'square' | 'hollow' | 'band'; tone?: 'ink' | 'signal' | 'quiet' };

type Props = {
  /** The finding, said in full: the plot's accessible name. */
  label: string;
  lens?: ReactNode;
  readout?: ReadoutProps;
  plot?: ReactNode;
  axis?: ReactNode;
  scrub?: ReactNode;
  keys?: KeyItem[];
  values?: ReactNode;
  status?: 'empty' | 'error';
  /** Plot height on phones and from 900 px, px. */
  height?: number;
  heightMd?: number;
  /** Lens or switch state the figure opens on (data-k), so CSS shows the matching layer before any script runs. */
  k?: string;
  className?: string;
  id?: string;
  caption?: ReactNode;
  /** Custom properties a form sets on its figure (a waffle's --ratio). */
  style?: CSSProperties;
};

export default function ChartFrame({ label, lens, readout, plot, axis, scrub, keys, values, status, height, heightMd, k, className, id, caption, style: own }: Props) {
  const style = { ...own, ...(height ? { '--plot-h': `${height}px` } : {}), ...(heightMd ? { '--plot-h-md': `${heightMd}px` } : {}) } as CSSProperties;
  return (
    <figure className={`viz viz-frame${className ? ` ${className}` : ''}`} id={id} style={style} data-k={k}>
      {lens ? <div className="viz-lens">{lens}</div> : null}
      {status === 'empty' ? <p className="viz-status" role="status">No published values for this selection.</p>
        : status === 'error' ? <p className="viz-status is-error" role="alert">This chart could not load. <a href="">Retry</a></p>
          : (
            <>
              {scrub ?? (
                <>
                  {readout ? <Readout {...readout} /> : null}
                  <div className="viz-plot" role="img" aria-label={label}>{plot}</div>
                  {axis}
                </>
              )}
              {keys?.length ? (
                <ul className="viz-key" aria-hidden="true">
                  {keys.map((key) => <li key={key.label}><i className={`viz-key-mark is-${key.mark}${key.tone ? ` is-${key.tone}` : ''}`} />{key.label}</li>)}
                </ul>
              ) : null}
            </>
          )}
      {caption ? <figcaption className="viz-caption">{caption}</figcaption> : null}
      {values}
    </figure>
  );
}
