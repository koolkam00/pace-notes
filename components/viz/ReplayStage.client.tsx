'use client';

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import Chips from '@/components/ui/Chips.client';
import Segmented from '@/components/ui/Segmented.client';
import { loadInsight, type ReplayRows } from '@/lib/insights';
import ReplayFrame from './ReplayFrame';
import ReplayPoster from './ReplayPoster';
import { hudShare, raceClock, type ReplayEdition, type ReplayPosterData } from './replay-geometry';

/**
 * The replay's stage: the race picker and the view toggle when asked for, and the frame. Until the sample rows and the
 * replay's code have both arrived it shows the frame with the server poster (the flag frame) at full size, so the page
 * never moves; the canvas code is its own chunk, fetched only by pages that render a replay.
 */
export type StageChoice = {
  slug: string; city: string; year: number; finishes: number; sample: number; file: string; version: string;
  route: ReplayEdition['route'];
  race: string;
  flag_s: number;
  moment: string;
  poster: ReplayPosterData;
};

type Replay = ComponentType<{ edition: ReplayEdition; flag: number; view?: 'field' | 'route'; band?: boolean; race: string; moment?: string; poster?: ReactNode; autoplay?: boolean }>;
let loaded: Replay | null = null;

export default function ReplayStage({ choices, initial, band = false, picker = false, layout = false }: {
  choices: StageChoice[]; initial: string; band?: boolean; picker?: boolean; layout?: boolean;
}) {
  const [slug, setSlug] = useState(initial);
  const [view, setView] = useState<'field' | 'route'>('field');
  const [rows, setRows] = useState<Record<string, number[][]>>({});
  const [error, setError] = useState('');
  const [Component, setComponent] = useState<Replay | null>(() => loaded);
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const choice = choices.find((c) => c.slug === slug) ?? choices[0];

  // Fetch the rows and the code once the replay is within a screen of the viewport.
  useEffect(() => {
    const node = root.current;
    if (!node || near) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: '100% 0px' });
    io.observe(node);
    return () => io.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || Component) return;
    let live = true;
    import('./RaceReplay').then((m) => { loaded = m.default as Replay; if (live) setComponent(() => loaded); }).catch(() => { if (live) setError('The replay could not load. Refresh to try again.'); });
    return () => { live = false; };
  }, [near, Component]);

  useEffect(() => {
    if (!near || rows[choice.slug]) return;
    let live = true;
    setError('');
    loadInsight<ReplayRows>(choice.file, choice.version)
      .then((data) => { if (live) setRows((r) => ({ ...r, [choice.slug]: data.rows })); })
      .catch(() => { if (live) setError('The replay could not load. Refresh to try again.'); });
    return () => { live = false; };
  }, [near, choice, rows]);

  const data = rows[choice.slug];
  const poster = <ReplayPoster data={choice.poster} />;
  const shownView = choice.route ? view : 'field';
  return (
    <div ref={root} className={`hero-replay replay night${band ? ' is-band' : ''}`}>
      {(picker && choices.length > 1) || (layout && choice.route) ? (
        <div className="replay-pickers">
          {picker && choices.length > 1 ? <Chips label="Choose a race to replay" options={choices.map((c) => ({ value: c.slug, label: c.race }))} value={slug} onChange={(v) => setSlug(v)} /> : null}
          {layout && choice.route ? <Segmented label="Replay layout" options={[{ value: 'field', label: 'The field' }, { value: 'route', label: 'On the route' }]} value={view} onChange={(v) => setView(v as 'field' | 'route')} /> : null}
        </div>
      ) : null}
      {Component && data ? (
        <Component key={`${choice.slug}-${shownView}`} edition={{ city: choice.city, year: choice.year, finishes: choice.finishes, sample: choice.sample, rows: data, route: choice.route }}
          flag={choice.flag_s} view={shownView} band={band} race={choice.race} moment={choice.moment} poster={shownView === 'field' ? poster : null} />
      ) : (
        <ReplayFrame race={choice.race} clock={raceClock(choice.flag_s)} finished={hudShare(choice.poster.finished)} slow={hudShare(choice.poster.slowdownPace)} view={shownView} band={band}
          poster={shownView === 'field' ? poster : null} moment={choice.moment} time={choice.flag_s} max={choice.poster.last_s + 300} busy={!error} status={error || undefined} />
      )}
    </div>
  );
}
