import '../../styles/pages/analysis.css';
import type { ReactNode } from 'react';

// The analysis pages' sheet (app/styles/pages/analysis.css), imported here rather than by the page so the verifiers that
// render the page through the TypeScript require hook never meet a CSS import.
export default function AnalysisLayout({ children }: { children: ReactNode }) {
  return children;
}
