import Button from '@/components/ui/Button';
import { finishesM } from '@/lib/nuggets';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'About Pace Notes: Marathon Pacing Research',
  description: 'Why Pace Notes exists, who made it, and how to ask Andrew Kam for a new marathon pacing analysis.',
  path: '/about',
});

/**
 * About (the redesign spec, sections 7.15 and 00): short and personal. Who makes it, why it exists, and the one place
 * to ask for an analysis. Every data-source and coverage sentence is on /methodology.
 */
export default function AboutPage() {
  return <article className="info-page">
    <header className="info-hero">
      <p className="t-kicker">About</p>
      <h1 className="t-display">A finish time is one number. <em>The race</em> is the rest.</h1>
      <p className="info-dek">Pace Notes reads the recorded splits of {finishesM()} million marathon finishes, so a runner can see how races like theirs went.</p>
    </header>
    <div className="info-body">
      <section className="info-section" aria-labelledby="about-who">
        <h2 id="about-who" className="info-h2">Who makes it</h2>
        <p>Pace Notes is made by Andrew Kam, from public race results and the questions runners ask before and after a marathon.</p>
      </section>
      <section className="info-section" aria-labelledby="about-why">
        <h2 id="about-why" className="info-h2">Why it exists</h2>
        <p>Runners choose a pace, a goal and a course with little to go on. A finish time says how a race ended, not how it unfolded. Pace Notes shows what happened, mat by mat, in races like yours.</p>
        <p>It describes past races. It is not a training plan or a promise of a result.</p>
      </section>
      <section className="info-section info-ask" aria-labelledby="about-ask">
        <h2 id="about-ask" className="info-h2">Ask a question</h2>
        <p>Is there a race question you wish the data could answer? Send Andrew an idea for the next analysis.</p>
        {/* One way on: the open data is the footer's link, so it is not offered twice on this screen. */}
        <div className="info-actions">
          <Button href="/request-analysis" variant="secondary" arrow="right">Request an analysis</Button>
        </div>
      </section>
    </div>
  </article>;
}
