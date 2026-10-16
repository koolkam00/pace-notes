import type { ReactNode } from 'react';

/**
 * One printed figure from the data files: `<data value="raw" data-k="key">shown</data>`. The key names the field it came
 * from (the grammar is in scripts/verify-courses.cjs), so the built-page check can look the value up in the file itself
 * and compare both the value and the text the visitor sees. Units components inside it print the default miles view.
 */
export function Fact({ k, v, children }: { k: string; v: number | string; children: ReactNode }) {
  return <data value={String(v)} data-k={k}>{children}</data>;
}

/** A course section: kicker, H2, optional dek and body, marked for section_viewed with one of the generic ids. */
export function CourseSection({ id, track, kicker, title, dek, className = '', children }: {
  id: string; track?: string; kicker: string; title: ReactNode; dek?: ReactNode; className?: string; children?: ReactNode;
}) {
  return (
    <section id={id} className={`chapter course-section ${className}`.trim()} aria-labelledby={`${id}-title`} {...(track ? { 'data-track-section': track } : {})}>
      <div className="chapter-head">
        <p className="chapter-num">{kicker}</p>
        <h2 id={`${id}-title`} className="chapter-title">{title}</h2>
        {dek ? <p className="chapter-dek">{dek}</p> : null}
      </div>
      {children ? <div className="chapter-body">{children}</div> : null}
    </section>
  );
}
