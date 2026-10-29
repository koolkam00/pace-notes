import { SlowdownTerm } from '@/components/tools/EvidenceTag';
import { AS_RUN_TERM, asRunLine } from '@/lib/tools/terrain-band';
import { CHECKPOINTS, type PaceBandCell } from '@/lib/tools/pace-band-data';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, matLabel, type UnitSystem } from '@/lib/units';
import { count } from '@/lib/viz/format';

/** "5K" with the mile equivalent in miles; the finish "Finish" with the marathon distance. Mats keep their names in both units. */
export function MatName({ km, units }: { km: number; units: UnitSystem }) {
  const finish = km >= 42.19;
  return <>{finish ? 'Finish' : matLabel(km)}{units === 'mi' ? <small>{finish ? '26.2 mi' : `${(km / KM_PER_MILE).toFixed(1)} mi`}</small> : null}</>;
}

/**
 * How the finishes near a goal ran, mat by mat, as they ran: the median elapsed time of every finish in the pace band's
 * window, of those with no sustained slowdown and of those with one, never scaled to the goal. A record of how those
 * races went, shared by the planner's As run panel (`short` heads, so four columns fit a phone) and the pace band's
 * finishes section. Exported for scripts/verify-tools.cjs, which renders it.
 */
export default function AsRunTable({ cells, units, short = false }: {
  cells: { all: PaceBandCell; held: PaceBandCell | null; slow: PaceBandCell | null }; units: UnitSystem; short?: boolean;
}) {
  const { all, held, slow } = cells;
  return (
    <table className="table pace-band-table as-run-table">
      <thead>
        <tr>
          <th scope="col">Mat</th>
          <th scope="col">All</th>
          {held ? <th scope="col">{short ? 'Held' : 'No sustained slowdown'}</th> : null}
          {slow ? <th scope="col">{short ? 'Slowed' : 'Sustained slowdown'}</th> : null}
        </tr>
      </thead>
      <tbody>
        {CHECKPOINTS.map((km, i) => (
          <tr key={km}>
            <th scope="row"><MatName km={km} units={units} /></th>
            <td>{formatDuration(all.e50[i])}</td>
            {held ? <td>{formatDuration(held.e50[i])}</td> : null}
            {slow ? <td>{formatDuration(slow.e50[i])}</td> : null}
          </tr>
        ))}
        <tr>
          <th scope="row">Finishes</th>
          <td>{count(all.n)}</td>
          {held ? <td>{count(held.n)}</td> : null}
          {slow ? <td>{count(slow.n)}</td> : null}
        </tr>
      </tbody>
    </table>
  );
}

/**
 * The forewarning over the as-run medians (asRunLine), with "sustained slowdown" linked to its definition: "As run,
 * slowdowns included: 48% had a sustained slowdown. Not splits to copy."
 */
export function AsRunNote({ sd }: { sd: number | null | undefined }) {
  return <>{asRunLine(sd).map((part, i) => (part === AS_RUN_TERM ? <SlowdownTerm key={i} /> : part))}</>;
}
