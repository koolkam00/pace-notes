'use client';

import { useId, useState } from 'react';
import { useUnits } from './UnitsProvider';
import { unitText } from '@/lib/units';
import QuestionViz from './QuestionViz';
import type { StudyFigureData } from '@/lib/study-figures';

export default function StudyFigure({ figure }: { figure: StudyFigureData }) {
  const { units } = useUnits();
  const text = (value: string) => unitText(value, units);
  const [choice, setChoice] = useState(0);
  const id = useId();
  return <article className="question" id={figure.id} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>{text(figure.title)}</h2>
    {figure.answer ? <p className="answer">{text(figure.answer)}</p> : null}
    <div className="chart-controls">
      <label htmlFor={`${id}-chart`}>Comparison
        <select id={`${id}-chart`} aria-label={`Comparison for ${text(figure.title)}`} value={choice} onChange={event => setChoice(Number(event.target.value))}>
          {figure.charts.map((chart, index) => <option key={index} value={index}>{text(chart.title)}</option>)}
        </select>
      </label>
    </div>
    <QuestionViz key={choice} spec={figure.charts[choice]} />
  </article>;
}
