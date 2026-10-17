import { SectionLink } from './Fact';

/**
 * The page's own contents (nav.course-toc; the redesign spec, section 2.4): one 44 px chip per section, in a row that
 * sticks under the header on phones and scrolls sideways with an edge fade. Links go through the router (SectionLink),
 * so Back after any other link returns to the course page.
 */
export default function CourseToc({ sections }: { sections: [string, string][] }) {
  return (
    <nav className="course-toc" aria-label="On this page">
      <ul>{sections.map(([id, label]) => <li key={id}><SectionLink to={id} className="course-toc-chip">{label}</SectionLink></li>)}</ul>
    </nav>
  );
}
