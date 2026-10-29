import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { AllNumbers } from '@/components/ui/Values';
import type { HalfScope } from '@/lib/half-types';
import HalfEnd from './HalfEnd';

/** The page's path and the name its crumbs, its breadcrumbs and its way back use. */
export const HALF_PATH = '/half';
export const HALF_NAME = 'The half marathon';

/**
 * The crumbs over /half's H1: "Pace Notes › The half marathon". /half sits off the chapter chain (like the Top 100
 * charts), so it has no chapter to name; the JSON-LD breadcrumbs (app/half/page.tsx) say the same.
 */
export function HalfCrumbs() {
  return (
    <>
      <Link href="/" className="crumb-chapter">Pace Notes</Link>
      <span className="half-crumb-sep" aria-hidden="true">›</span>
      <span className="half-crumb-here" aria-current="page">{HALF_NAME}</span>
    </>
  );
}

/**
 * The half-marathon page's frame: a story page's markup (the reading, its beats, one All numbers fold ending on the
 * page's methods, the closing stack) without the chapter rail, the reading bar or the chapter end, since /half is off
 * the chain. The root names the scope of every figure on it for verify-half: "verified" (half finishes in verified
 * results, no chip) or "linked" (records linked by name, one scope chip).
 */
export default function HalfPage({ scope, numbers = [], how, children }: {
  scope: HalfScope; numbers?: ReactNode[]; how: `/methodology#${string}`; children: ReactNode;
}) {
  return (
    <div className="story-page half-page" data-half-scope={scope}>
      <article className="story-flow">
        {children}
        <AllNumbers tables={numbers} className="story-numbers" how={how} />
        <HalfEnd />
      </article>
    </div>
  );
}
