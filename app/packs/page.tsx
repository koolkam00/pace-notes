import Link from 'next/link';
import { QUESTIONS, EXTRA_TITLES, THEMES } from '@/lib/question-catalog';
import { PERSONAL_QUESTIONS } from '@/lib/personalized-catalog';
import { broaderArchive } from '@/lib/broader-analysis-catalog';

export const metadata = { title: 'Research archive | Pace Notes', description: 'The broader research archive: every extension question calculated from the current marathon race records.' };
export default function AnalysesPage() {
  return <div className="prose">
    <h1>The research archive.</h1>
    <p className="answer-detail">The wider work behind the study: {QUESTIONS.length} questions about race strategy, conditions, goals, runner differences, and improvement.</p>
    <p>New here? <Link href="/analyses">Start with the ten essential analyses</Link> for a guided, personalized view of the strongest results.</p>
    <p>Weather, course patterns, slow starts and opening consistency now include finishes without an earlier race. Their original recorded-history comparisons remain available. Personal improvement, repeat-race learning and course familiarity still need linked results.</p>
    <p><Link href="/analyses/downhill-start">Explore downhill starts and later slowing ↗</Link></p>
    <details className="methodology"><summary>Full personalized research guide</summary><div className="methodology-content"><p>All twelve underlying comparisons, including returning runners and downhill starts.</p><ol className="contents-list">{PERSONAL_QUESTIONS.map((q, i) => <li key={q.id}><Link href={`/research/personalized#guide-${q.id}`}><span className="contents-number">{i + 1}</span><span>{q.title}</span></Link></li>)}</ol></div></details>
    {THEMES.map(theme => <section key={theme.id} aria-labelledby={`index-${theme.id}`}>
      <h2 id={`index-${theme.id}`}>{theme.title}</h2>
      <ol className="contents-list">{QUESTIONS.filter(question => question.theme === theme.id).map(question => <li key={question.id}><Link href={`/packs/${question.id}`}><span className="contents-number">{question.number}</span><span>{broaderArchive(question.id)?.title || question.title}</span></Link></li>)}</ol>
    </section>)}
    <h2>Supporting analyses</h2>
    <ul className="course-list">{Object.entries(EXTRA_TITLES).map(([id, title]) => <li key={id}><Link href={id === 'smyth_htw' ? '/slowdown' : `/packs/${id}`}>{title}</Link></li>)}</ul>
  </div>;
}
