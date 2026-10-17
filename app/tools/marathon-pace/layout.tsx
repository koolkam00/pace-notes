import '../../styles/pages/tools/pace-charts.css';
import type { ReactNode } from 'react';

// The goal pages (/tools/marathon-pace/<goal>) share the pace charts' sheet (app/styles/pages/tools/pace-charts.css).
export default function GoalPaceLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
