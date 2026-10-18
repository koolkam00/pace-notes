'use client';
import { useEffect, useState, type ReactNode } from 'react';

/**
 * The H1 of a page whose answer is in tabs (race-day weather): the selected tab's finding, so the first screen carries
 * one headline and it names what the card below draws. The server renders the first tab's; the address's hash and
 * WeatherTabs' `pn:answer-tab` event pick another.
 */
export default function TabTitle({ titles }: { titles: { id: string; title: ReactNode }[] }) {
  const [current, setCurrent] = useState(titles[0]?.id ?? '');
  useEffect(() => {
    const pick = (id: string) => { if (titles.some((t) => t.id === id)) setCurrent(id); };
    pick(window.location.hash.slice(1));
    const onTab = (event: Event) => pick(String((event as CustomEvent<string>).detail));
    window.addEventListener('pn:answer-tab', onTab);
    return () => window.removeEventListener('pn:answer-tab', onTab);
  }, [titles]);
  return <>{(titles.find((t) => t.id === current) ?? titles[0])?.title}</>;
}
