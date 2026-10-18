import AnalysisRequest from '@/components/AnalysisRequest';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Request an analysis | Pace Notes',
  description: 'Have a marathon question? Suggest the next analysis for Pace Notes to explore.',
  path: '/request-analysis',
  noindex: true,
});

/** Request an analysis (the redesign spec, section 7.15): the question, a little context, then an email draft. */
export default function RequestAnalysisPage() {
  return <article className="info-page">
    <header className="info-hero">
      <p className="t-kicker">Your question, next</p>
      <h1 className="t-display">What should we look at next?</h1>
      <p className="info-dek">Have a marathon question the data might answer? Send it to Andrew. Each idea needs enough reliable data to answer well, so not every one becomes a page.</p>
    </header>
    <div className="info-body">
      <AnalysisRequest />
    </div>
  </article>;
}
