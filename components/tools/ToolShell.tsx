import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { TOOLS, toolBySlug, toolHref, type ToolEvidence } from '@/lib/tools/registry';
import { JsonLd, breadcrumbs } from '@/lib/seo';
import PageFeedback from '@/components/PageFeedback';

/** A tool's evidence badge, linked to /methodology#evidence. `compact` (inside a tool card, itself a link) is a plain label. */
export function EvidenceBadge({ kind, compact = false }: { kind: ToolEvidence; compact?: boolean }) {
  return <EvidenceTag kind={kind} link={!compact} />;
}

/** Page header for one tool: breadcrumb (visible, and as JSON-LD), heading, dek and the kinds of evidence it uses. */
export function ToolHeader({ slug, title, children }: { slug: string; title?: ReactNode; children?: ReactNode }) {
  const tool = toolBySlug(slug)!;
  return (
    <header className="tool-header" style={{ ['--tool' as string]: tool.accent }}>
      <p className="eyebrow"><Link href="/tools">Runner tools</Link> · {tool.group}</p>
      <h1 className="tool-title">{title ?? tool.heading ?? tool.title}</h1>
      <p className="tool-dek">{tool.dek}</p>
      <div className="tool-badges">{tool.evidence.map((e) => <EvidenceBadge key={e} kind={e} />)}</div>
      {children}
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Runner tools', '/tools'], [tool.title]])} />
    </header>
  );
}

/** Links to the other tools. */
export function ToolNext({ current }: { current: string }) {
  const others = TOOLS.filter((t) => t.slug !== current);
  return (
    <>
      <PageFeedback />
      <nav className="tool-next" aria-label="More runner tools">
        <p className="eyebrow">More tools</p>
        <ul>
          {others.map((t) => (
            <li key={t.slug} style={{ ['--tool' as string]: t.accent }}>
              <Link href={toolHref(t)}><b>{t.title}</b><span>{t.short}</span></Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
