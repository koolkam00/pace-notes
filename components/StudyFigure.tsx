'use client';

import { useId, useState } from 'react';
import { UnitLink as Link, useUnits } from './UnitsProvider';
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
    <p className="answer">{text(figure.answer)}</p>
    <div className="chart-controls">
      <label htmlFor={`${id}-chart`}>Comparison
        <select id={`${id}-chart`} aria-label={`Comparison for ${text(figure.title)}`} value={choice} onChange={event => setChoice(Number(event.target.value))}>
          {figure.charts.map((chart, index) => <option key={index} value={index}>{text(chart.title)}</option>)}
        </select>
      </label>
    </div>
    <QuestionViz key={choice} spec={figure.charts[choice]} />
    <details className="methodology">
      <summary>Methodology &amp; sources</summary>
      <div className="methodology-content">
        {figure.method.map((paragraph, index) => <p key={index}>{text(paragraph)}</p>)}
        <div className="source-links"><Link href="/methodology">Study methodology</Link>{figure.sources.map(source => <a key={source.href} href={source.href}>{source.label}</a>)}</div>
      </div>
    </details>
  </article>;
}
