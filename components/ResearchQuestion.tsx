'use client';
import { UnitLink as Link, useUnits } from './UnitsProvider';
import { unitText } from '@/lib/units';
import QuestionViz from './QuestionViz';
import type { PageAnswer } from '@/lib/research-display';

const linkedRaceQuestions = new Set(['r05_exceptional_vs_prior', 'r30_negative_split_success', 'r31_multiple_good_strategies', 'r32_where_pbs_are_gained', 'r12_fastest_by_ability', 's4_time_translation', 'r14_knowing_course', 'r20_pacing_personalities', 'r21_learn_from_blowup', 'r25_huge_kick_next', 'r24_interval_after_pb']);

export default function ResearchQuestion({ question, standalone = false, headingLevel }: { question: PageAnswer; standalone?: boolean; headingLevel?: 2 | 3 }) {
  const { units } = useUnits();
  const text = (value: string) => unitText(value, units);
  const Title = headingLevel === 3 ? 'h3' : headingLevel === 2 ? 'h2' : standalone ? 'h1' : 'h2';
  return <article className="question" id={`q-${question.id}`} aria-labelledby={`title-${question.id}`}>
    {question.aliases.map(alias => <span key={alias} id={`q-${alias}`} />)}
    <header>
      <span className="question-number">{question.number ? `Question ${String(question.number).padStart(2, '0')}` : 'The study'}</span>
      <Title className="question-title" id={`title-${question.id}`}>{text(question.title)}</Title>
    </header>
    <p className={question.available ? 'answer' : 'answer-state'}>{text(question.answer)}</p>
    {question.charts.map((spec, i) => <QuestionViz key={`${question.id}-${i}`} spec={spec} />)}
    {linkedRaceQuestions.has(question.id) && <p className="coverage-notice">Also explore <Link href="/analyses/starting-pace">opening pace and late slowing</Link> or <Link href="/runners">your race, conditions and peers</Link>.</p>}
    {question.related?.length ? <div className="source-links">{question.related.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}</div> : null}
  </article>;
}
