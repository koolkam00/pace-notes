'use client';
import { useEffect, useRef } from 'react';
import { UnitLink as Link } from './UnitsProvider';
import { usePathname } from 'next/navigation';

/**
 * The five main links at every width, in the order of a runner's jobs: plan the next race (the orange pill, the site's
 * primary action), analyze a past one, then courses, tools and research. On phones they open from the header's Menu
 * button (SiteHeader) as pills, with a quieter line under them for About, Request an analysis and the open data;
 * wider screens show only the five, and those three are in the footer. `onFollow` runs when a link is followed.
 */
export default function SiteNav({ id, onFollow }: { id?: string; onFollow?: () => void }) {
  const path = usePathname() || '';
  const within = (route: string) => path === route || path.startsWith(route + '/');
  const ref = useRef<HTMLElement>(null);
  // On phones the nav scrolls sideways: bring the current page into view only when it is cut off.
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return;
    const outer = nav.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    if (box.left < outer.left || box.right > outer.right) nav.scrollLeft += box.left - outer.left - (outer.width - box.width) / 2;
  }, [path]);
  // Fade an edge only while more links lie beyond it.
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const update = () => {
      nav.toggleAttribute('data-more-left', nav.scrollLeft > 1);
      nav.toggleAttribute('data-more-right', nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    };
    update();
    nav.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => { nav.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, [path]);
  return <nav ref={ref} id={id} aria-label="Main navigation" className="main-nav" onClick={(event) => { if ((event.target as Element).closest('a')) onFollow?.(); }}>
    <Link href="/tools/plan" className="nav-primary" aria-current={within('/tools/plan') ? 'page' : undefined}>Plan your race</Link>
    <Link href="/runners" aria-current={within('/runners') ? 'page' : undefined}>Analyze a past race</Link>
    <Link href="/courses" aria-current={within('/courses') ? 'page' : undefined}>Courses</Link>
    <Link href="/tools" aria-current={within('/tools') && !within('/tools/plan') ? 'page' : undefined}>Tools</Link>
    <Link href="/research" aria-current={['/research', '/stories', '/analyses', '/packs', '/slowdown'].some(within) ? 'page' : undefined}>Research</Link>
    <span className="nav-more">
      <Link href="/about" aria-current={path === '/about' ? 'page' : undefined}>About</Link>
      <Link href="/request-analysis" aria-current={path === '/request-analysis' ? 'page' : undefined}>Request an analysis</Link>
      <a href="https://github.com/koolkam00/pace-notes/releases">Open data <span aria-hidden="true">↗</span></a>
    </span>
  </nav>;
}
