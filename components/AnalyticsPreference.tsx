'use client';

import { useEffect, useState } from 'react';
import { analyticsConfigured, analyticsDisabled, browserRejectsAnalytics, setAnalyticsDisabled } from '@/lib/analytics';
import { ANALYTICS_CHANGED } from '@/lib/analytics-policy';

export default function AnalyticsPreference() {
  const [state, setState] = useState<{ configured: boolean; disabled: boolean; browser: boolean } | null>(null);
  useEffect(() => {
    const refresh = () => setState({ configured: analyticsConfigured(), disabled: analyticsDisabled(), browser: browserRejectsAnalytics() });
    refresh(); window.addEventListener(ANALYTICS_CHANGED, refresh); window.addEventListener('storage', refresh);
    return () => { window.removeEventListener(ANALYTICS_CHANGED, refresh); window.removeEventListener('storage', refresh); };
  }, []);
  // The note below the switch is the same in every state, so the row keeps its height while the preference loads.
  const note = <p className="info-choice-note">This choice applies to this browser, and only the choice is saved, in its local storage. Clearing site storage resets it.</p>;
  if (!state) return <><p role="status">Loading your analytics preference…</p>{note}</>;
  if (!state.configured) return <><p role="status">Analytics is not enabled in this environment.</p>{note}</>;
  if (state.browser) return <><p role="status">Analytics is off because your browser sends a Do Not Track or Global Privacy Control preference.</p>{note}</>;
  return <><p role="status">Analytics is {state.disabled ? 'off' : 'on'} for this browser.</p><button className="btn btn-secondary is-compact" type="button" onClick={() => setAnalyticsDisabled(!state.disabled)}>{state.disabled ? 'Allow anonymous analytics' : 'Turn off analytics'}</button>{note}</>;
}
