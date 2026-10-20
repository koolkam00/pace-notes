import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';

/**
 * The same two groups measured two ways, both on one scale (the redesign spec, section 7.9, #unmask, under section 00):
 * each view is a named pair of bars with the gap between their ends drawn and labelled under them. The gap the sentence
 * is about (`highlight`) is signal; the other is quiet, so the two gaps compare at a glance with no control to press.
 * HTML bars on one shared scale. The gap's label box runs from the row's start to the higher bar's end and is
 * right-aligned there; a label longer than that box starts at the row's start instead of leaving the frame (200% zoom).
 */
export type PairView = { id: string; label: string; bars: { label: string; value: number; display: string }[]; gap: string };

export default function PairBars({ views, highlight, max, label, values }: {
  views: PairView[]; highlight: string; max: number; label: string; values?: ReactNode;
}) {
  const at = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  return (
    <ChartFrame className="pair-bars" label={label}
      plot={(
        <div className="pair-bars-views">
          {views.map((view) => {
            const [a, b] = view.bars;
            const lo = Math.min(a.value, b.value), hi = Math.max(a.value, b.value);
            return (
              <div key={view.id} className={`pair-bars-view${view.id === highlight ? ' is-highlight' : ''}`}>
                <p className="pair-bars-name">{view.label}</p>
                {view.bars.map((bar) => (
                  <div key={bar.label} className="pair-bar">
                    <span className="pair-bar-label">{bar.label}</span>
                    <span className="pair-bar-track"><span className="pair-bar-fill" style={{ width: at(bar.value) }} /></span>
                    <span className="pair-bar-value">{bar.display}</span>
                  </div>
                ))}
                <div className="pair-bar-gaprow" aria-hidden="true"><span className="pair-bar-gap" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} /><span className="pair-bar-gap-label" style={{ width: at(hi) }}>{view.gap}</span></div>
              </div>
            );
          })}
        </div>
      )}
      values={values} />
  );
}
