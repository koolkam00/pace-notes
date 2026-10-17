import '../styles/pages/tools/tools.css';
import type { ReactNode } from 'react';

// The tools' shared sheet (app/styles/pages/tools/tools.css): the opener, the workspace, the night result card, the
// ledgers, tables and handoff rows, and the /tools list. Each tool's own sheet is imported by its route's layout, so the
// verifiers that render a page through the TypeScript require hook never meet a CSS import.
export default function ToolsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
