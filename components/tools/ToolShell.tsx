import { Fragment, type ReactNode } from 'react';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { EvidenceTag } from '@/components/tools/EvidenceTag';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import Arrow from '@/components/ui/Arrow';
import ChapterEnd from '@/components/ChapterEnd';
import PageFeedback from '@/components/PageFeedback';
import { placeOf } from '@/lib/chapters';
import { settledReadingOf } from '@/lib/nuggets';
import { toolBySlug, type ToolEvidence } from '@/lib/tools/registry';
import { JsonLd, breadcrumbs } from '@/lib/seo';

/** A tool's evidence badge, linked to /methodology#evidence. `compact` (inside a row that is itself a link) is a plain label. */
export function EvidenceBadge({ kind, compact = false }: { kind: ToolEvidence; compact?: boolean }) {
  return <EvidenceTag kind={kind} link={!compact} />;
}

/** A title whose hyphenated words never break at the hyphen ("Marathon race-day projector"). */
const unbroken = (title: string) => title.split(/(\S+-\S+)/).map((part, i) => (i % 2 ? <span key={i} className="nowrap">{part}</span> : part));

/**
 * The opener of every /tools page (the redesign spec, section 4.4): the crumbs (the chapter for a tool in the race,
 * "Tools · Reference" for a lookup), the H1, one line of purpose and the kinds of evidence it uses. The breadcrumb is
 * also JSON-LD. No hue, no rule, no icon.
 */
export function ToolPageHeader({ path, title, dek, badges = [], trail, children }: {
  path: string; title: ReactNode; dek?: ReactNode; badges?: ToolEvidence[];
  /** The breadcrumb below "Tools": [label, href?] pairs, the page's own name last. */
  trail: [string, string?][]; children?: ReactNode;
}) {
  const inRace = placeOf(path) !== null;
  const parent = trail.slice(0, -1);
  return (
    <header className="tool-header">
      <div className={`reading-crumbs t-kicker tool-crumbs${inRace ? '' : ' is-plain'}`}>
        {inRace ? <ChapterCrumbs path={path} /> : (
          <>
            <Link href="/tools" className="crumb-chapter">Tools</Link>
            {parent.map(([label, href]) => (
              <Fragment key={label}><span aria-hidden="true">·</span>{href ? <Link href={href} className="crumb-chapter">{label}</Link> : <span>{label}</span>}</Fragment>
            ))}
          </>
        )}
      </div>
      <h1 className="tool-title t-title">{typeof title === 'string' ? unbroken(title) : title}</h1>
      {dek ? <p className="tool-dek">{dek}</p> : null}
      {badges.length ? <div className="tool-badges">{badges.map((e) => <EvidenceBadge key={e} kind={e} />)}</div> : null}
      {children}
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Runner tools', '/tools'], ...parent.filter(([, href]) => href), trail[trail.length - 1]])} />
    </header>
  );
}

/** The opener of a registered tool: its heading, purpose and badges from lib/tools/registry.ts. */
export function ToolHeader({ slug, title, children }: { slug: string; title?: ReactNode; children?: ReactNode }) {
  const tool = toolBySlug(slug)!;
  return (
    <ToolPageHeader path={`/tools/${slug}`} title={title ?? tool.heading ?? tool.title} dek={tool.dek} badges={tool.evidence}
      trail={[...(tool.group === 'reference' ? [['Reference'] as [string]] : []), [tool.title]]}>
      {children}
    </ToolPageHeader>
  );
}

/**
 * How a tools page ends (the redesign spec, section 2.6): a tool in the race ends on the chapter's closing stack (the next
 * card, or the planner's finish card); a reference tool on one row back to every tool and to how we know, then "Was
 * this useful?". One way forward, one way back.
 */
export function ToolEnd({ path, how }: { path: string; how: `/methodology#${string}` }) {
  if (placeOf(path)) return <ChapterEnd path={path} readingOf={settledReadingOf} />;
  return (
    <div className="chapter-end tool-end">
      <p className="chapter-end-links">
        <Link href="/tools" className="chapter-prev"><Arrow dir="left" /><span>All tools</span></Link>
        <Link href={how} className="chapter-how">How we know<Arrow dir="up-right" /></Link>
      </p>
      <PageFeedback />
    </div>
  );
}
