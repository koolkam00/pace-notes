/**
 * The readout (the redesign spec, section 3.5): the fixed block above the plot that is the tooltip on every screen.
 * Left, the key and the value under the needle; right, up to two side values. 64 px reserved so nothing moves when it
 * changes, tabular figures so it does not jitter. A pure component: the server draws it for a still chart and the
 * Scrubber island redraws it as the needle moves (its live region is a separate sr-only line that settles first).
 */
export type ReadoutProps = {
  keyText: string;
  value: string;
  side?: { label: string; value: string }[];
  tone?: 'ink' | 'signal';
  hidden?: boolean;
};

export default function Readout({ keyText, value, side, tone = 'ink', hidden }: ReadoutProps) {
  return (
    <div className="readout" aria-hidden={hidden || undefined}>
      <div className="readout-main">
        <span className="readout-key">{keyText}</span>
        <span className={`readout-value${tone === 'signal' ? ' is-signal' : ''}`}>{value}</span>
      </div>
      {side?.length ? (
        <dl className="readout-side">
          {side.slice(0, 2).map((s) => <div key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></div>)}
        </dl>
      ) : null}
    </div>
  );
}
