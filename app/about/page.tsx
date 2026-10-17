import { UnitLink as Link, UnitText } from '@/components/UnitsProvider';
import CreatorCredit from '@/components/CreatorCredit';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'About Pace Notes: Marathon Pacing Research',
  description: 'Why Pace Notes exists, who made it, and how to ask Andrew Kam for a new marathon pacing analysis.',
  path: '/about',
});
export default function AboutPage() {
  return <article className="about-page"><header className="directory-heading"><p className="eyebrow">About the study</p><h1>More understanding.<br /><span><UnitText>Every kilometre.</UnitText></span></h1><p>A marathon result tells you the time. This study helps you see the race.</p></header>
    <div className="about-body"><section><h2>Why it exists</h2><p>Runners make decisions about pace, targets and courses with incomplete information. Pace Notes makes large collections of race results understandable and useful to explore.</p><p>Its ten main analyses follow the questions a runner might ask before or after a race: how people pace, what follows different starts, how conditions compare, and where improvement appears.</p><p>The study is a way to investigate your race, not an individual training plan or a promise of a result.</p><CreatorCredit /></section>
    <section><h2>Begin with one question</h2><p>Start with the pacing pattern, then follow the next question or choose another of the ten.</p><Link className="text-link" href="/analyses/pacing-pattern">Explore your pacing pattern <span aria-hidden="true">↗</span></Link></section>
    <section><h2>What would you like to know?</h2><p>If there is a race question you wish Pace Notes could answer, send Andrew an idea for a new analysis.</p><Link className="text-link" href="/request-analysis">Request an analysis <span aria-hidden="true">↗</span></Link></section></div>
  </article>;
}
