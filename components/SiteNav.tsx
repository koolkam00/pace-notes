'use client';
import { useEffect, useRef } from 'react';
import { UnitLink as Link } from './UnitsProvider';
import { usePathname } from 'next/navigation';

export default function SiteNav() {
  const path = usePathname() || '';
  const within = (route: string) => path === route || path.startsWith(route + '/');
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [path]);
  return <nav ref={ref} aria-label="Main navigation" className="main-nav">
    <Link href="/stories" aria-current={within('/stories') ? 'page' : undefined}>Stories</Link>
    <Link href="/analyses" aria-current={within('/analyses') ? 'page' : undefined}>Plan your race</Link>
    <Link href="/courses" aria-current={within('/courses') ? 'page' : undefined}>Courses</Link>
    <Link href="/runners" aria-current={within('/runners') ? 'page' : undefined}>Find a runner</Link>
    <Link href="/about" aria-current={path === '/about' ? 'page' : undefined}>About</Link>
    <Link href="/request-analysis" className="nav-request" aria-current={path === '/request-analysis' ? 'page' : undefined}>Request an analysis</Link>
    <a href="https://github.com/koolkam00/htw-live-study/releases" className="nav-data">Open data <span aria-hidden="true">↗</span></a>
  </nav>;
}
