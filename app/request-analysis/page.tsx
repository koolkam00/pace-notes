import AnalysisRequest from '@/components/AnalysisRequest';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Request an analysis | Pace Notes',
  description: 'Have a marathon question? Suggest the next analysis for Pace Notes to explore.',
  path: '/request-analysis',
  noindex: true,
});

export default function RequestAnalysisPage() {
  return <article className="request-page">
    <header className="directory-heading"><p className="eyebrow">Your questions, next</p><h1>What should we<br />explore next?</h1><p>Have a marathon question the data might answer? Send your idea to Andrew.</p></header>
    <AnalysisRequest />
    <section className="request-expectations"><h2>A good question is a starting point.</h2><p>Ideas help shape what gets added to Pace Notes. Each analysis needs enough reliable data to offer a useful answer, so every request may not become a new page.</p><Link className="text-link" href="/analyses">See what we already explore <span aria-hidden="true">↗</span></Link></section>
  </article>;
}
