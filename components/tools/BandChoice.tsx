'use client';

import { Fragment } from 'react';
import { Choice } from '@/components/tools/ui';
import { BAND_LABEL, BAND_OPTIONS, TERRAIN_DISCLAIMER, terrainWhat, type BandMode } from '@/lib/tools/terrain-band';

/**
 * The band's one control, the same on the race planner and the pace band (owner decision, October 23, 2026), with
 * nothing above it that changes with the mode, so a press never moves it (the pace band puts it at the head of the band;
 * the planner keeps it in place as the card above it changes): Terrain | Even pace where the course has terrain splits;
 * where it has none, one quiet line in its place saying why (`none`, no label: there is nothing to choose); nothing on
 * all courses (no route to spread a goal over), or for a course the data does not know. A press is the tool's ordinary
 * edit.
 */
export default function BandChoice({ id, state, mode, onChange, line = '', className }: {
  id: string; state: 'choice' | 'none' | 'off'; mode: BandMode; onChange: (mode: BandMode) => void; line?: string; className?: string;
}) {
  if (state === 'off' || (state === 'none' && !line)) return null;
  if (state === 'none') return <p className={`tool-field-hint band-choice-none${className ? ` ${className}` : ''}`} id={id}>{line}</p>;
  return (
    <div className={`tool-field band-choice${className ? ` ${className}` : ''}`}>
      <span className="tool-label" id={id}>{BAND_LABEL}</span>
      <Choice label={BAND_LABEL} value={mode} onChange={onChange} options={BAND_OPTIONS} small className="band-choice-seg" />
    </div>
  );
}

/**
 * The terrain band's lines, the same words on both pages (the planner's card, under the pace band's kicker): what the
 * band is, then "Not a prediction." kept on one line; then, on a line of its own, the climbs (climbsLine), each climb
 * kept whole where it fits.
 */
export function TerrainLine({ goal, city, climbs, className }: { goal: number; city: string; climbs: string; className?: string }) {
  const parts = climbs.split(' · ');
  return (
    <p className={`band-shape-line${className ? ` ${className}` : ''}`}>
      {terrainWhat(goal, city)} <span className="nowrap">{TERRAIN_DISCLAIMER}</span>
      {climbs ? (
        <span className="band-climbs">
          {parts.map((part, i) => <Fragment key={i}>{i ? ' ' : ''}<span className="band-climb">{part}{i < parts.length - 1 ? ' ·' : ''}</span></Fragment>)}
        </span>
      ) : null}
    </p>
  );
}

/**
 * The band's kicker (bandKicker) on screen: it breaks only between its phrases (after " · " or ", "), never inside one,
 * so "terrain splits" and "avg 12:01/mi" each stay on one line at every width.
 */
export function KickerText({ text }: { text: string }) {
  const parts = text.split(/(\s·\s|,\s)/);
  return <>{parts.map((part, i) => (i % 2 ? part : <span key={i} className="nowrap">{part}</span>))}</>;
}
