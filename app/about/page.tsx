import { UnitLink as Link, UnitText } from '@/components/UnitsProvider';
import { getAnalysisStart } from '@/lib/analysis-server';
import { count } from '@/lib/personalized';
import { getWeatherAnalyses, getWeatherEvidence } from '@/lib/weather-data';
import DataCoverage from '@/components/DataCoverage';
import CreatorCredit from '@/components/CreatorCredit';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'About Pace Notes: Marathon Pacing Research',
  description: 'Why Pace Notes exists, what recorded marathon splits can and cannot tell you, and who made it: Andrew Kam.',
  path: '/about',
});
export default function AboutPage() {
  const { summary } = getAnalysisStart();
  const weather = getWeatherEvidence();
  const weatherQuestions = getWeatherAnalyses(weather);
  const withheld = weather.candidates.filter(candidate => candidate.status === 'withheld');
  const weatherNames = { humidity: 'humidity', warming: 'warming', wind: 'wind' };
  const withheldNames = new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' }).format(withheld.map(candidate => weatherNames[candidate.id]));
  const weatherHref = weatherQuestions.length ? '/analyses#weather-questions' : `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/data/weather/evidence.json`;
  return <article className="about-page"><header className="directory-heading"><p className="eyebrow">About the study</p><h1>More understanding.<br /><span><UnitText>Every kilometre.</UnitText></span></h1><p>A marathon result tells you the time. This study helps you see the race.</p></header>
    <div className="about-body"><section><h2>Why it exists</h2><p>Runners make decisions about pace, targets and courses with incomplete information. Pace Notes makes large collections of race results understandable and useful to explore.</p><p>Its ten main analyses follow the questions a runner might ask before or after a race: how people pace, what follows different starts, how conditions compare, and where improvement appears.</p><CreatorCredit /></section>
    <section><h2>What the data contains</h2><p>The essential ten analyses use {count(summary.n)} finishes with a complete set of usable splits, across {summary.cities.filter(city => city.city !== 'All courses').length} cities. A finish is a performance, so one runner may appear more than once.</p><p>The <Link href={weatherHref}>weather comparisons</Link> examine {count(weather.cohort.weather_analysis_finishes)} eligible finishes across {weather.cohort.weather_analysis_editions} race editions in {weather.cohort.weather_analysis_courses} cities. Each race edition contributes equally.</p><p>We evaluated humidity, warming and wind together. {weatherQuestions.length} of the {weather.candidates.length} questions met the publication rule.{withheld.length > 0 && <> Results for {withheldNames} did not support a clear enough takeaway for a separate page.</>}</p><p>Times at successive checkpoints show average pace for each section. Supplied records also include age, recorded gender and candidate links between runners’ races. Weather estimates and course profiles add context where available.</p></section>
    <DataCoverage />
    <section><h2>What an answer means</h2><p>These are observed patterns. A fast opening and a fast finish can go together because a runner is fitter; that does not mean a faster start caused the improvement.</p><p>Each analysis shows the actual comparison group. If a narrow selection has too few records, any broader comparison is labeled. Missing ages, splits and route history stay missing.</p><p>The study is a way to investigate your race, not an individual training plan or a promise of a result.</p></section>
    <section><h2>Open to everyone</h2><p>The complete exports, source code and methods are publicly available. No account or decryption key is needed. Newer exports can be downloadable before they have passed the checks required for website calculations.</p><div className="about-actions"><a className="button-primary" href="https://github.com/koolkam00/htw-live-study/releases">Download the data <span aria-hidden="true">↗</span></a><Link className="text-link" href="/methodology">Read the methods <span aria-hidden="true">↗</span></Link></div></section>
    <section><h2>Begin with one question</h2><p>Start with the pacing pattern, then follow the next question or choose another of the ten.</p><Link className="text-link" href="/analyses/pacing-pattern">Explore your pacing pattern <span aria-hidden="true">↗</span></Link></section>
    <section><h2>What would you like to know?</h2><p>If there is a race question you wish Pace Notes could answer, send Andrew an idea for a new analysis.</p><Link className="text-link" href="/request-analysis">Request an analysis <span aria-hidden="true">↗</span></Link></section></div>
  </article>;
}
