'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Segmented from '@/components/ui/Segmented.client';

/**
 * Race-day weather's three answers (the redesign spec, section 7.11): start temperature, warming and wind, one tab each,
 * every panel drawn on the server. The address's hash picks the tab (#temperature, #warming, #wind), so the old weather
 * pages' redirects land on the right one; choosing a tab writes its hash in place, without a history entry, and tells
 * the page's H1 (TabTitle) which finding to show. No element carries those ids, so the browser never jumps to a panel:
 * a redirected visitor lands at the top, the tab's finding as the H1 and its card under it.
 */
export default function WeatherTabs({ tabs }: { tabs: { id: string; label: string; panel: ReactNode }[] }) {
  const [current, setCurrent] = useState(tabs[0]?.id ?? '');
  useEffect(() => {
    const read = (scroll: boolean) => {
      const hash = window.location.hash.slice(1);
      if (!tabs.some((t) => t.id === hash)) return;
      setCurrent(hash);
      // A tab link followed on the page itself: back to the finding, the H1 above the tabs.
      if (scroll) window.requestAnimationFrame(() => document.getElementById('answer')?.scrollIntoView({ block: 'start' }));
    };
    read(false);
    const onHash = () => read(true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [tabs]);
  // The page's H1 follows the selected tab (TabTitle).
  useEffect(() => { window.dispatchEvent(new CustomEvent('pn:answer-tab', { detail: current })); }, [current]);
  const choose = (id: string) => {
    setCurrent(id);
    try { window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${id}`); } catch { /* the address stays */ }
  };
  return (
    <div className="weather-tabs" id="weather-tabs">
      <Segmented label="Race-day weather" block options={tabs.map((t) => ({ value: t.id, label: t.label }))} value={current} onChange={choose} />
      {tabs.map((t) => (
        <div key={t.id} className="weather-panel" data-tab={t.id} hidden={t.id !== current}>{t.panel}</div>
      ))}
    </div>
  );
}
