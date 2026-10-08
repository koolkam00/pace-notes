import type { ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { EVIDENCE_LABEL, EVIDENCE_TEXT, TOOLS, toolBySlug, toolHref, type ToolEvidence } from '@/lib/tools/registry';

export function EvidenceBadge({ kind, compact = false }: { kind: ToolEvidence; compact?: boolean }) {
  return <span className={`evidence-badge evidence-${kind}`} title={compact ? EVIDENCE_TEXT[kind] : undefined}>{EVIDENCE_LABEL[kind]}</span>;
}

/** Page header for one tool: breadcrumb, title, dek and the kinds of evidence it uses. */
export function ToolHeader({ slug, title, children }: { slug: string; title?: ReactNode; children?: ReactNode }) {
  const tool = toolBySlug(slug)!;
  return (
    <header className="tool-header" style={{ ['--tool' as string]: tool.accent }}>
      <p className="eyebrow"><Link href="/tools">Runner tools</Link> · {tool.group}</p>
      <h1 className="tool-title">{title ?? tool.title}</h1>
      <p className="tool-dek">{tool.dek}</p>
      <div className="tool-badges">{tool.evidence.map((e) => <EvidenceBadge key={e} kind={e} />)}</div>
      {children}
    </header>
  );
}

/** "How this works" box at the foot of a tool. */
export function ToolMethod({ children, sources = [] }: { children: ReactNode; sources?: { label: string; url: string }[] }) {
  return (
    <details className="tool-method">
      <summary>How this works</summary>
      <div className="tool-method-body">
        {children}
        {sources.length ? (
          <ul className="tool-sources">{sources.map((s) => <li key={s.url}><a href={s.url} rel="noopener noreferrer">{s.label}</a></li>)}</ul>
        ) : null}
      </div>
    </details>
  );
}

/** Links to the other tools. */
export function ToolNext({ current }: { current: string }) {
  const others = TOOLS.filter((t) => t.slug !== current);
  return (
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
  );
}
