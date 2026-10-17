import { getWeatherAnalyses, getWeatherEvidence } from '@/lib/weather-data';
import { weatherHref } from '@/lib/weather-catalog';
import { weatherFinding } from '@/lib/weather-display';
import { UnitLink } from './UnitsProvider';

export default function WeatherIndex() {
  const evidence = getWeatherEvidence();
  const questions = getWeatherAnalyses(evidence);
  if (!questions.length) return null;
  // Each entry states its finding; the question title says what it compares.
  const finding = (id: string) => { const candidate = evidence.candidates.find(item => item.id === id); return candidate ? weatherFinding(candidate) : ''; };
  return <section className="weather-index" id="weather-questions"><div className="section-intro"><p className="eyebrow">Conditions, in more detail</p><h2>What else does<br />race-day weather tell us?</h2></div><ol className="analysis-index">
    {questions.map(item => <li key={item.id}><UnitLink href={weatherHref(item)} className="analysis-index-link"><span className="analysis-rank" aria-hidden="true">↗</span><span className="analysis-index-copy"><span className="analysis-index-title">{item.title}</span><span className="analysis-index-description">{finding(item.id)}</span></span><span className="analysis-index-category">Race-day weather</span><span className="arrow-link" aria-hidden="true">↗</span></UnitLink></li>)}
  </ol></section>;
}
