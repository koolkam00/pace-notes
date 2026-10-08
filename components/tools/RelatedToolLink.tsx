'use client';

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { courseSlug } from '@/lib/tools/links';

export interface RelatedLinkPlan {
  base: string;
  /** Course slugs the tool publishes; null when it takes no course. */
  scopes: string[] | null;
  /** How the analysis goal (whole minutes) travels: as a goal (H:MM) or a projector target (H:MM:00). */
  goal: 'goal' | 'target' | null;
  /** Open the projector with an empty time rather than its example runner. */
  emptyTime: boolean;
}

const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** The reader's course and goal from the analysis URL (race=City, goal=minutes), mapped onto the tool's own parameters. */
function hrefFor(plan: RelatedLinkPlan): string {
  const params: string[] = [];
  if (typeof window !== 'undefined') {
    const search = new URLSearchParams(window.location.search);
    const race = search.get('race');
    if (race && race !== 'All courses' && plan.scopes?.includes(courseSlug(race))) params.push(`course=${courseSlug(race)}`);
    const goal = Number(search.get('goal'));
    if (plan.goal && Number.isInteger(goal) && goal >= 120 && goal <= 480) params.push(plan.goal === 'goal' ? `goal=${hm(goal)}` : `target=${hm(goal)}:00`);
  }
  if (plan.emptyTime && params.length) params.push('t=none');
  return params.length ? `${plan.base}?${params.join('&')}` : plan.base;
}

/** A related-tool card link that carries the reader's choices; it refreshes before a click because analyses change the URL in place. */
export default function RelatedToolLink({ plan, className, style, children }: { plan: RelatedLinkPlan; className?: string; style?: CSSProperties; children: ReactNode }) {
  const [href, setHref] = useState(plan.base);
  const refresh = useCallback(() => setHref(hrefFor(plan)), [plan]);
  useEffect(() => {
    refresh();
    window.addEventListener('popstate', refresh);
    return () => window.removeEventListener('popstate', refresh);
  }, [refresh]);
  return <Link href={href} className={className} style={style} onPointerEnter={refresh} onPointerDown={refresh} onFocus={refresh}>{children}</Link>;
}
