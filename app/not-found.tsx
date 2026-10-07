import Link from 'next/link';
import { Runner } from '@/components/art/Runner';

export default function NotFound() {
  return (
    <section className="not-found">
      <Runner size={150} kit="#FF5B2E" skin="#8D5524" label="A runner who has taken a wrong turn" />
      <p className="eyebrow">404 · Off course</p>
      <h1>This page isn&apos;t on the route.</h1>
      <p>The link may be old, or the page may have moved. Head back to the start line and pick up the course from there.</p>
      <div className="hero-actions"><Link className="button-primary" href="/">Back to the start</Link><Link className="button-secondary" href="/stories">Read the stories</Link></div>
    </section>
  );
}
