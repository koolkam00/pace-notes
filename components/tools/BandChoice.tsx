'use client';

import { Choice } from '@/components/tools/ui';
import { BAND_LABEL, BAND_OPTIONS, SHAPE_DISCLAIMER, shapeWhat, type BandMode } from '@/lib/tools/course-shape';

/**
 * The band's one control, the same on the race planner and the pace band (owner decision, October 20, 2026), directly
 * above the band it changes: Course shape | Even pace where the course has a shape at this goal (and while its finishes
 * load, so the field keeps its place); where it has none, one quiet line in its place saying why (`none`, no label: there
 * is nothing to choose); nothing on all courses (no course to shape it), for a course the data does not know, or when the
 * data could not be loaded (the page's own error says so). A press is the tool's ordinary edit.
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
 * The shape's one line, the same words on both pages (the planner's card, under the pace band's kicker): what the shape
 * is, chosen by its outcome, then "Not a prediction." kept on one line. While a shape is on its way (`pending`) the line
 * keeps its place but is not shown or read, so nothing claims a shape before it has arrived.
 */
export function ShapeLine({ goal, city, genderWord = '', pending = false, className }: { goal: number; city: string; genderWord?: string; pending?: boolean; className?: string }) {
  return (
    <p className={`band-shape-line${pending ? ' is-pending' : ''}${className ? ` ${className}` : ''}`} aria-hidden={pending || undefined}>
      {shapeWhat(goal, city, genderWord)} <span className="nowrap">{SHAPE_DISCLAIMER}</span>
    </p>
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
