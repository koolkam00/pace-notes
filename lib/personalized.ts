import { PERSONAL_QUESTIONS, type Profile } from './personalized-catalog';
import type { CityData, PersonalCohort, PersonalSummary, Distribution, CheckpointData, Sample } from './personalized-types';
import type { ChartSpec } from './research-data';
import { MARATHON_SECTION_ENDS, sectionLabel } from './section-labels';

export const GUIDE_PACK = 'ext_personalized_guide';
export const defaultProfile: Profile = { city: 'New York', age: 'all', gender: 'all', goal: 180, previous: null, focus: 'prepare' };
export const clock = (seconds: number, showSeconds = false) => {
  const s = Math.round(seconds);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}${showSeconds ? `:${String(s % 60).padStart(2, '0')}` : ''}`;
};
// The guide's time readers. A dot or comma between groups is read as a colon ("3.30", "2.50.00"), as a keypad types it.
export const parseMinutes = (text: string) => {
  const match = /^(\d{1,2})[:.,]([0-5]\d)$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
export const parseElapsed = (text: string) => {
  const match = /^(\d{1,2})[:.,]([0-5]\d)(?:[:.,]([0-5]\d))?$/.exec(text.trim());
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) : null;
};
export const parseSection = (text: string) => {
  const match = /^(\d{1,3})[:.,]([0-5]\d)$/.exec(text.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
export const priorBand = (previous: number | null) => previous === null ? 'all' : String(Math.floor(previous / 15) * 15);
export const targetBucket = (target: number) => Math.round(target / 15) * 15;
export const finishBand = (target: number) => `${clock(targetBucket(target) * 60 - 450, true)}–${clock(targetBucket(target) * 60 + 450, true)}`;
export const cohortKey = (age: string, gender: string, prior: string) => `${age}|${gender}|${prior}`;
export const percentUnder = (row: Distribution, target: number): number | null => {
  const index = target - (row.cdf_min ?? 150);
  if (!Number.isInteger(index) || index < 0 || index >= row.cdf.length || row.n <= 0) return null;
  const hits = row.cdf[index];
  return Number.isFinite(hits) && hits >= 0 && hits <= row.n ? 100 * hits / row.n : null;
};
export const fmt = (value: number | null) => value === null ? 'Not available' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
export const count = (value: number) => new Intl.NumberFormat('en-US').format(value);
const pace = (seconds: number) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, '0')}/km`;

export function candidates(profile: Profile): string[] {
  const previous = priorBand(profile.previous);
  return [...new Set([
    cohortKey(profile.age, profile.gender, previous), cohortKey('all', profile.gender, previous),
    cohortKey(profile.age, 'all', previous), cohortKey('all', 'all', previous),
    cohortKey(profile.age, profile.gender, 'all'), cohortKey('all', profile.gender, 'all'),
    cohortKey(profile.age, 'all', 'all'), 'all|all|all',
  ])];
}
export function chooseCohort(data: CityData, profile: Profile, usable: (row: PersonalCohort) => boolean): PersonalCohort | undefined {
  for (const key of candidates(profile)) {
    const row = data.cohorts[key];
    if (row && usable(row)) return row;
  }
}
export function comparisonLabel(city: string, row: Pick<PersonalCohort, 'age' | 'gender' | 'prior'>): string {
  return [city, row.age === 'all' ? 'all ages' : `age ${row.age}`, row.gender === 'all' ? 'all recorded categories' : row.gender,
    row.prior === 'all' ? 'all earlier-time bands' : `earlier best ${clock(Number(row.prior) * 60)} to under ${clock((Number(row.prior) + 15) * 60)}`].join(' · ');
}
export function widening(profile: Profile, row: Pick<PersonalCohort, 'age' | 'gender' | 'prior'>): string {
  const changed = [];
  if (profile.age !== 'all' && row.age === 'all') changed.push('age');
  if (profile.gender !== 'all' && row.gender === 'all') changed.push('gender');
  if (profile.previous !== null && row.prior === 'all') changed.push('earlier time');
  return changed.length ? `Broader comparison: ${changed.join(', ')} ${changed.length === 1 ? 'was' : 'were'} widened because the narrower result lacked enough observations.` : '';
}

