// Kept out of components/tools/ui.tsx, which every tool page loads: only the predictor and the pace calculator show these.
import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { formatDuration, formatHM } from '@/lib/tools/time';
import { paceBandGoalHref, pacingPatternHref } from '@/lib/tools/links';

/**
 * Next steps from a result: cards that open another tool or analysis with the result filled in. The value travels in
 * the link's query only (analytics keeps a page's path alone), and the page it opens shows it in its own masked
 * workspace, as if typed. Following a link is not a tool edit: components/SiteAnalytics.tsx counts typing, choices
 * and buttons.
 */
export function ToolHandoffs({ label, links }: { label: string; links: { href: string; title: string; text: ReactNode; accent: string }[] }) {
  if (!links.length) return null;
  return (
    <nav className="tool-handoffs no-print" aria-label={label}>
      <p className="tool-handoffs-label">{label}</p>
      <ul>
        {links.map((l) => (
          <li key={l.href} style={{ ['--tool' as string]: l.accent }}>
            {/* A no-break space keeps the arrow on the title's last line. */}
            <Link href={l.href}><b>{l.title}{'\u00a0'}<span aria-hidden="true">→</span></b><span>{l.text}</span></Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Where a marathon time (whole seconds) goes next: a pace band for it, and how finishes near it were paced. Both open at
 * the whole minute at or below it, the way every tool hands a time on (4:11:41 is 4:11), and the band says so.
 */
export function MarathonHandoffs({ label, seconds }: { label: string; seconds: number }) {
  const minutes = Math.floor(seconds / 60);
  const band = paceBandGoalHref(minutes);
  const pacing = pacingPatternHref(minutes);
  const time = formatHM(minutes * 60);
  const below = seconds % 60 ? ` (the minute at or below ${formatDuration(seconds, true)})` : '';
  // The pace band shows observed mat times for goals from 2:30 to 6:30, and an even-pace band alone outside them.
  const observed = minutes >= 150 && minutes <= 390;
  return (
    <ToolHandoffs label={label} links={[
      ...(band ? [{ href: band, accent: 'var(--orange)', title: 'Turn this into a pace band',
        text: observed ? `Even splits for ${time}${below}, beside the mat times of finishes that just beat it.` : `Even splits for ${time}${below}, ready to print.` }] : []),
      ...(pacing ? [{ href: pacing, accent: 'var(--blue)', title: 'See how finishers near this time paced', text: `Pace through each section for finishes near ${time}.` }] : []),
    ]} />
  );
}
