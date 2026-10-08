import AnalyticsPreference from '@/components/AnalyticsPreference';
import { pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Privacy & Analytics | Pace Notes',
  description: 'How Pace Notes counts visits with cookieless analytics, what it never records, such as runner names and search text, and how to switch it off.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return <article className="about-page">
    <header className="directory-heading"><p className="eyebrow">Your visit</p><h1>Privacy &amp; analytics</h1><p>How we measure use of the site, and how you can switch it off.</p></header>
    <div className="about-body">
      <section><h2>Website analytics</h2><p>We use PostHog to count visits and understand which pages and features are useful. We record page views, whether a runner search finds results, opening a race comparison, changing analysis filters, unit preferences and clicks on data download links.</p><p>We use cookieless analytics. PostHog does not store an analytics identifier in your browser. It processes connection information, including your IP address and browser information, to estimate visitors using a hash on its servers. Visitor counts are estimates; this setup does not identify you by name or link your visits across days.</p><p>Events include the page path, referring website domain, browser and device type, and broad action categories. We exclude search text, runner names, selected record IDs, personal filter values, URL query strings and fragments. Session recordings, automatic click capture and advertising tracking are disabled.</p><p>PostHog processes analytics data on our behalf. Read <a href="https://posthog.com/privacy">PostHog’s privacy notice</a> and <a href="https://posthog.com/docs/privacy/data-collection#cookieless-tracking">its explanation of cookieless analytics</a>. Website hosting providers also process requests to deliver the site.</p></section>
      <section id="analytics-preference"><h2>Your analytics choice</h2><p>You can turn off analytics below. We also respect Do Not Track and Global Privacy Control browser signals. When you change this setting, we save only the preference in your browser’s local storage.</p><AnalyticsPreference /></section>
      <section><h2>Runner searches and site preferences</h2><p>Runner lookup uses public race records. Comparison filters and tool inputs, such as a goal time or recorded splits, can appear in the page address, so they can be included when you share a link and in requests to the website host. Runner-name searches are kept out of the page address: the search text stays in this browser tab’s history, so Back and Forward return to your results. Filters and search text are removed from PostHog analytics events. The site stores your miles or kilometres preference locally.</p><p>The public marathon dataset is separate from visitor analytics. Searching for a runner does not identify you as that runner.</p></section>
      <section><h2>Analysis requests</h2><p>The request page prepares a draft in your email app or Gmail. Your request is sent to Andrew only when you send that email. The website does not store your draft or include its contents in analytics.</p></section>
    </div>
  </article>;
}
