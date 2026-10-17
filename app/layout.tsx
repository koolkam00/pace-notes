import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '@fontsource-variable/bricolage-grotesque/index.css';
// Site-wide CSS, in cascade order (the redesign spec, section 6.1): fonts, tokens, base, layout, the components
// (alphabetical), then the legacy rules split by owner from the old globals.css and story.css, which WP9 deletes.
// Section sheets are imported by their own route layouts and pages.
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components/badge.css';
import './styles/components/button.css';
import './styles/components/chips.css';
import './styles/components/forms.css';
import './styles/components/guess.css';
import './styles/components/marker.css';
import './styles/components/nugget-card.css';
import './styles/components/reading.css';
import './styles/components/receipt.css';
import './styles/components/scrolly.css';
import './styles/components/segmented.css';
import './styles/components/share.css';
import './styles/components/sheet.css';
import './styles/components/table.css';
import './styles/components/tag.css';
import './styles/components/values.css';
import './styles/legacy/shared.css';
import './styles/legacy/home.css';
import './styles/legacy/stories.css';
import './styles/legacy/analyses.css';
import './styles/legacy/courses.css';
import './styles/legacy/research.css';
import './styles/legacy/info.css';
import './styles/legacy/packs.css';
import './styles/legacy/runners.css';
import './styles/legacy/tools.css';
import { UnitLink as Link } from '@/components/UnitsProvider';
import UnitsProvider from '@/components/UnitsProvider';
import SiteHeader from '@/components/SiteHeader';
import SiteAnalytics from '@/components/SiteAnalytics';
import SectionTracker from '@/components/SectionTracker';
import { ExperimentHead } from '@/components/Experiment';
import CreatorCredit from '@/components/CreatorCredit';
import MotionToggle from '@/components/MotionToggle';
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

export const viewport = { themeColor: '#F5F0E6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The experiments script (ExperimentHead) names this tab's variants on <html> before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head><script type="module" async dangerouslySetInnerHTML={{ __html: RELOAD_ON_FAILED_FILE }} /><ExperimentHead /></head>
      <body><UnitsProvider>
        <a className="skip-link" href="#main">Skip to content</a>
        <SiteHeader
          brand={<div className="header-brand">
            <Link href="/" className="site-title"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Pace Notes</span></Link>
            <span className="header-credit">by Andrew Kam</span>
          </div>}
          menuIcon={<><span className="nav-toggle-label">Menu</span><svg viewBox="0 0 10 6" width="10" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></>}
        />
        <main id="main" className="container main-content">{children}</main>
        <footer className="container footer">
          <div className="footer-brand"><Link href="/">Pace Notes</Link><p>Every split tells part of the story. Free to explore and download.</p><CreatorCredit /><MotionToggle /></div>
          <nav aria-label="More research">
            <Link href="/tools/plan">Plan your race</Link>
            <Link href="/runners">Analyze a past race</Link>
            <Link href="/courses">Courses</Link>
            <Link href="/tools">Runner tools</Link>
            <Link href="/research">Research</Link>
            <Link href="/about">About the study</Link>
            <Link href="/request-analysis">Request an analysis</Link>
            <Link href="/methodology">Methods &amp; sources</Link>
            <Link href="/packs">Research archive</Link>
            <Link href="/privacy">Privacy &amp; analytics</Link>
            <a href="https://github.com/koolkam00/htw-live-study/releases">Download the data ↗</a>
          </nav>
        </footer>
        <SiteAnalytics />
        <SectionTracker />
      </UnitsProvider></body>
    </html>
  );
}
