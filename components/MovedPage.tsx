import type { ReactNode } from 'react';
import Button from '@/components/ui/Button';
import LegacyAnalysisLink from '@/components/LegacyAnalysisLink';

/**
 * The stub kept at a moved address (the redesign spec, section 2.9; lib/seo-routes.ts movedTo). Vercel answers the address
 * with a 308, so this only shows on a host that cannot redirect (the GitHub Pages build), and then only for a moment: one
 * heading, one sentence saying where the page went, and one way on (an outline button: the page forwards by itself, and
 * the header keeps the screen's one orange control), while LegacyAnalysisLink forwards. The page that renders it is
 * noindex and names the target in og:url.
 */
export default function MovedPage({ to, action, guides, children }: { to: string; action: string; guides?: Record<string, string>; children: ReactNode }) {
  return (
    <article className="moved-page">
      <LegacyAnalysisLink to={to} guides={guides} />
      <h1 className="t-title">This page has moved</h1>
      <p className="t-body">{children}</p>
      <Button href={to} variant="secondary" arrow="right">{action}</Button>
    </article>
  );
}
