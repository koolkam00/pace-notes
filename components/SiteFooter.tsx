import MotionToggle from './MotionToggle';
import { UnitLink as Link } from './UnitsProvider';

/**
 * The footer (the redesign spec, sections 2.8 and 00): the brand line, one row of links to the pages outside the race
 * (the five main links are in the header on every page) and the Motion switch, in under half a phone screen. Four
 * links, so the row is one line at 390 px (round 6): the open data is on How we know (#downloads) and in the menu.
 * S1 follows footer a[href="/privacy"] and S6 footer a[href="/about"].
 */
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-inner">
        <p className="site-footer-brand"><Link href="/" className="site-footer-home">Pace Notes</Link><span>by Andrew Kam</span></p>
        <nav className="site-footer-links" aria-label="About Pace Notes">
          <Link href="/methodology">How we know</Link>
          <Link href="/about">About</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/request-analysis">Request an analysis</Link>
        </nav>
        <MotionToggle />
      </div>
    </footer>
  );
}
