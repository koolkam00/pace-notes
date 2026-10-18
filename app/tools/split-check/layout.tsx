import '../../styles/pages/tools/split-check.css';
import type { ReactNode } from 'react';

// This tool's own sheet (app/styles/pages/tools/split-check.css), beside the tools' shared sheet the tools layout imports.
export default function ToolLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
