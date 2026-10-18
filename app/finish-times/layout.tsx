import '../styles/pages/story.css';
import type { ReactNode } from 'react';

// The story sheet (app/styles/pages/story.css), imported here rather than by the page so the verifiers that render the
// page through the TypeScript require hook never meet a CSS import.
export default function FinishTimesLayout({ children }: { children: ReactNode }) {
  return children;
}
