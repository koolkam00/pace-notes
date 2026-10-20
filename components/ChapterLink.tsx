'use client';
import { useEffect, useState, type ComponentProps } from 'react';
import { usePathname } from 'next/navigation';
import { UnitLink } from './UnitsProvider';

/** A goal in the address, as whole minutes from 1:30 to 12:00 (goal=4:00 or goal=240), else 0. */
const goalOf = (search: string) => {
  const m = /^(?:(\d{1,2}):(\d\d)(?::\d\d)?|(\d{2,3}))$/.exec(new URLSearchParams(search).get('goal') || '');
  const minutes = m ? (m[3] ? +m[3] : +m[1] * 60 + +m[2]) : 0;
  return minutes >= 90 && minutes <= 720 ? minutes : 0;
};

/** A clean path with the goal added: whole minutes for an analysis, h:mm for every other page. */
export const withGoal = (href: string, minutes: number) => (minutes
  ? `${href}?goal=${href.startsWith('/analyses/') ? minutes : `${(minutes / 60) | 0}:${String(minutes % 60).padStart(2, '0')}`}`
  : href);

/**
 * A link along the race (the menu's chapters, the rail, next cards): a UnitLink (units=km when chosen) that also carries
 * the reader's goal when the page's address has one, so a goal set on a tool or an analysis follows the reader from page
 * to page. The goal is added in the browser after hydration, never in the server HTML, and read again just before a
 * click, since tools rewrite their address in place. `href` is a clean path from lib/chapters.ts.
 *
 * `match` marks the link as the reader's place (aria-current="true", "You are here"): the paths of a chapter's pages,
 * and prefixes ending in "/" for its children. Read from the page's own path, so it is right in the server HTML too.
 */
export default function ChapterLink({ href, match, ...props }: ComponentProps<typeof UnitLink> & { href: string; match?: readonly string[] }) {
  const path = usePathname() || '';
  const [goal, setGoal] = useState(0);
  const read = () => setGoal(goalOf(window.location.search));
  useEffect(read, [path]);
  const here = match?.some((m) => (m.endsWith('/') ? path.startsWith(m) && path !== m : path === m));
  return <UnitLink aria-current={here ? 'true' : undefined} {...props} href={withGoal(href, goal)} onPointerDown={read} onFocus={read} />;
}
