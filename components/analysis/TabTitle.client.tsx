'use client';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * The H1 of a page whose answer is in tabs (race-day weather): the selected tab's finding, so the first screen carries
 * one headline and it names what the card below draws. The server renders the first tab's; the address's hash and
 * WeatherTabs' `pn:answer-tab` event pick another.
 */
export default function TabTitle({ titles, documentTitles }: {
  titles: { id: string; title: ReactNode }[];
  /**
   * The browser tab's title for each tab other than the first (its finding), so a Warming or Wind page is not labelled
   * with the start-temperature title (critic round 5). The first tab keeps the page's own title. Pass on one instance.
   */
  documentTitles?: Record<string, string>;
}) {
  const [current, setCurrent] = useState(titles[0]?.id ?? '');
  useEffect(() => {
    const pick = (id: string) => { if (titles.some((t) => t.id === id)) setCurrent(id); };
    pick(window.location.hash.slice(1));
    const onTab = (event: Event) => pick(String((event as CustomEvent<string>).detail));
    window.addEventListener('pn:answer-tab', onTab);
    return () => window.removeEventListener('pn:answer-tab', onTab);
  }, [titles]);
  const [own, setOwn] = useState<string | null>(null);
  useEffect(() => { if (documentTitles) setOwn(document.title); }, [documentTitles]);
  useEffect(() => {
    if (!documentTitles || own === null) return;
    document.title = documentTitles[current] ?? own;
  }, [documentTitles, current, own]);
  return <>{(titles.find((t) => t.id === current) ?? titles[0])?.title}</>;
}
