import '../../styles/pages/tools/projector.css';
import type { ReactNode } from 'react';

// This tool's own sheet (app/styles/pages/tools/projector.css), beside the tools' shared sheet the tools layout imports.
export default function ToolLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
