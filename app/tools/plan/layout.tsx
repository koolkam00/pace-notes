import '../../styles/pages/tools/pace-band-strip.css';
import '../../styles/pages/tools/plan.css';
import type { ReactNode } from 'react';
import ChainFrame from '@/components/ChainFrame';

// The race planner's sheets: its own and the wristband strips it shares with the pace band. The page sits in the
// chain's frame (the chapter rail from 1180 px), as every story and analysis does.
export default function PlanLayout({ children }: { children: ReactNode }) {
  return <ChainFrame path="/tools/plan">{children}</ChainFrame>;
}
