import type { CSSProperties, ReactNode } from 'react';
import { withEm } from '@/components/ui/withEm';
import { fieldX } from './replay-geometry';

/**
 * The replay's frame (the redesign spec, sections 3.6 and 7.1), drawn the same before and after its canvas loads so
 * nothing moves: the race and the clock on the left, the shares finished and at slowdown pace on the right, the canvas
 * box (its height fixed in CSS) with the poster under the canvas and the play button at its top right, the moment's
 * sentence under it (its two lines reserved), and the scrub row with hour ticks. Pure markup: RaceReplay passes the
 * handlers; the placeholder passes none and its controls are disabled.
 */
export type FrameProps = {
  race: string;
  clock: string;
  finished: string;
  slow: string;
  view: 'field' | 'route';
  band?: boolean;
  poster?: ReactNode;
  canvas?: ReactNode;
  moment?: string;
  momentOn?: boolean;
  playing?: boolean;
  onPlay?: () => void;
  time?: number;
  max?: number;
  onScrub?: (seconds: number) => void;
  valuetext?: string;
  busy?: boolean;
  status?: string;
  /** The canvas is drawing: the poster fades out under it. */
  live?: boolean;
};

export default function ReplayFrame({ race, clock, finished, slow, view, band = false, poster, canvas, moment, momentOn = true, playing = false, onPlay, time = 0, max = 0, onScrub, valuetext, busy, status, live = false }: FrameProps) {
  const hours = Math.max(0, Math.floor(max / 3600));
  const ready = !!onScrub;
  return (
    <div className={`replay-frame${live ? ' is-live' : ''}`} aria-busy={busy || undefined}>
      <div className="replay-hud" aria-live="off">
        <div className="replay-hud-race">
          <p className="replay-race">{race}</p>
          <p className="replay-clock" aria-hidden="true">{clock}</p>
        </div>
        <dl className="replay-stats">
          <div><dt>Finished</dt><dd>{finished}</dd></div>
          <div><dt><i className="replay-swatch" aria-hidden="true" />At slowdown pace</dt><dd>{slow}</dd></div>
        </dl>
      </div>
      <div className={`replay-box is-${view}`}>
        {poster}
        {canvas}
        {view === 'field' ? (
          <>
            <span className="replay-axis-y is-top" aria-hidden="true">First to finish</span>
            <span className="replay-axis-y is-bottom" aria-hidden="true">Last to finish</span>
          </>
        ) : null}
        {status ? <p className="replay-status">{status}</p> : null}
        <button type="button" className="replay-play" onClick={onPlay} disabled={!ready}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            {playing ? <><rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor" /></>
              : <path d="M4.5 2.8v10.4L13 8z" fill="currentColor" />}
          </svg>
          <span className="sr-only">{playing ? 'Pause the replay' : 'Play the replay'}</span>
        </button>
      </div>
      {view === 'field' ? (
        <div className="replay-mats" aria-hidden="true">
          {[0, 10, 20, 30].map((km) => <span key={km} style={{ left: `${(fieldX(km) * 100).toFixed(2)}%` }}>{km ? `${km}K` : 'Start'}</span>)}
          <span className="is-finish">Finish</span>
        </div>
      ) : null}
      {moment ? <p className={`replay-moment${momentOn ? '' : ' is-off'}`}>{withEm(moment)}</p> : null}
      <div className="replay-scrub">
        <input className="replay-range" type="range" min={0} max={Math.max(1, Math.ceil(max))} step={10} value={Math.round(time)} disabled={!ready}
          onChange={(e) => onScrub?.(Number(e.target.value))} aria-label="Race clock" aria-valuetext={valuetext ?? clock}
          style={{ '--fill': `${max ? Math.min(100, (time / max) * 100).toFixed(2) : 0}%` } as CSSProperties} />
        <div className="replay-hours" aria-hidden="true">
          {Array.from({ length: hours + 1 }, (_, h) => <span key={h} style={{ left: `${(((h * 3600) / Math.max(1, max)) * 100).toFixed(2)}%` }}>{h}h</span>)}
        </div>
      </div>
    </div>
  );
}
