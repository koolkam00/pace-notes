import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * One printed figure from the data files: `<data value="raw" data-k="key">shown</data>`. The key names the field it came
 * from (the grammar is in scripts/verify-courses.cjs), so the built-page check can look the value up in the file itself
 * and compare both the value and the text the visitor sees. Units components inside it print the default miles view.
 */
export function Fact({ k, v, children }: { k: string; v: number | string; children: ReactNode }) {
  return <data value={String(v)} data-k={k}>{children}</data>;
}

/**
 * A link to a section of this page. It goes through the app router (next/link), not a plain `href="#…"`: a plain
 * fragment link adds a history entry the router ignores on Back, so after following any other link, Back would show the
 * course page's address over the page left. The router scrolls to the section and focuses it (sections take focus).
 */
export function SectionLink({ to, children }: { to: string; children: ReactNode }) {
  return <Link href={`#${to}`} prefetch={false}>{children}</Link>;
}

/** A course section: kicker, H2, optional dek and body, marked for section_viewed with one of the generic ids. */
export function CourseSection({ id, track, kicker, title, dek, className = '', children }: {
  id: string; track?: string; kicker: string; title: ReactNode; dek?: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <section id={id} tabIndex={-1} className={`chapter course-section ${className}`.trim()} aria-labelledby={`${id}-title`} {...(track ? { 'data-track-section': track } : {})}>
      <div className="chapter-head">
        <p className="chapter-num">{kicker}</p>
        <h2 id={`${id}-title`} className="chapter-title">{title}</h2>
        {dek ? <p className="chapter-dek">{dek}</p> : null}
      </div>
      {children ? <div className="chapter-body">{children}</div> : null}
    </section>
  );
}

/**
 * A course table in its sideways-scrolling wrapper: a named region that takes keyboard focus, so it can be scrolled
 * without a mouse (the tools' pattern), labelled by the table's own caption.
 */
export function CourseTable({ id, caption, className = '', children }: { id: string; caption: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className="tool-table-wrap course-table-wrap" role="region" aria-labelledby={id} tabIndex={0}>
      <table className={`tool-table course-table ${className}`.trim()}>
        <caption id={id} className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
