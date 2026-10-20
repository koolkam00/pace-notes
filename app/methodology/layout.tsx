import '../styles/pages/methodology.css';
import type { ReactNode } from 'react';

// The methods sheet (app/styles/pages/methodology.css), imported here rather than by the page so the verifiers that
// render /methodology through the TypeScript require hook never meet a CSS import.
export default function MethodologyLayout({ children }: { children: ReactNode }) {
  return children;
}
