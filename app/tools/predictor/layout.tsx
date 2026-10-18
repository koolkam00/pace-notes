import '../../styles/pages/tools/predictor.css';
import type { ReactNode } from 'react';

// This tool's own sheet (app/styles/pages/tools/predictor.css), beside the tools' shared sheet the tools layout imports.
export default function ToolLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
