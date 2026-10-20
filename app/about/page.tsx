import InfoNext from '@/components/InfoNext';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { finishesM } from '@/lib/nuggets';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'About Pace Notes: Marathon Pacing Research',
  description: 'Why Pace Notes exists, who made it, and how to ask Andrew Kam for a new marathon pacing analysis.',
  path: '/about',
});

/**
 * About (the redesign spec, sections 7.15 and 00): short and personal. Who makes it and why it exists, then one way
 * into the race (chapter 01): a reader who lands here from a share is never left at the footer. How to reach Andrew
 * ("Request an analysis") is a link in the text, not a second button beside the footer's. Every data-source and
 * coverage sentence is on /methodology.
 */
export default function AboutPage() {
  return <article className="info-page">
    <header className="info-hero">
      {/* Two sentences, two lines: the break falls after "number.", never mid-thought. */}
      <h1 className="t-title"><span className="title-line">A finish time is one number.</span> <span className="title-line">The race is the rest.</span></h1>
      <p className="info-dek">Pace Notes reads the recorded splits of {finishesM()} million marathon finishes, so a runner can see how races like theirs went.</p>
    </header>
    <div className="info-body">
      <section className="info-section" aria-labelledby="about-who">
        <h2 id="about-who" className="info-h2">Who makes it</h2>
        <p>Pace Notes is made by Andrew Kam, from public race results and the questions runners ask before and after a marathon.</p>
        <p>Have a race question the data could answer? Send Andrew the idea: <Link href="/request-analysis">Request an analysis</Link>.</p>
      </section>
      <section className="info-section" aria-labelledby="about-why">
        <h2 id="about-why" className="info-h2">Why it exists</h2>
        <p>Runners choose a pace, a goal and a course with little to go on. A finish time says how a race ended, not how it unfolded. Pace Notes shows what happened, mat by mat, in races like yours.</p>
        <p>It describes past races. It is not a training plan or a promise of a result.</p>
      </section>
      <InfoNext />
    </div>
  </article>;
}
