'use client';
import { useEffect, useRef } from 'react';
import { UnitLink as Link } from './UnitsProvider';
import { usePathname } from 'next/navigation';

export default function SiteNav() {
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
  return <nav ref={ref} aria-label="Main navigation" className="main-nav">
    <Link href="/stories" aria-current={within('/stories') ? 'page' : undefined}>Stories</Link>
    <Link href="/tools" aria-current={within('/tools') ? 'page' : undefined}>Tools</Link>
    <Link href="/analyses" aria-current={within('/analyses') ? 'page' : undefined}>Plan your race</Link>
    <Link href="/courses" aria-current={within('/courses') ? 'page' : undefined}>Courses</Link>
    <Link href="/runners" aria-current={within('/runners') ? 'page' : undefined}>Find a runner</Link>
    <Link href="/about" aria-current={path === '/about' ? 'page' : undefined}>About</Link>
    <Link href="/request-analysis" className="nav-request" aria-current={path === '/request-analysis' ? 'page' : undefined}>Request an analysis</Link>
    <a href="https://github.com/koolkam00/htw-live-study/releases" className="nav-data">Open data <span aria-hidden="true">↗</span></a>
  </nav>;
}