export type GuideAnswer = { id: string; title: string; answer: string; detail: string; method: string; charts: ChartSpec[]; comparison?: string; widened?: string; sample?: Sample };
const bars = (title: string, unit: string, rows: ChartSpec['rows'], series = [{ key: 'value', label: title }], note = ''): ChartSpec => ({ title, unit, rows, series, xLabel: 'Group', kind: 'bars', note });
const profileChart = (row: Distribution, title: string): ChartSpec => ({
  title, unit: 'min/km', xLabel: 'Section end (km)', xNumeric: true, kind: 'line', sectionEnds: MARATHON_SECTION_ENDS,
  band: { lower: 'low', upper: 'high' },
  rows: MARATHON_SECTION_ENDS.map((end, i) => ({ label: end, low: row.pace[i][0] / 60, value: row.pace[i][1] / 60, high: row.pace[i][2] / 60, n_low: row.n, n_value: row.n, n_high: row.n })),
  series: [{ key: 'value', label: 'Median section pace' }, { key: 'low', label: '25th percentile' }, { key: 'high', label: '75th percentile' }],
  note: 'The shaded middle 50% describes variation among finishes. It is not a confidence interval or a recommended pace range.',
});

export function buildGuide(data: CityData, summary: PersonalSummary, profile: Profile): GuideAnswer[] {
  const target = profile.goal, bucket = String(targetBucket(target));
  // Already every course and runner: there is nothing broader to suggest, and the finish time is what lacks finishes.
  const broadest = profile.city === 'All courses' && profile.age === 'all' && profile.gender === 'all' && profile.previous === null;
  return PERSONAL_QUESTIONS.map(question => {
    const answer: GuideAnswer = broadest
      ? { ...question, answer: 'There are not enough eligible observations for this comparison at this finish time.', detail: 'Every course and runner is already included. A missing result is never filled with an invented estimate.', charts: [] }
      : { ...question, answer: 'There are not enough eligible observations for this comparison on the selected course.', detail: 'Choose a broader profile or All courses. A missing result is never filled with an invented estimate.', charts: [] };
    const use = (cohort: PersonalCohort, sample: Sample = cohort) => {
      answer.comparison = comparisonLabel(data.city, cohort); answer.widened = widening(profile, cohort); answer.sample = sample;
    };
    if (question.id === 'profile' || question.id === 'terrain') {
      const cohort = chooseCohort(data, profile, c => !!c.profiles[bucket]);
      if (!cohort) return answer;
      const row = cohort.profiles[bucket]; use(cohort, row);
      const slowest = row.pace.reduce((best, p, i) => p[1] > row.pace[best][1] ? i : best, 0);
      answer.answer = `Among finishes in ${finishBand(target)}, ${sectionLabel(MARATHON_SECTION_ENDS[slowest])} has the slowest median section pace: ${pace(row.pace[slowest][1])}.`;
      answer.detail = `This describes ${count(row.n)} achieved finishes in the displayed band. Your comparison threshold is ${clock(target * 60)}; historical intentions are unknown.`;
      answer.charts = [profileChart(row, 'Pace through the full course')];
      if (question.id === 'terrain') {
        const segments = data.terrain.filter(t => MARATHON_SECTION_ENDS.includes(t.end));
        if (!segments.length) { answer.answer = 'No supplied terrain profile is available for this course selection.'; answer.detail = 'The pacing profile is still available. Select an individual course with a supplied profile to align terrain and pace.'; return answer; }
        const uphill = segments.reduce((best, segment) => segment.net > best.net ? segment : best, segments[0]);
        answer.answer = `The supplied profile shows ${fmt(uphill.net)} m of net elevation change in ${sectionLabel(uphill.end)}, its largest section rise. Compare this with the observed pace profile below.`;
        answer.detail = 'This is the available city route profile alongside pooled historical finishes. It does not establish the terrain used in each edition or explain an individual slowdown.';
        answer.charts.unshift(bars('Net elevation change in the supplied route', 'm', segments.map(t => ({ label: sectionLabel(t.end), value: t.net })), undefined, 'Net change conceals climbs followed by descents. Historical route validity is unknown.'));
        const withClimb = segments.filter(t => t.gain !== null && t.loss !== null);
        if (withClimb.length) answer.charts.splice(1, 0, bars('Supplied climbing and descending estimates', 'm', withClimb.map(t => ({ label: sectionLabel(t.end), gain: t.gain, loss: Math.abs(t.loss!) })), [{ key: 'gain', label: 'Climbing' }, { key: 'loss', label: 'Descending' }], 'These supplied estimates do not fully reconcile with the separately supplied net changes. They are route proxies, not verified historical elevations.'));
      }
    } else if (question.id === 'opening' || question.id === 'downhill') {
      const cohort = chooseCohort(data, profile, c => Object.values(c.openings).filter(row => question.id === 'downhill' || percentUnder(row, target) !== null).length >= 2);
      if (!cohort) return answer;
      const groups = ['Faster opening', 'Similar opening', 'Slower opening'].filter(g => cohort.openings[g] && (question.id === 'downhill' || percentUnder(cohort.openings[g], target) !== null));
      const n = groups.reduce((sum, group) => sum + cohort.openings[group].n, 0);
      use(cohort); answer.sample = undefined;
      const rows = groups.map(label => ({ label, value: question.id === 'opening' ? percentUnder(cohort.openings[label], target) : cohort.openings[label].late, n_value: cohort.openings[label].n }));
      if (question.id === 'opening') {
        answer.answer = groups.map(group => `${group.replace(' opening', ' openings')}: ${fmt(percentUnder(cohort.openings[group], target))}% finished below ${clock(target * 60)}`).join('. ') + '.';
        answer.detail = `Opening pace is compared with each runner’s earlier recorded best, not a known declared goal. ${count(n)} finishes are represented across the displayed groups; each group has its own denominator.`;
        answer.charts = [bars('Finishes strictly below your threshold', '%', rows)];
      } else {
        const early = data.terrain.filter(t => t.end === 5 || t.end === 10);
        const descent = early.length === 2 && early.reduce((sum, t) => sum + t.net, 0) < 0;
        answer.answer = descent ? `The supplied first 10 km has a net descent of ${fmt(-early.reduce((sum, t) => sum + t.net, 0))} m. Late pace differs across the observed opening groups.` : 'A net-downhill first 10 km is not documented for this selection. These are general opening and late-pacing comparisons.';
        answer.detail = groups.map(group => `${group}: ${fmt(cohort.openings[group].late)}% median late pace change`).join('; ') + '. Positive means slower over the final 12.195 km than the 5–20 km baseline. This does not establish a downhill effect.';
        answer.charts = [bars('Late pace change by opening group', '% pace', rows)];
      }
    } else if (question.id === 'sections') {
      const cohort = chooseCohort(data, profile, c => c.near.some(x => x.target === target));
      if (!cohort) return answer;
      const near = cohort.near.find(x => x.target === target)!; use(cohort); answer.sample = undefined;
      const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
      answer.answer = `Nearby finishes averaged ${clock(sum(near.below.durations), true)} below the threshold and ${clock(sum(near.above.durations), true)} above it.`;
      answer.detail = `Compare ${count(near.below.n)} finishes in the five minutes below ${clock(target * 60)} with ${count(near.above.n)} from ${clock(target * 60)} to under ${clock((target + 5) * 60)}. Higher values mean more time spent than the target’s even-pace section budget.`;
      answer.charts = [bars('Minutes relative to the even-pace section budget', 'min', MARATHON_SECTION_ENDS.map((end, i) => {
        const km = end - (i ? MARATHON_SECTION_ENDS[i - 1] : 0), budget = target * km / 42.195;
        return { label: sectionLabel(end), below: near.below.durations[i] / 60 - budget, above: near.above.durations[i] / 60 - budget, n_below: near.below.n, n_above: near.above.n };
      }), [{ key: 'below', label: 'Just below the threshold' }, { key: 'above', label: 'Just above the threshold' }])];
    } else if (question.id === 'age') {
      let rows: { cohort: PersonalCohort; value: Distribution }[] = [];
      for (const key of candidates({ ...profile, age: 'all' })) {
        const [, gender, prior] = key.split('|');
        rows = Object.values(data.cohorts).filter(c => c.age !== 'all' && c.gender === gender && c.prior === prior).flatMap(c => {
          const value = prior !== 'all' ? c : c.profiles[bucket]; return value ? [{ cohort: c, value }] : [];
        }).sort((a, b) => Number(a.cohort.age.split('–')[0]) - Number(b.cohort.age.split('–')[0]));
        if (rows.length >= 2) break;
      }
      if (rows.length < 2) return answer;
      const base = rows[0].cohort; use({ ...base, age: 'all' }); answer.sample = undefined; answer.widened = widening({ ...profile, age: 'all' }, base);
      answer.answer = `These ${rows.length} age groups can be compared within ${base.prior === 'all' ? `the ${finishBand(target)} achieved-time band` : 'the same displayed earlier-time band'}.`;
      answer.detail = 'Positive values mean the second 20 km was slower than the first. The final 2.195 km is separate. Each age group shows its own sample; this does not track individuals as they age.';
      answer.charts = [bars('Pace retention across exact-age groups', '% pace', rows.map(({ cohort, value }) => ({ label: `${cohort.age}${cohort.age === profile.age ? ' (selected)' : ''}`, value: value.retention, n_value: value.n })))];
    } else if (question.id === 'checkpoint') {
      answer.answer = 'Compare a checkpoint time with the outcomes of runners at similar progress.';
      answer.detail = 'The starting example follows your selected target’s even-pace schedule. Enter an actual elapsed time to review a past race.';
    } else if (question.id === 'courses') {
      let rows: PersonalSummary['courses'] = [];
      for (const key of candidates(profile)) {
        const [age, gender, prior] = key.split('|');
        rows = summary.courses.filter(row => row.age === age && row.gender === gender && row.prior === prior);
        if (rows.length >= 2) break;
      }
      if (rows.length < 2) return answer;
      rows.sort((a, b) => a.values[1] - b.values[1]);
      answer.comparison = comparisonLabel('Courses with enough coverage', rows[0]); answer.widened = widening(profile, rows[0]);
      answer.answer = `${rows[0].city} has the lowest median finish-time change relative to earlier recorded bests among these ${rows.length} comparable course groups: ${fmt(rows[0].values[1])}%.`;
      answer.detail = 'Below zero means faster than the earlier benchmark. The 10th–90th percentile range describes outcome variation. Course, field selection, fitness changes and conditions remain mixed together.';
      answer.charts = [bars('Outcome and spread by course', '% change', rows.map(r => ({ label: r.city, low: r.values[0], value: r.values[1], high: r.values[2], n_low: r.n, n_value: r.n, n_high: r.n })), [{ key: 'low', label: '10th percentile' }, { key: 'value', label: 'Median' }, { key: 'high', label: '90th percentile' }])];
    } else if (question.id === 'weather') {
      const cohort = chooseCohort(data, profile, c => c.weather.length >= 2) || chooseCohort(data, profile, c => c.weather.length > 0);
      if (!cohort) return answer;
      use(cohort); answer.sample = undefined;
      const bands = ['Below 10°C', '10–14.9°C', '15–19.9°C', '20°C or warmer'];
      const weather = [...cohort.weather].sort((a, b) => bands.indexOf(a.band) - bands.indexOf(b.band));
      answer.answer = weather.length > 1 ? `There are ${weather.length} temperature bands with enough edition coverage for this comparison.` : 'Only one temperature band has enough coverage; it cannot establish a difference between cooler and warmer days.';
      answer.detail = weather.map(w => `${w.band}: ${fmt(w.value)}% average of edition medians (${w.editions} editions)`).join('; ') + '. Values compare finishes with earlier recorded bests, not the visitor’s chosen target. Every edition has equal weight.';
      answer.charts = [bars('Performance relative to earlier best, by start-hour temperature', '% change', weather.map(w => ({ label: w.band, value: w.value, n_value: w.n })), undefined, 'At least three editions and 100 finishes per band. This does not isolate a temperature penalty.')];
    } else if (question.id === 'ambition') {
      const cohort = chooseCohort(data, profile, c => percentUnder(c, target) !== null); if (!cohort) return answer; use(cohort);
      answer.answer = `${fmt(percentUnder(cohort, target))}% of this historical comparison group finished below ${clock(target * 60)}. Its median finish was ${clock(cohort.finish[1], true)}.`;
      answer.detail = cohort.prior === 'all' ? 'This is a field comparison without an earlier-time restriction. It does not estimate your fitness or personal chance of success.' : 'These runners had earlier recorded bests in the displayed time band. The proportion is descriptive, not a calibrated prediction of your next race.';
      answer.charts = [{ title: 'Fraction finishing below each threshold', unit: '%', xLabel: 'Finish-time threshold', xUnit: 'finish', xNumeric: true, kind: 'line', rows: cohort.cdf.map((hits, i) => ({ label: (cohort.cdf_min ?? 150) + i, value: 100 * hits / cohort.n, n_value: cohort.n })), series: [{ key: 'value', label: 'Below threshold' }], note: 'Changing the target changes the threshold being counted, not the underlying performances.' }];
    } else if (question.id === 'return') {
      const cohort = chooseCohort(data, profile, c => !!c.repeat); if (!cohort) return answer;
      const row = cohort.repeat!; use(cohort, row);
      answer.answer = `Across ${count(row.n)} same-course pairs, the later finish averaged ${fmt(Math.abs(row.finish_change))} minutes ${row.finish_change < 0 ? 'faster' : 'slower'}.`;
      answer.detail = 'Both appearances are normalized to their own marathon average. These paired changes can reflect fitness, conditions and route changes as well as familiarity. They are not selected by the visitor’s target.';
      answer.charts = [{ title: 'How the same runners distributed their pace', unit: '% pace', xLabel: 'Section end (km)', xNumeric: true, kind: 'line', sectionEnds: MARATHON_SECTION_ENDS,
        rows: MARATHON_SECTION_ENDS.map((end, i) => ({ label: end, previous: row.previous[i], current: row.current[i], n_previous: row.n, n_current: row.n })), series: [{ key: 'previous', label: 'Earlier appearance' }, { key: 'current', label: 'Later appearance' }] }];
    } else if (question.id === 'gains') {
      const cohort = chooseCohort(data, profile, c => !!c.gains[bucket]); if (!cohort) return answer;
      const row = cohort.gains[bucket]; use(cohort, row);
      answer.answer = `Improving finishes in ${finishBand(target)} gained ${fmt(row.total)} minutes on average versus an earlier recorded best: from ${clock(row.previous, true)} to ${clock(row.current, true)}.`;
      answer.detail = 'The three block gains add to the mean total improvement. Negative means the improving runners were, on average, slower in that block despite a faster overall finish.';
      answer.charts = [bars('Where the mean finish improvement came from', 'min', ['Opening 10 km', 'Middle 20 km', 'Final 12.195 km'].map((label, i) => ({ label, value: row.values[i], n_value: row.n })))];
    }
    return answer;
  });
}

