import '../styles/pages/analysis.css';
import type { ReactNode } from 'react';

// The analysis sheet also styles /slowdown (the hero, the beats); imported here so the page itself never imports CSS.
export default function SlowdownLayout({ children }: { children: ReactNode }) {
  return children;
}
