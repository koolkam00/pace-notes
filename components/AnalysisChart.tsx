'use client';

import { useId, useState } from 'react';
import type { ChartSpec } from '@/lib/research-data';
import QuestionViz from './QuestionViz';
import { unitText } from '@/lib/units';
import { useUnits } from './UnitsProvider';

/** Analyses show the chart and its values only; how a chart is calculated or read belongs on /methodology. */
export const chartOnly = (spec: ChartSpec): ChartSpec => ({ ...spec, note: undefined });

export default function AnalysisChart({ charts, analysisId }: { charts: ChartSpec[]; analysisId: string }) {
  const id = useId();
  const { units } = useUnits();
  const [selection, setSelection] = useState({ analysisId, index: 0 });
  const index = selection.analysisId === analysisId && selection.index < charts.length ? selection.index : 0;
  const selected = charts[index];
  const choose = (next: number) => setSelection({ analysisId, index: next });

  return <section className="analysis-chart" aria-labelledby={`${id}-heading`}>
    {/* Named for assistive technology only: the explorer's headline above already says what the chart shows. */}
    <h2 className="sr-only" id={`${id}-heading`}>Explore the comparison</h2>
    {charts.length > 1 && <div className="chart-switcher">
      {charts.length <= 3 ? <div className="chart-switcher-buttons" role="group" aria-label="Choose a comparison">
        {charts.map((chart, option) => <button key={`${option}-${chart.title}`} type="button" aria-pressed={index === option} aria-controls={`${id}-comparison`} onClick={() => choose(option)}>{unitText(chart.title, units)}</button>)}
      </div> : <label className="chart-switcher-label" htmlFor={`${id}-select`}>Comparison
        <select id={`${id}-select`} value={index} aria-controls={`${id}-comparison`} onChange={event => choose(Number(event.target.value))}>
          {charts.map((chart, option) => <option key={`${option}-${chart.title}`} value={option}>{unitText(chart.title, units)}</option>)}
        </select>
      </label>}
    </div>}
    <div id={`${id}-comparison`}>
      {selected ? <QuestionViz key={`${analysisId}-${index}-${selected.title}`} spec={chartOnly(selected)} /> : <p className="answer-state" role="status">A published comparison is not available yet.</p>}
    </div>
  </section>;
}
