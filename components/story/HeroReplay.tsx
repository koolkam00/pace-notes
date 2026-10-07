'use client';

import { useEffect, useState } from 'react';
import RaceReplay, { type ReplayEdition } from '@/components/viz/RaceReplay';
import { loadInsight, type ReplayEditionMeta, type ReplayRows } from '@/lib/insights';

export interface ReplayChoice extends ReplayEditionMeta {
  version: string;
  route: { points: [number, number][]; km: number[] } | null;
}

export default function HeroReplay({ choices, initial }: { choices: ReplayChoice[]; initial: string }) {
  const [slug, setSlug] = useState(initial);
  const [variant, setVariant] = useState<'track' | 'route'>('track');
  const [edition, setEdition] = useState<ReplayEdition | null>(null);
  const [error, setError] = useState('');
  const choice = choices.find((c) => c.slug === slug) ?? choices[0];

  useEffect(() => {
    let live = true;
    setError('');
    loadInsight<ReplayRows>(choice.file, choice.version)
      .then((rows) => { if (live) setEdition({ city: rows.city, year: rows.year, finishes: rows.finishes, sample: rows.sample, rows: rows.rows, route: choice.route }); })
      .catch(() => { if (live) setError('The replay could not be loaded. Refresh to try again.'); });
    return () => { live = false; };
  }, [choice]);

  return (
    <div className="hero-replay">
      <div className="hero-replay-bar">
        <div className="segmented" role="group" aria-label="Choose a race to replay">
          {choices.map((c) => (
            <button key={c.slug} type="button" aria-pressed={c.slug === slug} onClick={() => setSlug(c.slug)}>
              {c.city === 'New York' ? 'New York City' : c.city} {c.year}
            </button>
          ))}
        </div>
        {choice.route ? (
          <div className="segmented" role="group" aria-label="Replay layout">
            <button type="button" aria-pressed={variant === 'track'} onClick={() => setVariant('track')}>Straight course</button>
            <button type="button" aria-pressed={variant === 'route'} onClick={() => setVariant('route')}>On the route</button>
          </div>
        ) : null}
      </div>
      {edition && edition.city === choice.city && edition.year === choice.year ? (
        <RaceReplay key={choice.slug + variant} edition={edition} variant={variant} height={variant === 'route' ? 520 : 420} />
      ) : (
        <div className="replay replay-loading" aria-busy={!error}>
          <p>{error || `Loading ${choice.sample.toLocaleString('en-US')} finishes from ${choice.city} ${choice.year}…`}</p>
        </div>
      )}
      <p className="hero-replay-note">
        A sample of {choice.sample.toLocaleString('en-US')} of the {choice.finishes.toLocaleString('en-US')} eligible finishes, spaced evenly by finish time.
        Everyone starts together on the race clock because wave and start offsets are not recorded.
      </p>
    </div>
  );
}
