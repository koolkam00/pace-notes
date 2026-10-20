'use client';

import { Choice } from '@/components/tools/ui';
import { BAND_LABEL, BAND_OPTIONS, type BandMode } from '@/lib/tools/course-shape';

/**
 * The band's one control, the same on the race planner and the pace band (owner decision, October 20, 2026): Course
 * shape | Even pace where the course has a shape at this goal (and while its finishes load, so the field keeps its place),
 * one line saying why there is none where nothing else on the page says it (`none`: the planner; the pace band's own
 * finishes section already does), and nothing on all courses (no course to shape it) or when the data could not be
 * loaded (the page's own error says so). A press is the tool's ordinary edit.
 */
export default function BandChoice({ id, state, mode, onChange, line = '' }: {
  id: string; state: 'choice' | 'none' | 'off'; mode: BandMode; onChange: (mode: BandMode) => void; line?: string;
}) {
  if (state === 'off' || (state === 'none' && !line)) return null;
  return (
    <div className="tool-field band-choice">
      <span className="tool-label" id={id}>{BAND_LABEL}</span>
      {state === 'choice'
        ? <Choice label={BAND_LABEL} value={mode} onChange={onChange} options={BAND_OPTIONS} small className="band-choice-seg" />
        : <p className="tool-field-hint band-choice-none">{line}</p>}
    </div>
  );
}

/**
 * The band's kicker (bandKicker) on screen: it breaks only between its phrases (after " · " or ", "), never inside one,
 * so "course shape" and "8:41/mi to 20K" each stay on one line at every width.
 */
export function KickerText({ text }: { text: string }) {
  const parts = text.split(/(\s·\s|,\s)/);
  return <>{parts.map((part, i) => (i % 2 ? part : <span key={i} className="nowrap">{part}</span>))}</>;
}
