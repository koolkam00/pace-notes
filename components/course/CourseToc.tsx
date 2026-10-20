import { SectionLink } from './Fact';

/**
 * The page's own contents (nav.course-toc; the redesign spec, section 2.4): one 44 px chip per section, in a row under
 * the hero that scrolls sideways with an edge fade. It stays in the page's flow: the reading bar carries the reader's
 * progress, so no chrome follows the reader down the page. Links go through the router (SectionLink), so Back after any
 * other link returns to the course page.
 */
export default function CourseToc({ sections }: { sections: [string, string][] }) {
  return (
    <nav className="course-toc" aria-label="On this page">
      <ul>{sections.map(([id, label]) => <li key={id}><SectionLink to={id} className="course-toc-chip">{label}</SectionLink></li>)}</ul>
    </nav>
  );
}
