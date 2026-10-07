import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/inter/index.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import '@fontsource-variable/bricolage-grotesque/index.css';
import './globals.css';
import './story.css';
import { UnitLink as Link, UnitSwitch } from '@/components/UnitsProvider';
import UnitsProvider from '@/components/UnitsProvider';
import SiteNav from '@/components/SiteNav';
import SiteAnalytics from '@/components/SiteAnalytics';
import CreatorCredit from '@/components/CreatorCredit';
import MotionToggle from '@/components/MotionToggle';

export const metadata = {
  title: 'Pace Notes | Understand your next 26.2 miles',
  description: 'What 3.5 million marathon finishes reveal about pacing: interactive stories, race replays and ten essential runner questions.',
  // Tool inputs (goals, race times) live in the page URL; send only the origin as the referrer, even to this site.
  referrer: 'strict-origin',
};

export const viewport = { themeColor: '#F5F0E6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><UnitsProvider>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="container header-inner">
            <div className="header-brand">
              <Link href="/" className="site-title"><span className="brand-mark" aria-hidden="true"><i /><i /><i /></span><span>Pace Notes</span></Link>
              <span className="header-credit">by Andrew Kam</span>
            </div>
            <div className="header-controls"><SiteNav /><UnitSwitch /></div>
          </div>
        </header>
        <main id="main" className="container main-content">{children}</main>
        <footer className="container footer">
          <div className="footer-brand"><Link href="/">Pace Notes</Link><p>Every split tells part of the story. Pacing patterns from millions of recorded marathon finishes, free to explore and download.</p><CreatorCredit /><MotionToggle /></div>
          <nav aria-label="More research">
            <Link href="/tools">Runner tools</Link>
            <Link href="/stories">Stories from the data</Link>
            <Link href="/analyses">Plan your race</Link>
            <Link href="/runners">Find a runner</Link>
            <Link href="/courses">Courses</Link>
            <Link href="/request-analysis">Request an analysis</Link>
            <Link href="/about">About the study</Link>
            <Link href="/methodology">Methods &amp; sources</Link>
            <Link href="/packs">Research archive</Link>
            <Link href="/privacy">Privacy &amp; analytics</Link>
            <a href="https://github.com/koolkam00/htw-live-study/releases">Download the data ↗</a>
          </nav>
        </footer>
        <SiteAnalytics />
      </UnitsProvider></body>
    </html>
  );
}
