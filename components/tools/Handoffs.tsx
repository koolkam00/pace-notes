// Kept out of components/tools/ui.tsx, which every tool page loads: only the predictor and the pace calculator show these.
import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import Arrow from '@/components/ui/Arrow';
import { formatHM } from '@/lib/tools/time';
import { paceBandGoalHref, pacingPatternHref, planHref } from '@/lib/tools/links';

/**
 * Next steps from a result: one row per page it opens, with the result filled in (the redesign spec, section 3.5:
 * "Turn this into a pace band →", rows, not cards). The value travels in the link's query only (analytics keeps a page's
 * path alone), and the page it opens shows it in its own masked workspace, as if typed. Following a link is not a tool
 * edit: components/SiteAnalytics.tsx counts typing, choices and buttons.
 */
export function ToolHandoffs({ label, links }: { label: string; links: { href: string; title: string; text: ReactNode }[] }) {
  if (!links.length) return null;
  return (
    <nav className="tool-handoffs no-print" aria-label={label}>
      <p className="tool-handoffs-label">{label}</p>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href}><span className="tool-handoff-text"><b>{l.title}</b><span>{l.text}</span></span><Arrow /></Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export type HandoffTarget = 'plan' | 'band' | 'pacing';

/**
 * Where a marathon time (whole seconds) goes next: one row (section 00: one link forward per page), the first of `to`
 * that takes the time: the race planner for it, a pace band for it, or how finishes near it were paced. Each opens at
 * the whole minute at or below it, the way every tool hands a time on (4:11:41 is 4:11), and the row names that minute.
 */
export function MarathonHandoffs({ label, seconds, to = ['plan', 'band', 'pacing'] }: {
  label: string; seconds: number;
  /** The rows to offer, most likely first; the first one the time fits is shown. */
  to?: HandoffTarget[];
}) {
  const minutes = Math.floor(seconds / 60);
  const time = formatHM(minutes * 60);
  // The pace band shows observed mat times for goals from 2:30 to 6:30, and an even-pace band alone outside them.
  const observed = minutes >= 150 && minutes <= 390;
  const rows: Record<HandoffTarget, () => { href: string; title: string; text: string } | null> = {
    plan: () => { const href = planHref(undefined, minutes); return href ? { href, title: 'Plan this goal', text: `Pick your course: even pace for ${time}, and how that pace held up there.` } : null; },
    band: () => { const href = paceBandGoalHref(minutes); return href ? { href, title: 'Turn this into a pace band', text: observed ? `Even splits for ${time}, beside the mat times of finishes that just beat it.` : `Even splits for ${time}, ready to print.` } : null; },
    pacing: () => { const href = pacingPatternHref(minutes); return href ? { href, title: 'See how finishers near this time paced', text: `Pace through each section for finishes near ${time}.` } : null; },
  };
  const first = to.map((key) => rows[key]()).find((row) => row !== null);
  return <ToolHandoffs label={label} links={first ? [first] : []} />;
}
