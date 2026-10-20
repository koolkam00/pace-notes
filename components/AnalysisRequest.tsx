'use client';

import { useState, type FormEvent } from 'react';

const recipient = 'andrew.kam00@gmail.com';
const subject = 'Pace Notes — analysis request';

export default function AnalysisRequest() {
  const [question, setQuestion] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const message = `Analysis idea\n${question.trim()}${details.trim() ? `\n\nMore context\n${details.trim()}` : ''}\n\nSent from Pace Notes\nhttps://splithappens.run/request-analysis`;
  const mailto = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(recipient)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;

  function prepareEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) {
      setError('Add the question you would like us to explore.');
      document.getElementById('analysis-question')?.focus();
      return;
    }
    setError('');
    setStatus('Finish sending in your email app. If it did not open, use Gmail or copy your request below.');
    window.location.href = mailto;
  }

  async function copyRequest() {
    try {
      await navigator.clipboard.writeText(`To: ${recipient}\nSubject: ${subject}\n\n${message}`);
      setStatus('Request copied. Paste it into an email to Andrew and send it when you are ready.');
    } catch {
      setStatus(`Copy your question from the fields above and email it to ${recipient}.`);
    }
  }

  return <div className="analysis-request">
    <form className="request-form" action={`mailto:${recipient}`} method="post" encType="text/plain" onSubmit={prepareEmail}>
      <div className="request-field">
        <label htmlFor="analysis-question">What would you like to understand?</label>
        <textarea id="analysis-question" name="Question" rows={3} required maxLength={160} value={question} aria-describedby="question-hint" aria-invalid={error ? true : undefined} onChange={event => { setQuestion(event.target.value); setError(''); setStatus(''); }} />
      </div>
      <p className="request-hint" id="question-hint">For example: do runners slow down differently on warmer race days?</p>
      <div className="request-field">
        <label htmlFor="analysis-details">A little more context <span>(optional)</span></label>
        <textarea id="analysis-details" name="Context" rows={4} maxLength={1000} value={details} aria-describedby="details-hint" onChange={event => { setDetails(event.target.value); setStatus(''); }} />
      </div>
      <p className="request-hint" id="details-hint">Which runners, races or comparisons do you have in mind?</p>
      {error && <p className="request-error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit"><span>Open email draft</span></button>
      <p className="request-note">It opens your email app with your request. Review it and press Send to email Andrew. Nothing is sent from this page.</p>
    </form>
    {status && <p className="request-status" role="status">{status}</p>}
    <div className="request-other">
      <span>Prefer another way?</span>
      {question.trim() && <><a href={gmail} target="_blank" rel="noopener noreferrer">Open the draft in Gmail</a><button type="button" onClick={() => void copyRequest()}>Copy the request</button></>}
      <a href={`mailto:${recipient}?subject=${encodeURIComponent(subject)}`}>{recipient}</a>
    </div>
  </div>;
}
