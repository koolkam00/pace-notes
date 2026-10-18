import AnalyticsPreference from '@/components/AnalyticsPreference';
import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import type { AnalyticsEvents } from '@/lib/analytics-policy';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Privacy & Analytics | Pace Notes',
  description: 'How Pace Notes counts visits and records anonymous session replays, what it never records, such as runner names or what you type, and how to turn it off.',
  path: '/privacy',
});

// What each action PostHog counts means, in plain words. Every event in lib/analytics-policy.ts must be here
// (verify-analytics checks it), so a new event cannot be collected without being described.
const COUNTED: Record<keyof AnalyticsEvents, string> = {
  runner_search_submitted: 'starting a runner search',
  runner_search_completed: 'whether a runner search finds results, and roughly how many: none, one, two to five, or six or more',
  runner_profile_opened: 'opening a runner’s race records',
  race_comparison_opened: 'opening a race comparison',
  analysis_filters_applied: 'changing analysis filters: which analysis, and whether one course or all courses, never the values chosen',
  data_download_clicked: 'clicks on data download links',
  units_changed: 'choosing miles or kilometers',
  tool_used: 'whether a tool was used, printed or its link copied, never what you entered',
  page_feedback: 'your answer to “Was this useful?”',
  page_feedback_reason: 'the reason you pick after answering “No”, from four fixed choices',
  site_error: 'the kind of error if something breaks, such as a file that did not load, never its message',
  section_viewed: 'which parts of a page, such as the home page’s sections, come into view',
  report_exported: 'saving a race report as an image, or sharing it, never what it shows',
};
// Measured in the browser (by PostHog or the site) or added to every event, rather than counted as an action.
const MEASURED = [
  'how long a page stays open and how far down it is scrolled',
  'page-speed measurements: how quickly a page appears, responds and stays still while it loads',
  'the fixed tags on our own Instagram links, such as whether a visit came from the bio or a story; any other tags in a link are ignored',
  'which version of a page you were shown, when we test two designs',
];

/** The plus that turns into a minus as a fold opens (app/styles/pages/info.css). */
const Glyph = () => <span className="fold-glyph" aria-hidden="true" />;

/**
 * Privacy & analytics (the redesign spec, sections 7.15, 6.7 and 00): four short facts, the visitor's switch, then the
 * full account in folds: what is counted (the COUNTED list names every event, verify-analytics), what replays show,
 * what identifies a visitor and what does not, what stays on this device, and analysis requests.
 */
export default function PrivacyPage() {
  return <article className="info-page">
    <header className="info-hero">
      <p className="t-kicker">Your visit</p>
      <h1 className="t-title">Privacy &amp; analytics</h1>
      <p className="info-dek">How we measure use of the site, what we never record, and how to switch it off.</p>
    </header>
    <div className="info-body">
      <ul className="info-facts">
        <li>We count visits and a few actions, to find problems and fix them.</li>
        <li>Anonymous replays show the page and where you click. What you type is masked, and runner searches, names and race reports are never recorded.</li>
        <li>No cookies, and nothing identifies you by name. A random ID lives in this tab and goes away when the tab is closed.</li>
        <li>Do Not Track, Global Privacy Control and the switch below turn all of it off.</li>
      </ul>
      <section className="info-choice" id="analytics-preference" aria-labelledby="privacy-choice">
        <h2 id="privacy-choice" className="sr-only">Your analytics choice</h2>
        <AnalyticsPreference />
      </section>
      <div className="info-folds">
        <details className="fold">
          <summary><h2 className="fold-title">What we count</h2><Glyph /></summary>
          <div className="fold-body">
            <p>We use PostHog to count visits and to see how the site is used, so we can find problems and fix them. PostHog counts page views and these actions:</p>
            <ul>{Object.values(COUNTED).map((text) => <li key={text}>{text}</li>)}</ul>
            <p>With each visit it also notes:</p>
            <ul>{MEASURED.map((text) => <li key={text}>{text}</li>)}</ul>
          </div>
        </details>
        <details className="fold">
          <summary><h2 className="fold-title">Session replays</h2><Glyph /></summary>
          <div className="fold-body">
            <p>PostHog also records anonymous session replays of visits: what is on screen, mouse movement, clicks and scrolling. We watch them to understand how pages are used and to spot anything that is broken or confusing.</p>
            <p>What you type into a form is masked in your browser before it is sent, and so is the text of the tool and analysis panels that respond to it, such as your goal time or age group. The tools’ results, the charts in those panels and the gender or division you choose in a tool are left out of replays. A replay still shows the layout of the page and where you click. Runner-search pages, runner names, race reports and pages opened from a runner’s results are never recorded. Page and link addresses are recorded without query strings or anything after a “#”. No console logs or network requests are recorded.</p>
            <p>Recordings are kept for 30 days and then deleted. Do Not Track, Global Privacy Control and the switch above stop recordings and all other analytics.</p>
          </div>
        </details>
        <details className="fold">
          <summary><h2 className="fold-title">What identifies you, and what does not</h2><Glyph /></summary>
          <div className="fold-body">
            <p>A random ID for your browser tab links the visits made in that tab. It is kept in that tab’s session storage and goes away when the tab is closed, although a tab your browser restores or duplicates keeps it; if your browser blocks session storage, it is kept only in the open page. We do not use cookies, and nothing identifies you by name.</p>
            <p>Events include the page path, referring website domain, browser and device type, and broad action categories. We exclude search text, runner names, selected record IDs, personal filter values, URL query strings and fragments. Like any website service, PostHog receives your IP address with each request. It uses the address to estimate the visit’s country and city and to spot automated traffic, then discards it, so the address is not stored. Automatic click capture and advertising tracking are off.</p>
            <p>PostHog processes analytics data on our behalf. Read <a href="https://posthog.com/privacy">PostHog’s privacy notice</a> and <a href="https://posthog.com/docs/session-replay/privacy">how its session replays mask data</a>. Website hosting providers also process requests to deliver the site.</p>
          </div>
        </details>
        <details className="fold">
          <summary><h2 className="fold-title">Runner searches, and what stays on this device</h2><Glyph /></summary>
          <div className="fold-body">
            <p>Runner lookup uses public race records. Comparison filters and tool inputs, such as a goal time or recorded splits, can appear in the page address, so they can be included when you share a link and in requests to the website host. Runner-name searches are kept out of the page address: the search text stays in this browser tab’s history, so Back and Forward return to your results. Filters and search text are removed from PostHog analytics events, and runner-search pages are never recorded.</p>
            <p>If you open a page from a runner’s results, this tab notes only that fact in its session storage, so the pages you reach from there in this tab are not recorded either, even after a reload, until you open another part of the site. The site stores your miles or kilometers preference locally, and your analytics choice when you change it. When we test two designs of a page, this tab’s session storage keeps which one you were given, so the page stays the same while the tab is open; it holds nothing else, and goes away when the tab is closed. If a page’s files fail to load, the tab also notes the time it reloaded the page, so it does not keep reloading.</p>
            <p>The public marathon dataset is separate from visitor analytics. Searching for a runner does not identify you as that runner.</p>
          </div>
        </details>
        <details className="fold">
          <summary><h2 className="fold-title">Analysis requests</h2><Glyph /></summary>
          <div className="fold-body">
            <p>The request page prepares a draft in your email app or Gmail. Your request is sent to Andrew only when you send that email. The website does not store your draft or include its contents in analytics, and session replays mask what you type.</p>
          </div>
        </details>
      </div>
      <p className="info-next"><Link href="/research" className="info-next-link">Back to Contents<Arrow /></Link></p>
    </div>
  </article>;
}
