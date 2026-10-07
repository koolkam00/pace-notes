import { unitText, DEFAULT_UNITS } from '@/lib/units';
import { notFound } from 'next/navigation';
import { TEN_ANALYSES, analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart } from '@/lib/analysis-server';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import WeatherAnalysis from '@/components/WeatherAnalysis';
import { getWeatherAnalyses, getWeatherEvidence } from '@/lib/weather-data';
import FastStartAnalysis from '@/components/FastStartAnalysis';
import { getFastStartStarts } from '@/lib/fast-start-server';
import AllFinisherAnalysis from '@/components/AllFinisherAnalysis';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import Link from 'next/link';
import RelatedTool from '@/components/tools/RelatedTool';

export function generateStaticParams() { return [...TEN_ANALYSES, ...getWeatherAnalyses(), { slug: 'downhill-start' }].map(item => ({ slug: item.slug })); }
export function generateMetadata({ params }: { params: { slug: string } }) {
  if (params.slug === 'downhill-start') return { title: 'Downhill starts | Pace Notes', description: 'Explore opening pace and later slowing alongside supplied course elevation.' };
  const item = analysisBySlug(params.slug) || getWeatherAnalyses().find(item => item.slug === params.slug);
  return { title: item ? unitText(item.shortTitle, DEFAULT_UNITS) + ' | Pace Notes' : 'Analysis not found', description: item ? unitText(item.description, DEFAULT_UNITS) : undefined };
}
export default function AnalysisPage({ params }: { params: { slug: string } }) {
  return <>{analysisBody(params)}<RelatedTool analysis={params.slug} /></>;
}

function analysisBody(params: { slug: string }) {
  if (params.slug === 'downhill-start') return <AllFinisherAnalysis kind="downhill" start={getAllFinisherContextStart('downhill')} archive history={<div className="prose"><h1>Downhill starts with an earlier result</h1><p>The original comparison groups opening pace against a recent recorded best. <Link href="/research/personalized#guide-downhill">Open the earlier-result downhill comparison</Link> and choose a course.</p></div>} />;
  const weatherQuestions = getWeatherAnalyses();
  const weatherDefinition = weatherQuestions.find(item => item.slug === params.slug);
  if (weatherDefinition) {
    const evidence = getWeatherEvidence();
    const candidate = evidence.candidates.find(item => item.id === weatherDefinition.id && item.status === 'ready')!;
    return <WeatherAnalysis key={candidate.id} definition={weatherDefinition} candidate={candidate} evidence={evidence} questions={weatherQuestions} />;
  }
  const definition = analysisBySlug(params.slug);
  if (!definition) notFound();
  if (definition.id === 'opening') return <FastStartAnalysis starts={getFastStartStarts()} />;
  const { summary, answers } = getAnalysisStart();
  if (definition.id === 'courses' || definition.id === 'weather') {
    const historyDefinition = { ...definition, purpose: 'Compare finish times with the runner’s fastest eligible finish in the two strictly earlier calendar years.', readChart: definition.id === 'courses' ? 'The dot is the typical change from an earlier best. Left of zero means faster. The line spans the middle 80% of observed results.' : 'Each bar compares finishes with earlier recorded bests. Positive means slower. Each qualifying race edition contributes equally.' };
    return <AllFinisherAnalysis kind={definition.id} start={getAllFinisherContextStart(definition.id)} history={<AnalysisExplorer definition={historyDefinition} summary={summary} initialAnswer={answers.find(answer => answer.id === definition.id)!} weatherQuestions={weatherQuestions} historyMode />} related={definition.id === 'weather' ? <div className="prose"><h2>More weather questions</h2><ul>{weatherQuestions.map(item => <li key={item.slug}><Link href={'/analyses/' + item.slug}>{item.shortTitle}</Link></li>)}<li><Link href="/packs/r15_weather_penalty_who">Weather and the full pacing pattern</Link></li></ul></div> : undefined} />;
  }
  return <AnalysisExplorer key={definition.id} definition={definition} summary={summary} initialAnswer={answers.find(answer => answer.id === definition.id)!} weatherQuestions={weatherQuestions} />;
}
