import Button from '@/components/ui/Button';

export const metadata = { title: 'Page not found | Pace Notes', description: 'This page is not on the route. Head back to the start or read the stories from the data.', robots: { index: false, follow: true } };

/**
 * The 404 (the redesign spec, sections 7.15 and 00): what happened, in one line, and two ways back onto the course. The
 * way back is the outline button, so the header's "Plan your race" stays the screen's one orange control.
 */
export default function NotFound() {
  return (
    <section className="info-stop" aria-labelledby="not-found-title">
      <p className="t-kicker">404 · Off course</p>
      <h1 id="not-found-title" className="t-title">This page isn’t on the route.</h1>
      <p className="info-dek">The link may be old, or the page may have moved. Pick up the course from the start, or from the contents.</p>
      <div className="info-actions">
        <Button href="/" variant="secondary" arrow="right">Back to the start</Button>
        <Button href="/research" variant="tertiary">Contents</Button>
      </div>
    </section>
  );
}
