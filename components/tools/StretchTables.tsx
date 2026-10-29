import { fiveKStretches, paceHead, stretchCaption, stretchPace, unitStretches, type Stretch } from '@/lib/tools/stretch-paces';
import type { TerrainCourse } from '@/lib/tools/terrain-data';
import { formatDuration } from '@/lib/tools/time';
import type { UnitSystem } from '@/lib/units';

/**
 * Every 5K and every mile (or km) on the band, each with its time and pace (lib/tools/stretch-paces.ts), as two small
 * tables, the same on the race planner and the pace band: in a Values fold on screen, and on the printed page when the
 * visitor ticked "Add each stretch’s pace". On terrain (`terrain`) the times are the terrain splits, whose panel already
 * carries the Published research badge; at even pace, the even-pace times. With a watch that reads the course long
 * (`overrun`, the pace band's option), the paces are the watch's and the column says so ("Watch pace"); the times stay the
 * course's. Exported for scripts/verify-tools.cjs, which renders both.
 */
export default function StretchTables({ goal, terrain, units, overrun = 0 }: { goal: number; terrain: TerrainCourse | null; units: UnitSystem; overrun?: number }) {
  const table = (kind: '5k' | 'unit', title: string, rows: Stretch[]) => (
    <div className="stretch-block">
      <p className="stretch-title" aria-hidden="true">{title}</p>
      <table className="table stretch-table">
        <caption className="sr-only">{stretchCaption(kind, goal, Boolean(terrain), units, overrun)}</caption>
        <thead><tr><th scope="col">Stretch</th><th scope="col">Time</th><th scope="col">{paceHead(overrun)}</th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.label}><th scope="row">{s.label}</th><td>{formatDuration(s.time)}</td><td>{stretchPace(s, units, overrun)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="stretch-tables">
      {table('5k', 'Each 5K', fiveKStretches(goal, terrain))}
      {table('unit', units === 'mi' ? 'Each mile' : 'Each km', unitStretches(goal, terrain, units))}
    </div>
  );
}
