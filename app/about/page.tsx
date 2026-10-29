import InfoNext from '@/components/InfoNext';
import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import { CHAPTERS } from '@/lib/chapters';
import { getInsightsManifest } from '@/lib/insights-server';
import { finishesM } from '@/lib/nuggets';
import { countWord } from '@/lib/nuggets/format';
import { pageMetadata } from '@/lib/seo';
import { toolBySlug, toolHref } from '@/lib/tools/registry';
import { halfLive } from '@/components/half/HalfWays';

export const metadata = pageMetadata({
  title: 'About Pace Notes: Marathon Pacing Research',
  description: 'What Pace Notes is, where to start, why it exists, who makes it, and where to check its numbers or download the data.',
  path: '/about',
});

type Way = { href: string; goal: string; name: string };

/**
 * The ways in, by what a visitor came to do: the goal in their words, then the page's own name. The tools' names come
 * from lib/tools/registry.ts and the runner search's from lib/chapters.ts; a tool whose data file is not in the verified
 * manifest drops out, as on /tools. "Research" and "Downloads" are the header's and How we know's own names.
 */
function ways(): Way[] {
  const files = getInsightsManifest().files;
  const tool = (slug: string, goal: string): Way | null => {
    const t = toolBySlug(slug);
    return t && (!t.file || files[t.file]) ? { href: toolHref(t), goal, name: t.title } : null;
  };
  const runners = CHAPTERS.flatMap((c) => c.pages).find((p) => p.href === '/runners');
  return [
    tool('plan', 'Planning your next marathon'),
    tool('course-chooser', 'Choosing which marathon to run'),
    runners ? { href: runners.href, goal: 'Looking back at a race you ran', name: runners.title } : null,
    { href: '/research', goal: 'Seeing how marathons unfold', name: `Research: the race in ${countWord(CHAPTERS.length)} chapters` },
    halfLive() ? { href: '/half', goal: 'Running a half marathon', name: 'The half marathon' } : null,
    { href: '/methodology#downloads', goal: 'Using the data yourself', name: 'Downloads, on How we know' },
  ].filter((w): w is Way => !!w);
}

/**
 * About (the redesign spec, sections 7.15 and 00; the owner's orientation request, October 22, 2026): what Pace Notes
 * is, where to start, why it exists and how it is made. Functional copy, one short disclaimer and links to /methodology
 * ids only: every data-source, check and coverage sentence is on /methodology. The Where to start rows carry the
 * `steps` section id (the home page's three steps sent it until the October 20, 2026 redesign), so a view of them is
 * counted without a new id. How it is made says when it began and that it has no ads (the owner's choice, October 22,
 * 2026). "Request an analysis" is a link in the text, not a second button beside the footer's. Ends on the way into the
 * race (InfoNext).
 */
export default function AboutPage() {
  return <article className="info-page">
    <header className="info-hero">
      {/* Two sentences, two lines: the break falls after "number.", never mid-thought. */}
      <h1 className="t-title"><span className="title-line">A finish time is one number.</span> <span className="title-line">The race is the rest.</span></h1>
      <p className="info-dek">Pace Notes reads the recorded splits of {finishesM()} million marathon finishes, so you can see how races like yours went. It is free, and there is nothing to sign up for.</p>
    </header>
    <div className="info-body">
      <section className="info-section" aria-labelledby="about-start" data-track-section="steps">
        <h2 id="about-start" className="info-h2">Where to start</h2>
        <ul className="info-ways">
          {ways().map((w) => <li key={w.href}><Link href={w.href} className="info-way"><span className="info-way-text"><b>{w.goal}</b><span>{w.name}</span></span><Arrow /></Link></li>)}
        </ul>
      </section>
      <section className="info-section" aria-labelledby="about-why">
        <h2 id="about-why" className="info-h2">Why it exists</h2>
        <p>Runners choose a pace, a goal and a course with little to go on. A finish time says how a race ended, not how it unfolded. Pace Notes shows what happened, mat by mat, so you can make your own plan.</p>
        <p>It describes past races. It is not a training plan or a promise of a result.</p>
      </section>
      <section className="info-section" aria-labelledby="about-how">
        <h2 id="about-how" className="info-h2">How it is made</h2>
        <p>Pace Notes is made by Andrew Kam, from public race results and the questions runners ask before and after a marathon. It began at the end of August 2026 as a study of one thing, the <Link href="/methodology#sustained-slowdown" className="term-link">sustained slowdown</Link>, and grew from there. It has no ads, and the code behind every page is public.</p>
        <p>The detail is on How we know: <Link href="/methodology#sources">where the data comes from</Link>, <Link href="/methodology#release">how new data is checked before it reaches the pages</Link> and <Link href="/methodology#limits">what the numbers cannot show</Link>.</p>
        <p>Have a race question the data could answer? Send Andrew the idea: <Link href="/request-analysis">Request an analysis</Link>.</p>
      </section>
      <InfoNext />
    </div>
  </article>;
}
