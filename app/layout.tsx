// Site-wide CSS, in cascade order, from one sheet (app/styles/site.css lists it; the redesign spec, section 6.1).
// Section sheets are imported by their own route layouts and pages.
import './styles/site.css';
import { UnitLink as Link } from '@/components/UnitsProvider';
import UnitsProvider from '@/components/UnitsProvider';
import SiteHeader from '@/components/SiteHeader';
import SiteAnalytics from '@/components/SiteAnalytics';
import SectionTracker from '@/components/SectionTracker';
import { ExperimentHead } from '@/components/Experiment';
import SiteFooter from '@/components/SiteFooter';
import ChapterList from '@/components/ui/ChapterList';
import type { Metadata } from 'next';
import { DEFAULT_OG_IMAGE, OG_IMAGE_SIZE, OG_LOCALE, SITE_NAME, SITE_URL, finishesM } from '@/lib/seo';
import { RELOAD_ON_FAILED_FILE } from '@/lib/chunk-reload';

// Site-wide defaults only. Pages set their own title, description, canonical and full openGraph through
// pageMetadata() in lib/seo.tsx. Never put a canonical, openGraph.url or title.template here (docs/SEO.md).
export const metadata: Metadata = {
  // Hard-coded so canonical and social URLs never fall back to a Vercel deployment host.
  metadataBase: new URL(SITE_URL),
  title: 'Pace Notes | Understand your next 26.2 miles',
  description: `What ${finishesM()} million recorded marathon finishes reveal about pacing: interactive stories, race replays and ten essential runner questions.`,
  openGraph: { type: 'website', siteName: SITE_NAME, locale: OG_LOCALE, images: [{ url: DEFAULT_OG_IMAGE, ...OG_IMAGE_SIZE, alt: SITE_NAME }] },
  twitter: { card: 'summary_large_image', images: [DEFAULT_OG_IMAGE] },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  // Tool inputs (goals, race times) live in the page URL; send only the origin as the referrer, even to this site.
  referrer: 'strict-origin',
};

// The page theme's paper, light and dark (app/styles/tokens.css --paper), so the browser bar matches the page the system
// setting chose (spec section 3.9).
export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F0E6' },
    { media: '(prefers-color-scheme: dark)', color: '#111419' },
  ],
};

// Without JavaScript the header's Menu and Chapters buttons, the footer's Motion switch and a guess's Lock it in and Skip
// cannot work, so they are hidden: a plain link to the contents stands in for Menu on a phone (components/SiteHeader.tsx,
// .nav-fallback; under 300 px, 200% zoom, without its side padding, so it ends at the gutter instead of 3 px past the
// screen), and a guess shows itself as Skip would (components/ui/GuessFirst.client.tsx): its answer from a <noscript>,
// the truth's dots lit (.is-truth-ns) and its ruler mark shown, with no readout, slider or You rings for a guess nobody
// made. A scrubber's "‹ drag ›" promises a move that cannot happen, so it goes too (round 4 review, October 31, 2026), and
// so do its crown under the axis and the words that say how to slide it (.js-only: a beat's `how`, the half story's
// "Find your half below."); the needle stays as a still marker over its readout, and the slider is no focus stop until
// its island runs (round 5 review).
const NO_SCRIPT_STYLE = '<style>'
  + '.nav-toggle,.chapters-toggle,.motion-toggle,.guess-actions,.guess-ask,.guess-range,.guess-key-you,.guess .guess-mark.is-you,.guess .guess-mark-label.is-you,.scrub-crown-row,.js-only{display:none!important}'
  + '@media (max-width:1179.98px){.nav-fallback{display:inline-flex!important}}@media (max-width:299.98px){.nav-fallback{padding:0!important}}'
  + '.guess .guess-dot.is-you{box-shadow:none!important}.guess .guess-dot.is-truth-ns{border-color:var(--signal)!important;background:var(--signal)!important}'
  + '.guess .guess-mark.is-truth,.guess .guess-mark.is-compare{opacity:1!important;transform:none!important}.guess .guess-mark-label.is-truth,.guess .guess-key{opacity:1!important}'
  + '.guess .guess-dots-name.is-truth b{color:var(--signal-ink)}'
  + '</style>';

// The two faces every page sets first (Fraunces headings, Inter text), self-hosted under the base path (spec 6.3).
const FONT_BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const PRELOAD_FONTS = ['fraunces-latin-opsz-normal.woff2', 'inter-latin-wght-normal.woff2'];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The experiments script (ExperimentHead) names this tab's variants on <html> before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head>{PRELOAD_FONTS.map((file) => <link key={file} rel="preload" as="font" type="font/woff2" crossOrigin="anonymous" href={`${FONT_BASE}/fonts/${file}`} />)}<script type="module" async dangerouslySetInnerHTML={{ __html: RELOAD_ON_FAILED_FILE }} /><ExperimentHead /><noscript dangerouslySetInnerHTML={{ __html: NO_SCRIPT_STYLE }} /></head>
      <body><UnitsProvider>
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader
          brand={<div className="header-brand">
            <Link href="/" className="site-title"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Pace Notes</span></Link>
            <span className="header-credit">by Andrew Kam</span>
          </div>}
          chapters={<ChapterList variant="compact" />}
        />
        <main id="main" className="container main-content">{children}</main>
        <SiteFooter />
        <SiteAnalytics />
        <SectionTracker />
      </UnitsProvider></body>
    </html>
  );
}
