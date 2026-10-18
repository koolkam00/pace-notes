'use client';

import { useState } from 'react';
import { AllFinisherExplorer, type AllFinisherProps } from './AllFinisherAnalysis';
import { useGuideExplorer, type HistoryExplorerProps } from './AnalysisExplorer';

/**
 * The all-finisher explorer with the earlier-result comparison drawn in its own form (course comparison and race-day
 * weather): the guide explorer's state lives here, so both comparisons share one Make it yours and one form, and the
 * comparison switch keeps its identity, its focus and the open sheet. Its own file, so pages without that comparison
 * never load the guide explorer.
 */
export default function AllFinisherWithHistory({ history, ...props }: Omit<AllFinisherProps, 'history'> & { history: HistoryExplorerProps }) {
  const [active, setActive] = useState(false);
  const parts = useGuideExplorer({ ...history, historyMode: true, active });
  return <AllFinisherExplorer {...props} historyParts={parts} onHistory={setActive} />;
}
