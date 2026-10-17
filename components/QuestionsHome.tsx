import ResearchQuestion from './ResearchQuestion';
import Link from 'next/link';
import { getQuestions } from '@/lib/research-data';
import { forPage } from '@/lib/research-display';
import { THEMES } from '@/lib/question-catalog';

export default function QuestionsHome() {
  const questions = getQuestions();
  return (
    <div className="questions">
      <section className="study-intro">
        <h1>Marathon pacing,<br />split by split.</h1>
        <p>Research on how runners start, adapt, finish, and improve.</p>
        <p><Link href="/your-race" className="guide-entry">Explore 12 questions for your course, age and target time</Link></p>
      </section>
      <nav className="theme-nav" aria-label="Research themes">
        {THEMES.map(theme => <a key={theme.id} href={`#theme-${theme.id}`}>{theme.title}</a>)}
      </nav>
      <details className="question-index" id="contents">
        <summary>Explore all {questions.length} questions</summary>
        <nav aria-label="Research questions">
          <ol className="contents-list">
            {questions.map(q => <li key={q.id}><a href={`#q-${q.id}`}><span className="contents-number">{String(q.number).padStart(2, '0')}</span><span>{q.title}</span></a></li>)}
          </ol>
        </nav>
      </details>
      <div className="question-list">
        {THEMES.map(theme => <section className="research-theme" id={`theme-${theme.id}`} key={theme.id} aria-labelledby={`theme-title-${theme.id}`}>
          <h2 className="theme-title" id={`theme-title-${theme.id}`}>{theme.title}</h2>
          {questions.filter(question => question.theme === theme.id).map(question => <ResearchQuestion key={question.id} question={forPage(question)} headingLevel={3} />)}
        </section>)}
      </div>
    </div>
  );
}
