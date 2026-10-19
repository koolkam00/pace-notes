import '../../styles/pages/tools/predictor.css';
import type { ReactNode } from 'react';
import ChainFrame from '@/components/ChainFrame';

// This tool's own sheet (app/styles/pages/tools/predictor.css), beside the tools' shared sheet the tools layout imports.
// The page sits in the chain's frame (the chapter rail from 1180 px), as every page with a chapter crumb does (critic
// round 5: the chapter's tools used three desktop frames).
export default function ToolLayout({ children }: { children: ReactNode }) {
  return <ChainFrame path="/tools/predictor">{children}</ChainFrame>;
}
