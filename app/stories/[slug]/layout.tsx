import '../../styles/pages/story.css';
import type { ReactNode } from 'react';

// The story sheet (app/styles/pages/story.css), imported here rather than by the page so the verifiers that render a
// story through the TypeScript require hook never meet a CSS import.
export default function StoryLayout({ children }: { children: ReactNode }) {
  return children;
}
