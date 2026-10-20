import '../../styles/pages/tools/pace-band-strip.css';
import '../../styles/pages/tools/pace-band.css';
import type { ReactNode } from 'react';
import ChainFrame from '@/components/ChainFrame';

// The pace band's sheets: its own and the wristband strips it shares with the race planner.
// The page sits in the chain's frame (the chapter rail from 1180 px), as every page with a chapter crumb does (critic
// round 5: the chapter's tools used three desktop frames).
export default function PaceBandLayout({ children }: { children: ReactNode }) {
  return <ChainFrame path="/tools/pace-band">{children}</ChainFrame>;
}
