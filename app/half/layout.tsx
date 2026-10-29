import '../styles/pages/story.css';
import '../styles/pages/half.css';
import type { ReactNode } from 'react';

// /half uses the story page's markup (app/styles/pages/story.css) and its own sheet (app/styles/pages/half.css), both
// imported here rather than by the page, so the verifiers that render its components through the TypeScript require
// hook never meet a CSS import.
export default function HalfLayout({ children }: { children: ReactNode }) {
  return children;
}
