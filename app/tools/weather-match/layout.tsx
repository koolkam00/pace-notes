import '../../styles/pages/tools/weather-match.css';
import type { ReactNode } from 'react';
import ChainFrame from '@/components/ChainFrame';

// This tool's own sheet (app/styles/pages/tools/weather-match.css), beside the tools' shared sheet the tools layout imports; the
// page sits in the chain's frame (the chapter rail from 1180 px), as every story and analysis does.
export default function ToolLayout({ children }: { children: ReactNode }) {
  return <ChainFrame path="/tools/weather-match">{children}</ChainFrame>;
}
