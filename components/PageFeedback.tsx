'use client';

import { usePathname } from 'next/navigation';
import { useId, useState } from 'react';
import { trackAnalytics } from '@/lib/analytics';
import type { AnalyticsEvents } from '@/lib/analytics-policy';

type Answer = AnalyticsEvents['page_feedback']['answer'];
type Reason = AnalyticsEvents['page_feedback_reason']['reason'];
const REASONS: readonly [Reason, string][] = [['hard_to_follow', 'Hard to follow'], ['not_what_i_needed', 'Not what I needed'], ['numbers_look_wrong', 'The numbers look wrong'], ['something_broke', 'Something didn’t work']];

/**
 * "Was this useful?" at the end of a story, tool or analysis: Yes or No and, after No, four fixed reasons. There is no
 * text box, so nothing a visitor types is ever sent. One answer per page view, held only in the page's memory.
 */
export default function PageFeedback({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const id = useId();
  const [given, setGiven] = useState<{ page: string; answer: Answer; reason?: Reason } | null>(null);
  // A new page (a client-side navigation can keep this component mounted) starts unanswered.
  const current = given?.page === pathname ? given : null;
  const answer = (value: Answer) => {
    if (current) return;
    setGiven({ page: pathname, answer: value });
    trackAnalytics('page_feedback', { answer: value });
  };
  const explain = (reason: Reason) => {
    if (!current || current.reason) return;
    setGiven({ ...current, reason });
    trackAnalytics('page_feedback_reason', { reason });
  };
  const done = current?.answer === 'yes' || !!current?.reason;
  return (
    <aside className={`page-feedback no-print ${className}`.trim()} aria-label="Feedback on this page">
      <div className="page-feedback-row">
        <p className="page-feedback-label" id={id + 'q'}>Was this useful?</p>
        <div className="page-feedback-options" role="group" aria-labelledby={id + 'q'}>
          {(['yes', 'no'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={current?.answer === value} aria-disabled={!!current} onClick={() => answer(value)}>{value === 'yes' ? 'Yes' : 'No'}</button>
          ))}
        </div>
      </div>
      {current?.answer === 'no' ? (
        <div className="page-feedback-row">
          <p className="page-feedback-label" id={id + 'r'}>What was the problem?</p>
          <div className="page-feedback-options" role="group" aria-labelledby={id + 'r'}>
            {REASONS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={current.reason === value} aria-disabled={!!current.reason} onClick={() => explain(value)}>{label}</button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="page-feedback-thanks" role="status">{done ? 'Thank you. That helps us improve the site.' : ''}</p>
    </aside>
  );
}
