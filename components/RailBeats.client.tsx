'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

type Beat = { id: string; label: string };

/**
 * The current page's beats in the chapter rail (components/ChapterRail.tsx): one anchor per [data-beat] section with an
 * id, named by its data-beat value or its first heading, and the beat in view marked (aria-current="location"). It reads
 * the page it sits on, so pages only mark their beats.
 */
export default function RailBeats() {
  const path = usePathname();
  const [beats, setBeats] = useState<Beat[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('main [data-beat][id]'));
    setBeats(els.map((el) => ({ id: el.id, label: el.dataset.beat || el.querySelector('h2, h3')?.textContent?.trim() || el.id })));
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    // A beat is current once its top passes 35% down the screen, until the next one's does. Above the first beat, or
    // once the last has scrolled away, none is: every crossing measures again, so the mark is never left behind.
    const observer = new IntersectionObserver(() => {
      const line = window.innerHeight * 0.35;
      const last = els.filter((el) => el.getBoundingClientRect().top <= line).pop();
      setCurrent(last && last.getBoundingClientRect().bottom > line ? last.id : null);
    }, { rootMargin: '0px 0px -65% 0px' });
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [path]);
  if (!beats.length) return null;
  return (
    <ol className="rail-beats">
      {beats.map((b) => <li key={b.id}><a className="rail-link" href={`#${b.id}`} aria-current={current === b.id ? 'location' : undefined}>{b.label}</a></li>)}
    </ol>
  );
}
