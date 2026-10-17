'use client';
import type { GuideAnswer } from '@/lib/personalized';
import { distanceLabel, paceLabel, paceValue } from '@/lib/units';
import { UnitLink as Link, useUnits } from './UnitsProvider';

export default function PacingPreview({ answer }: { answer: GuideAnswer }) {
  const { units } = useUnits();
  const rows = answer.charts[0]?.rows || [];
  const values = rows.map(row => paceValue(Number(row.value), units));
  if (!values.length) return null;
  const low = Math.floor(Math.min(...values) * 2) / 2 - .1;
  const high = Math.ceil(Math.max(...values) * 2) / 2 + .1;
  const x = (i: number) => 42 + (Math.min((i + 1) * 5, 42.195) - 5) / 37.195 * 400;
  const y = (v: number) => 200 - (v - low) / (high - low) * 140;
  const points = values.map((v, i) => x(i) + ',' + y(v)).join(' ');
  const pace = (value: number) => paceLabel(value * 60 / paceValue(1, units), units, false);
  return <div className="pacing-preview">
    <div className="preview-label"><span>A glimpse of the data</span><span>01 / 10</span></div>
    <h2>The shape of a<br />four-hour marathon.</h2>
    <p>Typical section pace · all courses</p>
    <svg viewBox="0 0 480 248" role="img" aria-label={`Typical pace in minutes per ${units === 'mi' ? 'mile' : 'kilometre'} by section for runners finishing between 3 hours 52 minutes 30 seconds and 4 hours 7 minutes 30 seconds. Explore analysis one for exact values.`}>
      {[low + .1, (low + high) / 2, high - .1].map(v => <g key={v}><line x1="42" x2="442" y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity=".1" /><text x="0" y={y(v) + 4} fill="currentColor" opacity=".6" fontSize="11">{pace(v)}</text></g>)}
      <polygon points={'42,206 ' + points + ' 442,206'} fill="var(--course)" opacity=".055" />
      <polyline points={points} fill="none" stroke="var(--course)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((value, i) => <circle key={i} cx={x(i)} cy={y(value)} r={i === values.length - 1 ? 5 : 3} fill="var(--paper)" stroke="var(--course)" strokeWidth="2" />)}
      <text x="42" y="237" fontSize="11" fill="currentColor" opacity=".6">First {distanceLabel(5, units)}</text><text x={x(4)} y="237" textAnchor="middle" fontSize="11" fill="currentColor" opacity=".6">{distanceLabel(25, units)}</text><text x="442" y="237" textAnchor="end" fontSize="11" fill="currentColor" opacity=".6">Finish</text>
    </svg>
    <div className="preview-foot"><span>Finishes from 3:52:30 to 4:07:30<br /><small>Minutes per {units === 'mi' ? 'mile' : 'km'}</small></span><Link href="/analyses/pacing-pattern" aria-label="Explore the pacing pattern analysis"><span aria-hidden="true">↗</span></Link></div>
  </div>;
}
