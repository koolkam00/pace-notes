'use client';
import { UnitLink as Link } from './UnitsProvider';
import { usePathname } from 'next/navigation';

/**
 * The five main links, in the order of a runner's jobs: plan the next race (the orange pill, the site's primary action),
 * analyze a past one, then courses, tools and research. Under 1180 px they are the menu sheet's first rows, with a
 * quieter line under them for About, Request an analysis and the open data; from 1180 px they sit inline in the header
 * and those three are in the footer (components/MenuSheet.tsx, app/styles/components/menu.css). S1 pins the links, their
 * order and text, the one .nav-primary and the .nav-more line. The rows' arrows are drawn in CSS (menu.css), so the
 * menu carries no icon code.
 */
export default function SiteNav({ id }: { id?: string }) {
  const path = usePathname() || '';
  const within = (route: string) => path === route || path.startsWith(route + '/');
  const here = (on: boolean) => (on ? 'page' as const : undefined);
  // On the home page its hero holds both doors (the plan form and Analyze a past race), so from 1180 px the header leaves
  // those two out there (menu.css): one path to each page per screen. On a page whose own first screen holds its call to
  // action (a race report's actions, a qualifying race's check, the request form's send), the header's plan link steps
  // down to a plain link from 1180 px, so the screen has one orange control.
  const ownAction = path === '/report' || path === '/request-analysis' || /^\/tools\/qualifying\/[^/]+$/.test(path);
  return <nav id={id} aria-label="Main navigation" className="main-nav" {...(path === '/' ? { 'data-home': '' } : {})} {...(ownAction ? { 'data-quiet-primary': '' } : {})}>
    <Link href="/tools/plan" className="nav-primary nav-door" aria-current={here(within('/tools/plan'))}>Plan your race</Link>
    <Link href="/runners" className="nav-door" aria-current={here(within('/runners'))}>Analyze a past race</Link>
    <Link href="/courses" aria-current={here(within('/courses'))}>Courses</Link>
    <Link href="/tools" aria-current={here(within('/tools') && !within('/tools/plan'))}>Tools</Link>
    <Link href="/research" aria-current={here(['/research', '/stories', '/analyses', '/packs', '/slowdown'].some(within))}>Research</Link>
    <span className="nav-more">
      <Link href="/about" aria-current={here(path === '/about')}>About</Link>
      <Link href="/request-analysis" aria-current={here(path === '/request-analysis')}>Request an analysis</Link>
      <a href="https://github.com/koolkam00/pace-notes/releases">Open data <span aria-hidden="true">↗</span></a>
    </span>
  </nav>;
}
