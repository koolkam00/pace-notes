import '../styles/pages/charts.css';
import type { ReactNode } from 'react';

// The charts sheet (app/styles/pages/charts.css), imported here rather than by the pages so the verifiers that render a
// chart card through the TypeScript require hook never meet a CSS import.
export default function ChartsLayout({ children }: { children: ReactNode }) {
  return children;
}
