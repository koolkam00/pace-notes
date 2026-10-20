'use client';

import { Choice } from '@/components/tools/ui';
import { BAND_LABEL, BAND_OPTIONS, type BandMode } from '@/lib/tools/course-shape';

/**
 * The band's one control, the same on the race planner and the pace band (owner decision, October 20, 2026): Course
 * shape | Even pace where the course has a shape at this goal (and while its finishes load, so the field keeps its place),
 * one line saying there is none where the course has too few finishes at this goal, and nothing on all courses (no course
 * to shape it) or when the data could not be loaded (the page's own error says so). A press is the tool's ordinary edit.
 */
export default function BandChoice({ id, state, mode, onChange, line }: {
  id: string; state: 'choice' | 'none' | 'off'; mode: BandMode; onChange: (mode: BandMode) => void; line: string;
}) {
  if (state === 'off') return null;
  return (
    <div className="tool-field band-choice">
      <span className="tool-label" id={id}>{BAND_LABEL}</span>
      {state === 'choice'
        ? <Choice label={BAND_LABEL} value={mode} onChange={onChange} options={BAND_OPTIONS} small />
        : <p className="tool-field-hint band-choice-none">{line}</p>}
    </div>
  );
}
