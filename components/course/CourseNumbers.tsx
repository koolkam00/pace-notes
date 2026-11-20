import { Elevation } from '@/components/story/Units';
import { EditionKey, editionKey, RowTags } from './EditionKey';
import { clock, count, goalText, minutes, pct, routeClimb, shortDate, type CoursePageData } from '@/lib/course-page';
import { sectionLabel } from '@/lib/nuggets/format';
import { FINISHES_ALL_SPLITS, profileUnderWater } from '@/lib/nuggets/courses';
import { SECTION_BOUNDS, signedPct } from '@/lib/viz/format';
import { CourseTable, Fact } from './Fact';
import { Degrees, NetElevation, Wind } from './CourseUnits';
import { GOAL_GAP } from './CourseGoals';
import { HowLink } from '@/components/ui/Values';
import { hasLinkedYears, LinkedYearCell, LinkedYearHead, LinkedYearNote } from '@/components/races/LinkedYear';
import { howWeKnowOf } from '@/lib/chapters';

/**
 * "All numbers" (the redesign spec, section 00, cut 7): every long table on the course page in one disclosure after
 * the race's last chart: the whole course, edition by edition (with each edition's tier label and race morning), 5K by 5K, goal by goal, and the
 * pacing types. Every figure is a checked <data> (scripts/verify-courses.cjs); a missing value is a dash. A duration given
 * back carries its "+", so it never reads as a clock time or a pace. Its last line is the page's methods link (release:
 * every page with an "All numbers" ends it there; CourseOthers' closing row is the way back alone).
 */
/** A cell with no figure (a dash): stacked on a phone, it is left out rather than printed as a label and a dash. */
const gap = (v: unknown) => (v ? {} : { 'data-empty': '' });

