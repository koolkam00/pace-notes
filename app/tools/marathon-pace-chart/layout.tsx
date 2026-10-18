import '../../styles/pages/tools/pace-charts.css';
import type { ReactNode } from 'react';

// The pace charts' and goal pages' shared sheet (app/styles/pages/tools/pace-charts.css), beside the tools' shared sheet.
export default function PaceChartLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
