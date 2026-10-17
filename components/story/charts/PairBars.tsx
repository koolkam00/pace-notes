import type { ReactNode } from 'react';
import ChartFrame from '@/components/viz/ChartFrame';
import Lens from '@/components/viz/Lens.client';

/**
 * Two bars under a lens (the redesign spec, section 7.9, #unmask): the same two groups measured two ways, one view at a
 * time. Each view draws its bars and the gap between their ends, washed signal and labelled, so switching views shows
 * the gap open or close. HTML bars on one shared scale; the figure opens on the view the sentence names.
 */
export type PairView = { id: string; label: string; bars: { label: string; value: number; display: string }[]; gap: string };

export default function PairBars({ views, initial, max, label, lensLabel, values }: {
  views: PairView[]; initial: string; max: number; label: string; lensLabel: string; values?: ReactNode;
}) {
  const at = (v: number) => `${Math.max(0, Math.min(1, v / max)) * 100}%`;
  return (
    <ChartFrame className="pair-bars" label={label} k={initial} height={128} heightMd={128}
      lens={<Lens label={lensLabel} options={views.map((v) => ({ value: v.id, label: v.label }))} defaultValue={initial} />}
      plot={(
        <div className="pair-bars-views">
          {views.map((view) => {
            const [a, b] = view.bars;
            const lo = Math.min(a.value, b.value), hi = Math.max(a.value, b.value);
            return (
              <div key={view.id} data-layer={view.id} className={`pair-bars-view${view.id === initial ? '' : ' is-off'}`}>
                {view.bars.map((bar) => (
                  <div key={bar.label} className="pair-bar">
                    <span className="pair-bar-label">{bar.label}</span>
                    <span className="pair-bar-track"><span className="pair-bar-fill" style={{ width: at(bar.value) }} /></span>
                    <span className="pair-bar-value">{bar.display}</span>
                  </div>
                ))}
                <div className="pair-bar-gaprow" aria-hidden="true"><span className="pair-bar-gap" style={{ left: at(lo), width: `calc(${at(hi)} - ${at(lo)})` }} /><span className="pair-bar-gap-label" style={{ left: at(hi) }}>{view.gap}</span></div>
              </div>
            );
          })}
        </div>
      )}
      values={values} />
  );
}