export default function CourseNumbers({ page }: { page: CoursePageData }) {
  const { display, summary: s, editions, listed, weather, terrain, goals, types, typesElsewhere, archetypes, counted } = page;
  // The one climb the page prints everywhere (the hero, #elevation, /courses): the route's 5K sections summed. A profile
  // that reads the water under a bridge prints no climb, descent or net anywhere: its 5K table keeps the pace only.
  const wet = profileUnderWater(page);
  const climb = wet ? null : routeClimb(page);
  const curve = s.curve?.length === 9 ? s.curve : null;
  const sections = terrain && (!wet || curve) ? terrain : null;
  const byYear = new Map(weather.map((w) => [w.year, w]));
  const rows = new Map(editions.map((e) => [e.year, e]));
  // The year's verdict for linked runners, a column only where some year has one.
  const linked = hasLinkedYears(page.city, listed.map((l) => l.year));
  // A label true of most editions is said once, above the table, with the years it is not true of (lead decision D48).
  const key = editionKey(listed);
  // The page's methods close its numbers, so the closing row is the way back alone (as on a story).
  const how = howWeKnowOf(`/courses/${page.slug}`);
  const tables = 3 + (sections ? 1 : 0) + (goals.length ? 1 : 0) - (types ? 0 : 1);
  return (
    <details className="values course-numbers" id="all-numbers">
      <summary>
        <span>All numbers<span className="values-count"> {tables} tables</span></span>
        <span className="values-glyph" aria-hidden="true" />
      </summary>
      <div className="values-body course-numbers-body">
        <CourseTable id="numbers-course-caption" caption={`${display}, the whole course`}>
          <tbody>
            <tr><th scope="row">{FINISHES_ALL_SPLITS}</th><td><Fact k="finishes" v={s.finishes}>{count(s.finishes)}</Fact></td></tr>
            <tr><th scope="row">Counted editions</th><td><Fact k="counted.editions" v={counted.editions}>{count(counted.editions)}</Fact></td></tr>
            <tr><th scope="row">Median of finishes with all splits, average edition</th><td><Fact k="median" v={s.median_s}>{clock(s.median_s)}</Fact></td></tr>
            <tr><th scope="row">Sustained slowdown, average edition</th><td><Fact k="slowdown" v={s.slowdown}>{pct(s.slowdown)}</Fact></td></tr>
            <tr><th scope="row">Second 20K more than 10% slower</th><td><Fact k="block10" v={s.block10}>{pct(s.block10)}</Fact></td></tr>
            <tr><th scope="row">Median time given back after 20K</th><td>{s.after20_s > 0 ? '+' : ''}<Fact k="after20" v={s.after20_s}>{minutes(s.after20_s)}</Fact></td></tr>
            {climb ? <tr><th scope="row">Climb, whole route</th><td><Fact k={`${climb.key}.gain`} v={climb.gain_m}><Elevation metres={climb.gain_m} /></Fact></td></tr> : null}
          </tbody>
        </CourseTable>
        <div className="edition-table">
        <EditionKey model={key} />
        {/* On a phone each edition stacks (review M4): its year and labels, then its median and finishes, then the rest,
            each figure under its column's name (data-label), so nothing sits off-screen. */}
        <CourseTable id="numbers-editions-caption" caption={`${display}, edition by edition`} className="is-stack">
          <thead>
            <tr><th scope="col">Year</th><th scope="col" className="is-text">Status</th><th scope="col">Recorded results</th><th scope="col">Race date</th><th scope="col">Finishes with all splits</th><th scope="col">Median finish</th><th scope="col">Sustained slowdown</th><th scope="col">At the start</th><th scope="col">Dew point</th><th scope="col">Humidity</th><th scope="col">Wind</th><th scope="col">Start time</th>{linked ? <LinkedYearHead /> : null}</tr>
          </thead>
          <tbody>
            {listed.map((l) => {
              const e = rows.get(l.year);
              const w = e ? byYear.get(e.year) : undefined;
              return (
                <tr key={l.year} data-edition={l.year} {...(e ? {} : { 'data-uncounted': '' })}>
                  <th scope="row">{l.year}</th>
                  {/* Every edition with results, counted or not (lead decisions D3, D5 and D16): its labels from the shared
                      module (the tier, "Finish times only" and "Gun times" where they apply). A counted edition with a row
                      keeps its figures; any other prints its recorded results and dashes. Each linked label keeps its own
                      44 px hit area. The medians and shares are of the finishes with all nine checkpoints (courses.json);
                      the recorded results are every row the release holds (the race directory). */}
                  <td className="is-text edition-status"><RowTags row={l} model={key} /></td>
                  <td data-label="Recorded results"><Fact k={`rr@${l.year}`} v={l.results}>{count(l.results)}</Fact></td>
                  <td data-label="Race date" {...gap(e?.date)}>{e?.date ? <Fact k={`date@${e.year}`} v={e.date}>{shortDate(e.date)}</Fact> : '—'}</td>
                  <td data-label={FINISHES_ALL_SPLITS} className="is-key" {...gap(e)}>{e ? <Fact k={`n@${e.year}`} v={e.n}>{count(e.n)}</Fact> : '—'}</td>
                  <td data-label="Median finish" className="is-key is-first" {...gap(e)}>{e ? <Fact k={`median@${e.year}`} v={e.median_s}>{clock(e.median_s)}</Fact> : '—'}</td>
                  <td data-label="Sustained slowdown" {...gap(e)}>{e ? <Fact k={`sd@${e.year}`} v={e.slowdown}>{pct(e.slowdown)}</Fact> : '—'}</td>
                  <td data-label="At the start" {...gap(w)}>{w ? <Fact k={`w.temp@${e!.year}`} v={w.temp}><Degrees c={w.temp} /></Fact> : '—'}</td>
                  <td data-label="Dew point" {...gap(w)}>{w ? <Fact k={`w.dew@${e!.year}`} v={w.dew}><Degrees c={w.dew} /></Fact> : '—'}</td>
                  <td data-label="Humidity" {...gap(w)}>{w ? <Fact k={`w.rh@${e!.year}`} v={w.humidity}>{Math.round(w.humidity)}%</Fact> : '—'}</td>
                  <td data-label="Wind" {...gap(w)}>{w ? <Fact k={`w.wind@${e!.year}`} v={w.wind}><Wind mps={w.wind} /></Fact> : '—'}</td>
                  <td data-label="Start time" {...gap(w?.start)}>{w?.start ? <Fact k={`w.start@${e!.year}`} v={w.start}>{w.start}</Fact> : '—'}</td>
                  {linked ? <LinkedYearCell label={page.city} year={l.year} /> : null}
                </tr>
              );
            })}
          </tbody>
        </CourseTable>
        {linked ? <LinkedYearNote /> : null}
        </div>
        {sections ? (
          <CourseTable id="numbers-sections-caption" caption={`${display}, 5K by 5K`}>
            <thead><tr><th scope="col">Section</th>{wet ? null : <><th scope="col">Climb</th><th scope="col">Descent</th><th scope="col">Net</th></>}<th scope="col" className="nowrap">Pace vs. avg.</th></tr></thead>
            <tbody>
              {sections.map((t, i) => (
                <tr key={i}>
                  <th scope="row">{sectionLabel(...SECTION_BOUNDS[i])}</th>
                  {wet ? null : (
                    <>
                      <td><Fact k={`t.gain@${i}`} v={t.gain_m}><Elevation metres={t.gain_m} /></Fact></td>
                      <td><Fact k={`t.loss@${i}`} v={t.loss_m}><Elevation metres={t.loss_m} /></Fact></td>
                      <td><Fact k={`t.net@${i}`} v={t.net_m}><NetElevation metres={t.net_m} /></Fact></td>
                    </>
                  )}
                  <td>{curve ? <Fact k={`curve@${i}`} v={curve[i]}>{signedPct(curve[i], 1)}</Fact> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </CourseTable>
        ) : null}
        {goals.length ? (
          <CourseTable id="numbers-goals-caption" caption={`${display}, goal by goal: finishes on each goal's pace through 20K`}>
            <thead><tr><th scope="col">Goal</th><th scope="col">Finishes</th><th scope="col">Made the goal</th><th scope="col">Sustained slowdown</th><th scope="col">Given back after 20K</th><th scope="col">Median finish</th><th scope="col">10th–90th percentile</th></tr></thead>
            <tbody>
              {goals.map(({ goal, row }) => (
                <tr key={goal}>
                  <th scope="row">{goalText(goal)}</th>
                  {row ? (
                    <>
                      <td><Fact k={`g.n@${goal}`} v={row.n}>{count(row.n)}</Fact></td>
                      <td><Fact k={`g.under@${goal}`} v={row.under}>{pct(row.under)}</Fact></td>
                      <td><Fact k={`g.sd@${goal}`} v={row.sd}>{pct(row.sd)}</Fact></td>
                      <td>{row.after20 > 0 ? '+' : ''}<Fact k={`g.after20@${goal}`} v={row.after20}>{minutes(row.after20)}</Fact></td>
                      <td><Fact k={`g.p50@${goal}`} v={row.fin[1]}>{clock(row.fin[1])}</Fact></td>
                      <td><Fact k={`g.p10@${goal}`} v={row.fin[0]}>{clock(row.fin[0])}</Fact>–<Fact k={`g.p90@${goal}`} v={row.fin[2]}>{clock(row.fin[2])}</Fact></td>
                    </>
                  ) : <td colSpan={6} className="course-reason" data-goal={goal}>{GOAL_GAP}</td>}
                </tr>
              ))}
            </tbody>
          </CourseTable>
        ) : null}
        {types ? (
          <CourseTable id="numbers-types-caption" caption={`${display}, pacing types`}>
            <thead><tr><th scope="col">Pacing type</th><th scope="col">{display}</th><th scope="col">Other courses</th></tr></thead>
            <tbody>
              {archetypes.map((a, i) => (
                <tr key={a.slug}>
                  <th scope="row">{a.name}</th>
                  <td><Fact k={`ty.share@${i}`} v={types.shares[i]}>{Math.round(types.shares[i] * 100)}%</Fact></td>
                  <td>{typesElsewhere ? <Fact k={`ty.else@${i}`} v={typesElsewhere.shares[i]}>{Math.round(typesElsewhere.shares[i] * 100)}%</Fact> : '–'}</td>
                </tr>
              ))}
            </tbody>
          </CourseTable>
        ) : null}
        {how ? <HowLink href={how} /> : null}
      </div>
    </details>
  );
}
