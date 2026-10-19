'use strict';
// Independent recounts of the tool nuggets (WP4), for scripts/verify-nuggets.cjs. Each reads the verified tool files
// directly and recomputes the nugget's values with a second, deliberately plain implementation, then checks the guard
// and that the shown sentence names the recounted figures. `fixtures()` builds each nugget from data whose guard fails
// and checks that its neutral fallback renders. The example inputs (the 4:00 goal, the split check's example race, the
// weather match's example morning and reference window) are restated here on purpose, so a change to one is noticed.
module.exports = function tools({ json, eq, ok, core }) {
  const GOAL = 240;
  const shown = (n, units = 'mi') => core.sentenceOf(n, units);
  const pct = (share) => `${Math.round(share * 100)}%`;
  const hm = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
  const msOf = (s) => { const t = Math.round(Math.abs(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const R = {};

  // plan.goal: every course's row at the goal, pooled by finishes.
  R['plan.goal'] = (n) => {
    const data = json('public/data/insights/tools/course-goal.json');
    const rows = data.rows.filter((r) => r.goal === GOAL);
    let total = 0;
    let made = 0;
    for (const r of rows) { total += r.n; made += r.n * r.under; }
    eq([n.values.n, n.values.courses], [total, rows.length], 'plan.goal recounts the pooled finishes and courses');
    ok(Math.abs(n.values.under - made / total) < 1e-9, 'plan.goal recounts the pooled share');
    eq(n.guard, total >= 100 && made / total < 0.5, 'plan.goal: guard');
    if (n.guard) ok(shown(n).includes(`within ${Math.round(data.tolerance * 100)}% of 4:00 pace through 20K, *${Math.round((made / total) * 100)}* made 4:00`), 'plan.goal: the headline names the window and the recounted share');
  };

  // projector.range: all courses, the 25K mat, the 2-minute band whose top is the goal; its 10th and 90th percentile
  // finishes, widened to whole minutes.
  R['projector.range'] = (n) => {
    const index = json('public/data/insights/tools/projector.json');
    const shard = json('public/data/insights/tools/projector/all/25.json');
    const cells = shard.cells.all;
    const band = GOAL * 60 - shard.band_s;
    const i = cells.b.indexOf(band);
    ok(i >= 0, 'projector.range: the goal band is published');
    const q = cells.q[i];
    const p10 = q[index.quantiles.indexOf(0.1)];
    const p90 = q[index.quantiles.indexOf(0.9)];
    const spread = Math.ceil(p90 / 60) - Math.floor(p10 / 60);
    eq([n.values.band, n.values.n, n.values.p10, n.values.p90, n.values.spread], [band, cells.n[i], p10, p90, spread], 'projector.range recounts the band, its finishes and the window');
    eq(n.guard, cells.n[i] >= 100 && spread > 0, 'projector.range: guard');
    if (n.guard) ok(shown(n).includes(`*${spread}-minute*`) && n.figure.value === String(spread), 'projector.range: the headline and figure name the recounted window');
    ok(shown(n).includes(`on course for ${hm(GOAL - shard.band_s / 60)}–${hm(GOAL)} at 25K`), 'projector.range: the group is named by its own band');
  };

  // splitcheck.share: the pace band's all-course group for the whole minute three above the example finish (4:03:31):
  // its sustained-slowdown share, as the split check's dot grid draws it.
  R['splitcheck.share'] = (n) => {
    const shard = json('public/data/insights/tools/pace-band/all/all.json');
    const finish = 4 * 3600 + 3 * 60 + 31;
    const minute = Math.floor(finish / 60) + 3;
    const i = shard.groups.all.g.indexOf(minute);
    ok(i >= 0, 'splitcheck.share: the example window is published');
    const all = { n: shard.groups.all.n[i], sd: shard.groups.all.sd ? shard.groups.all.sd[i] : null };
    const j = shard.groups.slowdown.g.indexOf(minute);
    const sd = all.sd ?? shard.groups.slowdown.n[j] / all.n;
    eq([n.values.minute, n.values.n], [minute, all.n], 'splitcheck.share recounts the window');
    ok(Math.abs(n.values.sd - sd) < 1e-12, 'splitcheck.share recounts the share');
    eq(n.guard, all.n >= 100 && sd > 0 && sd < 1, 'splitcheck.share: guard');
    const lo = minute - shard.window_s / 60;
    if (n.guard) ok(shown(n).includes(`from ${hm(lo)} to ${hm(minute - 1)}`) && shown(n).includes(`*${pct(sd)}*`) && n.figure.value === pct(sd).replace('%', ''), 'splitcheck.share: the headline and figure name the window and the share');
  };

  // weathermatch.mornings: 18 °C ±2 against 8–12 °C, in the 5–20K pace band holding 4:00 even pace.
  R['weathermatch.mornings'] = (n) => {
    const data = json('public/data/insights/tools/weather-match.json');
    const pace = (GOAL * 60) / 42.195;
    const [lo] = data.pace_range_s;
    const band = lo + data.pace_step_s * Math.floor((pace - lo) / data.pace_step_s);
    const row = (c) => data.rows.find((r) => r.c === c && r.hw === 2 && r.pace === band);
    const mine = row(18);
    const ref = row(10);
    ok(mine && ref, 'weathermatch.mornings: both rows are published');
    eq([n.values.band, n.values.n, n.values.sd, n.values.ref_n, n.values.ref_sd], [band, mine.n, mine.sd, ref.n, ref.sd], 'weathermatch.mornings recounts both rows');
    eq(n.guard, mine.n >= 100 && ref.n >= 100 && mine.sd >= ref.sd + 0.02, 'weathermatch.mornings: guard');
    if (n.guard) {
      ok(shown(n, 'mi').includes('64°F mornings') && shown(n, 'km').includes('18°C mornings'), 'weathermatch.mornings: the morning follows the units');
      ok(shown(n).includes(`*${pct(mine.sd)}*`) && shown(n).includes(`against ${pct(ref.sd)}`), 'weathermatch.mornings: the headline names both shares');
    }
  };

  function fixtures(T) {
    const pbGroup = (e3, e8, count) => ({ g: [246], n: [count], ed: [10], e50: [[0, 0, 0, e3, 0, 0, 0, 0, e8]], s50: [[]] });
    const pjShard = (q) => ({ band_s: 120, cells: { all: { b: [14280], n: [50], ed: [5], q: [q], later: [[]], rp: [0], sd: [[0, 0]] } } });
    const Q = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];
    const wRow = (c, sd) => ({ c, hw: 2, pace: 330, n: 500, ed: [1, 2, 3], sd, after20: 0, late: 0, fin: [0, 0, 0], profile: [] });
    return [
      [T.planGoalFrom([{ goal: 240, city: 'X', n: 400, ed: 5, under: 0.6, sd: 0.2, after20: 0, fin: [0, 0, 0] }]), '60% of finishes within 2% of 4:00 pace through 20K made 4:00.'],
      [T.planGoalFrom([]), 'Plan your race: a course, a goal and a pace band.'],
      [T.projectorRangeFrom(pjShard([14000, 14299, 14500, 14901, 15300, 15996, 16500]), Q), 'Finishes on course for 3:58–4:00 at 25K ended from 3:58 to 4:27.'],
      [T.projectorRangeFrom(null, Q), 'From a tracker time at any mat, the finishes that followed.'],
      [T.splitCheckShareFrom({ window_s: 300, groups: { all: pbGroup(0, 0, 50), held: pbGroup(0, 0, 40), slowdown: pbGroup(0, 0, 10) } }, 14611), 'Finishes from 4:01 to 4:05, mat by mat.'],
      [T.splitCheckShareFrom(null, 14611), 'Check your splits against finishes at the same time.'],
      [T.weatherMatchMorningsFrom({ rows: [wRow(18, 0.3), wRow(10, 0.3)], pace_range_s: [180, 675], pace_step_s: 15 }), 'At 4:00 pace, 30% of finishes on 64°F mornings had a sustained slowdown.'],
      [T.weatherMatchMorningsFrom(null), 'Race-morning weather, matched to past races at your pace.'],
    ];
  }

  return { RECOUNT: R, fixtures };
};
