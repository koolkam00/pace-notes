'use client';

import { useMemo } from 'react';
import { UnitLink as Link, useUnits } from '@/components/UnitsProvider';
import { EvidencePanel } from '@/components/tools/ui';
import { HALF_KM } from '@/lib/tools/pace';
import { calculatorHref, chartRows, chartSpec, goalLabel, goalPagePath, hasGoalPage, paceBandHref, type ChartPoint, type ChartRace } from '@/lib/tools/pace-chart';
import { formatDuration } from '@/lib/tools/time';
import { KM_PER_MILE, type UnitSystem } from '@/lib/units';

const RACE_NAME: Record<ChartRace, string> = { marathon: 'Marathon', half: 'Half marathon' };
const oneDecimal = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const elapsed = (s: number) => formatDuration(s, s >= 3600);

/** Column head for a timing point: the km point, with its mile equivalent when the visitor reads miles. Halfway names both. */
function PointHead({ point, units }: { point: ChartPoint; units: UnitSystem }) {
  if (point.halfway) return <>Half<span className="goal-chart-sub">{units === 'mi' ? `${oneDecimal(point.km / KM_PER_MILE)} mi` : `${oneDecimal(point.km)} km`}</span></>;
  return <>{point.km} km{units === 'mi' ? <span className="goal-chart-sub">{oneDecimal(point.km / KM_PER_MILE)} mi</span> : null}</>;
}

/**
 * The printable pace chart by goal time: one row per goal with the even pace per mile and per km and the even-pace
 * elapsed time at each timing point. Rendered into the static HTML (miles, the default) and redrawn in km after the
 * units preference is read. Every number is calculated from the goal at an even pace; nothing here is recorded.
 */
export default function PaceChartTable({ race }: { race: ChartRace }) {
  const { units } = useUnits();
  const spec = chartSpec(race);
  const rows = useMemo(() => chartRows(spec), [spec]);
  const name = RACE_NAME[race];
  const first = goalLabel(spec.goals[0]);
  const last = goalLabel(spec.goals[spec.goals.length - 1]);
  const paceUnits: UnitSystem[] = units === 'mi' ? ['mi', 'km'] : ['km', 'mi'];
  const pace = (r: (typeof rows)[number], u: UnitSystem) => formatDuration(u === 'mi' ? r.perMile : r.perKm);
  const distance = race === 'marathon' ? '42.195 km (26.2 mi)' : `${HALF_KM} km (13.1 mi)`;
  const tableId = `goal-chart-${race}`;

  return (
    <>
      <EvidencePanel id={`${tableId}-panel`} title={`${name} pace chart, ${first} to ${last}`}
        meta={<>Calculated at even pace, not recorded times: each goal spread evenly over {distance}. Elapsed time at each {race === 'marathon' ? '5 km timing mat and at halfway' : '5 km point'}; whole hours and half hours shaded.</>}>
        <div className="tool-share no-print">
          <button type="button" className="button-secondary" onClick={() => window.print()}>Print chart</button>
        </div>
        <div className="tool-table-wrap goal-chart-wrap" role="region" aria-labelledby={`${tableId}-caption`} tabIndex={0}>
          <table className="tool-table goal-chart-table" id={tableId}>
            <caption id={`${tableId}-caption`}>
              {name} pace chart, calculated at even pace for each goal from {first} to {last}. These are not recorded splits. Times are rounded to whole seconds.
            </caption>
            <thead>
              <tr>
                <th scope="col" rowSpan={2} className="goal-chart-goal">Goal</th>
                <th scope="colgroup" colSpan={2} className="goal-chart-group">Even pace</th>
                <th scope="colgroup" colSpan={spec.points.length} className="goal-chart-group">Elapsed time at even pace (calculated)</th>
                <th scope="col" rowSpan={2} className="goal-chart-plan no-print">Plan</th>
              </tr>
              <tr>
                {paceUnits.map((u) => <th key={u} scope="col">/{u}</th>)}
                {spec.points.map((p) => <th key={p.km} scope="col"><PointHead point={p} units={units} /></th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const label = goalLabel(r.goal);
                const page = race === 'marathon' && hasGoalPage(r.goal);
                return (
                  <tr key={r.goal} className={r.goal % 30 === 0 ? 'is-key' : undefined}>
                    <th scope="row" className="goal-chart-goal">
                      {page ? <Link href={goalPagePath(r.goal)} aria-label={`${label} marathon pace page`}>{label}</Link> : label}
                    </th>
                    {paceUnits.map((u) => <td key={u}>{pace(r, u)}</td>)}
                    {r.times.map((t, i) => <td key={spec.points[i].km} className={spec.points[i].halfway ? 'goal-chart-half' : undefined}>{elapsed(t)}</td>)}
                    <td className="goal-chart-plan no-print">
                      {race === 'marathon'
                        ? <Link href={paceBandHref(r.goal)} aria-label={`Pace band for ${label}`}>Pace band</Link>
                        : <Link href={calculatorHref('half', r.goal)} aria-label={`Splits for a ${label} half marathon`}>Splits</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="tool-note no-print">
          {race === 'marathon'
            ? <>Each <b>Pace band</b> link opens the printable band for that goal, beside what recorded finishes at that goal ran at each mat. Underlined goals link to their own page.</>
            : <>Each <b>Splits</b> link opens the pace calculator for that goal, with splits every 400 m, quarter mile, kilometre or mile.</>}
        </p>
      </EvidencePanel>

      {units === 'mi' ? (
        <EvidencePanel id={`${tableId}-miles-panel`} title="Mile markers at even pace"
          meta={`Calculated at even pace, not recorded times: the elapsed time at ${race === 'marathon' ? 'every fifth mile and at halfway' : '5 and 10 miles'} for each goal.`}>
          <div className="tool-table-wrap goal-chart-wrap" role="region" aria-labelledby={`${tableId}-miles-caption`} tabIndex={0}>
            <table className="tool-table goal-chart-table goal-chart-miles">
              <caption id={`${tableId}-miles-caption`}>
                {name} mile markers, calculated at even pace for each goal from {first} to {last}. Not recorded splits: the official timing mats are every 5 km.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="goal-chart-goal">Goal</th>
                  <th scope="col">/mi</th>
                  {spec.miles.map((p) => (
                    <th key={p.km} scope="col">{p.halfway ? <>Half<span className="goal-chart-sub">{oneDecimal(p.mi ?? 0)} mi</span></> : `${p.mi} mi`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.goal} className={r.goal % 30 === 0 ? 'is-key' : undefined}>
                    <th scope="row" className="goal-chart-goal">{goalLabel(r.goal)}</th>
                    <td>{formatDuration(r.perMile)}</td>
                    {r.miles.map((t, i) => <td key={spec.miles[i].km} className={spec.miles[i].halfway ? 'goal-chart-half' : undefined}>{elapsed(t)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </EvidencePanel>
      ) : null}
    </>
  );
}
