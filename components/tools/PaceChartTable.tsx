'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { Choice } from '@/components/tools/ui';
import { calculatorHref, chartRows, chartSpec, goalLabel, goalPagePath, hasGoalPage, paceBandHref, type ChartPoint, type ChartRace } from '@/lib/tools/pace-chart';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

const RACE_NAME: Record<ChartRace, string> = { marathon: 'Marathon', half: 'Half marathon' };
const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const elapsed = (s: number) => formatDuration(s, s >= 3600);
/** Long tables repeat their column heads every this many rows, so a phone that has scrolled down still sees which column is which. */
const REPEAT_EVERY = 10;
/** Only tables longer than this repeat them (the marathon chart, not the half). */
const REPEAT_MIN_ROWS = 30;
const repeatBefore = (i: number, rows: number) => rows > REPEAT_MIN_ROWS && i > 0 && i % REPEAT_EVERY === 0 && rows - i >= 3;

/**
 * The horizontal scroller for a wide table, with a hint above it while the table is wider than its box (phones). The
 * table's caption is visually hidden (it names the table for screen readers); the explanation goes below the scroller
 * as a normal paragraph, so it wraps to the screen instead of to the table's full width.
 */
function ChartScroller({ labelledBy, note, children }: { labelledBy: string; note?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <p className="goal-chart-hint no-print" hidden={!overflow}>Scroll sideways for every column; the goal stays in place.</p>
      <div ref={ref} className={`tool-table-wrap goal-chart-wrap${overflow ? ' is-overflow' : ''}`} role="region" aria-labelledby={labelledBy} tabIndex={0}>
        {children}
      </div>
      {note ? <p className="tool-note goal-chart-caption">{note}</p> : null}
    </>
  );
}

/** Column head for a timing point: the mat ("10K"), with its mile equivalent when the visitor reads miles. Halfway names both. */
function PointHead({ point, units }: { point: ChartPoint; units: UnitSystem }) {
  if (point.halfway) return <>Half<span className="goal-chart-sub">{units === 'mi' ? `${oneDecimal(point.km / KM_PER_MILE)} mi` : `${oneDecimal(point.km)} km`}</span></>;
  // Mats are named as on the course ("10K"), with the mile equivalent under them in miles mode.
  return <>{point.km}K{units === 'mi' ? <span className="goal-chart-sub">{oneDecimal(point.km / KM_PER_MILE)} mi</span> : null}</>;
}

/**
 * The printable pace chart by goal time: one row per goal with the even pace per mile and per km and the even-pace
 * elapsed time at each timing point (or, in miles, at the mile markers: one table at a time). Rendered into the static
 * HTML (miles, the default) and redrawn in km after the units preference is read. Every number is calculated from the
 * goal at an even pace; nothing here is recorded, so the chart carries no evidence badge.
 */
export default function PaceChartTable({ race }: { race: ChartRace }) {
  const { units } = useUnits();
  const spec = chartSpec(race);
  const rows = useMemo(() => chartRows(spec), [spec]);
  const [view, setView] = useState<'mats' | 'miles'>('mats');
  const name = RACE_NAME[race];
  const first = goalLabel(spec.goals[0]);
  const last = goalLabel(spec.goals[spec.goals.length - 1]);
  const paceUnits: UnitSystem[] = units === 'mi' ? ['mi', 'km'] : ['km', 'mi'];
  const pace = (r: (typeof rows)[number], u: UnitSystem) => formatDuration(u === 'mi' ? r.perMile : r.perKm);
  const tableId = `goal-chart-${race}`;
  const miles = units === 'mi' && view === 'miles';
  const heads = miles
    ? spec.miles.map((p) => ({ key: p.km, head: p.halfway ? <>Half<span className="goal-chart-sub">{oneDecimal(p.mi ?? 0)} mi</span></> : <>{p.mi} mi</>, half: !!p.halfway }))
    : spec.points.map((p) => ({ key: p.km, head: <PointHead point={p} units={units} />, half: !!p.halfway }));
  const times = (r: (typeof rows)[number]) => (miles ? r.miles : r.times);
  const paces = miles ? (['mi'] as UnitSystem[]) : paceUnits;

  return (
    <section className="goal-chart" aria-labelledby={`${tableId}-caption`}>
      <div className="goal-chart-controls no-print">
        {units === 'mi' ? (
          <Choice label="Columns" small value={view} onChange={setView}
            options={[{ value: 'mats', label: 'Every 5K' }, { value: 'miles', label: 'Every mile' }]} />
        ) : null}
        <button type="button" className="btn btn-secondary is-compact" data-not-edit onClick={() => window.print()}>Print chart</button>
      </div>
      <ChartScroller labelledBy={`${tableId}-caption`}>
        <table className="tool-table goal-chart-table" id={tableId}>
          <caption id={`${tableId}-caption`} className="sr-only">
            {name} pace chart at even pace for each goal from {first} to {last}{miles ? ', at the mile markers' : ''}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="goal-chart-goal">Goal</th>
              {paces.map((u) => <th key={u} scope="col">/{u}</th>)}
              {heads.map((h) => <th key={h.key} scope="col">{h.head}</th>)}
              <th scope="col" className="goal-chart-plan no-print"><span className="sr-only">Next</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const label = goalLabel(r.goal);
              const page = race === 'marathon' && hasGoalPage(r.goal);
              return (
                <Fragment key={r.goal}>
                  {repeatBefore(i, rows.length) ? (
                    <tr className="goal-chart-rehead" aria-hidden="true">
                      <td className="goal-chart-goal">Goal</td>
                      {paces.map((u) => <td key={u}>/{u}</td>)}
                      {heads.map((h) => <td key={h.key}>{h.head}</td>)}
                      <td className="goal-chart-plan no-print" />
                    </tr>
                  ) : null}
                  <tr className={r.goal % 30 === 0 ? 'is-key' : undefined}>
                    <th scope="row" className="goal-chart-goal">
                      {page ? <Link href={goalPagePath(r.goal)} aria-label={`${label} marathon pace page`}>{label}</Link> : label}
                    </th>
                    {paces.map((u) => <td key={u}>{pace(r, u)}</td>)}
                    {times(r).map((t, j) => <td key={heads[j].key} className={heads[j].half ? 'goal-chart-half' : undefined}>{elapsed(t)}</td>)}
                    <td className="goal-chart-plan no-print">
                      {race === 'marathon'
                        ? <Link href={paceBandHref(r.goal)} aria-label={`Pace band for ${label}`}>Band</Link>
                        : <Link href={calculatorHref('half', r.goal)} aria-label={`Splits for a ${label} half marathon`}>Splits</Link>}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </ChartScroller>
    </section>
  );
}