export function checkpointResult(data: CheckpointData, profile: Profile, checkpoint: number, elapsed: number, lastSection: number | null) {
  const elapsedBand = Math.floor(elapsed / 120) * 2;
  const ratio = lastSection === null ? null : (lastSection / 5) / (elapsed / checkpoint);
  const trend = ratio === null ? 'all' : ratio < .98 ? 'Faster recent section' : ratio <= 1.02 ? 'Similar recent section' : 'Slower recent section';
  const keys = candidates({ ...profile, previous: null });
  for (const requestedTrend of [...new Set([trend, 'all'])]) for (const key of keys) {
    const [age, gender] = key.split('|');
    const row = data.rows.find(r => r.checkpoint === checkpoint && r.elapsed === elapsedBand && r.trend === requestedTrend && r.age === age && r.gender === gender && percentUnder(r, profile.goal) !== null);
    if (row) return { row, trendWidened: requestedTrend !== trend, comparison: `${data.city} · ${age === 'all' ? 'all ages' : age} · ${gender === 'all' ? 'all recorded categories' : gender} · ${clock(elapsedBand * 60)} to under ${clock((elapsedBand + 2) * 60)} at ${checkpoint} km · ${requestedTrend === 'all' ? 'all recent pace trends' : requestedTrend.toLowerCase()}`, widened: widening({ ...profile, previous: null }, { age, gender, prior: 'all' }) };
  }
  return null;
}
