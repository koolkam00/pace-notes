'use strict';
// pacing.json rebuilt from the extract for the source recount (scripts/verify-half-source.cjs), independently of
// analysis/half_pacing.py: how halves are paced (docs/HALF_MARATHON.md, rule R5). The recount's own parser of the 10 km
// time, its own qualifying rule, edition rule and screen, its own histogram range, and the same order of operations
// for the measure, so the published values compare exactly.
const D = require('./derive.cjs');

const MIN_CELL = 100, MIN_EDITIONS = 3;
const FIRST_KM = 10, LAST_KM = 11.0975;
const PACE = [120, 1200];
const EDITION_MIN_RESULTS = 500, EDITION_MIN_SHARE = 0.5;
const SCREEN = [-0.06, 0.12];
const SLOWER = 0.10;
const BAND_S = 1200, BANDS_FROM_S = 3600, BANDS_TO_S = 12000;
const MIN_BAND_LABELS = 3;
const FAMILY = { editions: 20, labels: 10, labelShare: 0.5 };
const SPLIT_FLAGS = ['split_nonmonotonic', 'split_after_finish'];
const RULE = {
  measure: 'pace over the last 11.0975 km against pace over the first 10 km: ((finish - t10) / 11.0975) / (t10 / 10) - 1',
  result: 'a usable finish outside the R7 block whose 10 km time parses (H:MM:SS or M:SS), 0 < t10 < finish, both parts '
    + '2:00 to 20:00 per km inclusive, neither split_nonmonotonic nor split_after_finish set by the release',
  edition: 'at least 500 qualifying results, at least half of its usable finishes, its own median change from -6% to +12% inclusive',
  label: "the edition's city key in the release",
  faster: 'change below zero',
  slower10: 'change above +10%',
  histogram: 'whole points of the change, rounded down; every bin and both open tails hold at least 100 results',
};

/** Seconds of an elapsed clock string, as the marathon pipeline reads one (spaces trimmed; H:MM:SS or M:SS), or NaN. */
function clockSeconds(text) {
  const s = String(text).replace(/^ +| +$/g, '');
  let m = /^([0-9]{1,3}):([0-5][0-9]):([0-5][0-9](?:\.[0-9]+)?)$/.exec(s);
  if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = /^([0-9]{1,4}):([0-5][0-9](?:\.[0-9]+)?)$/.exec(s);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return NaN;
}

const changeOf = (finish, t10) => ((finish - t10) / LAST_KM) / (t10 / FIRST_KM) - 1;

function three(c) {
  let faster = 0, slower = 0;
  for (const x of c) { if (x < 0) faster++; if (x > SLOWER) slower++; }
  return { median: D.sh(D.npMedian(c)), faster: D.sh(faster / c.length), slower10: D.sh(slower / c.length) };
}

/** Whole-point bins with open tails, every bin and tail at least MIN_CELL, holding the edges 0 and +10; else null. */
function histogram(c) {
  const bins = new Map();
  for (const x of c) { const b = Math.floor(x * 100); bins.set(b, (bins.get(b) || 0) + 1); }
  const get = (k) => bins.get(k) || 0;
  const m = Math.floor(D.npMedian(c) * 100);
  if (get(m) < MIN_CELL) return null;
  let lo = m, hi = m + 1;
  while (get(lo - 1) >= MIN_CELL) lo--;
  while (get(hi) >= MIN_CELL) hi++;
  let under = 0, over = 0;
  for (const [b, n] of bins) { if (b < lo) under += n; else if (b >= hi) over += n; }
  while (under < MIN_CELL && lo < hi) { under += get(lo); lo++; }
  while (over < MIN_CELL && lo < hi) { hi--; over += get(hi); }
  const edge = Math.round(SLOWER * 100);
  if (!(lo <= 0 && hi >= edge)) return null;
  const counts = [];
  for (let k = lo; k < hi; k++) counts.push(get(k));
  return { lo, hi, under_lo: under, at_or_over_hi: over, counts };
}

function group(c, editions, labels) {
  const e = new Set(editions).size, l = new Set(labels).size;
  if (c.length < MIN_CELL || e < MIN_EDITIONS) return null;
  const hist = histogram(c);
  if (!hist) return null;
  return { n: c.length, e, l, ...three(c), hist };
}

/**
 * `fin`: the usable finishes (id, edition index, finish, r7 block); `editions`: the edition table (city, year, group,
 * edition_id); `db`: the extract (race_records.split_10km and qa_flags). Returns the file, or null under a family floor.
 */
function pacing({ db, fin, editions }) {
  const flagged = new Set();
  for (const r of db.prepare(`SELECT record_id FROM qa_flags WHERE flag IN (${SPLIT_FLAGS.map((f) => `'${f}'`).join(', ')})`).iterate()) flagged.add(r.record_id);
  const text = new Map();
  for (const r of db.prepare('SELECT id, split_10km FROM race_records WHERE split_10km IS NOT NULL').iterate()) text.set(r.id, r.split_10km);

  const usable = new Map();
  const funnel = { with_10km_time: 0, unparsed: 0, flagged: 0, out_of_order: 0, out_of_pace_bounds: 0, qualifying: 0 };
  const byEdition = new Map();
  for (let k = 0; k < fin.n; k++) {
    if (fin.r7[k]) continue;
    const e = fin.ed[k];
    usable.set(e, (usable.get(e) || 0) + 1);
    const s = text.get(fin.id[k]);
    if (s === undefined) continue;
    funnel.with_10km_time++;
    const t10 = clockSeconds(s), finish = fin.finish[k];
    if (Number.isNaN(t10)) { funnel.unparsed++; continue; }
    if (flagged.has(fin.id[k])) { funnel.flagged++; continue; }
    if (!(t10 > 0 && t10 < finish)) { funnel.out_of_order++; continue; }
    const first = t10 / FIRST_KM, last = (finish - t10) / LAST_KM;
    if (!(first >= PACE[0] && first <= PACE[1] && last >= PACE[0] && last <= PACE[1])) { funnel.out_of_pace_bounds++; continue; }
    funnel.qualifying++;
    if (!byEdition.has(e)) byEdition.set(e, { c: [], finish: [] });
    const g = byEdition.get(e);
    g.c.push(changeOf(finish, t10)); g.finish.push(finish);
  }

  let candidates = 0;
  const kept = [], removed = [];
  for (const [e, g] of [...byEdition].sort(([a], [b]) => editions[a].edition_id - editions[b].edition_id)) {
    const n = g.c.length;
    if (n < EDITION_MIN_RESULTS || n < EDITION_MIN_SHARE * usable.get(e)) continue;
    candidates++;
    const med = D.npMedian(g.c);
    if (med >= SCREEN[0] && med <= SCREEN[1]) kept.push(e);
    else removed.push({ label: editions[e].city, year: editions[e].year, n, below: med < SCREEN[0] });
  }
  removed.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.year - b.year));

  const c = [], ed = [], lab = [], finish = [];
  for (const e of kept) {
    const g = byEdition.get(e);
    for (let i = 0; i < g.c.length; i++) { c.push(g.c[i]); ed.push(e); lab.push(editions[e].city); finish.push(g.finish[i]); }
  }
  const byLabel = new Map();
  for (let i = 0; i < c.length; i++) {
    if (!byLabel.has(lab[i])) byLabel.set(lab[i], { c: [], eds: new Set() });
    const g = byLabel.get(lab[i]);
    g.c.push(c[i]); g.eds.add(ed[i]);
  }
  const largest = Math.max(0, ...[...byLabel.values()].map((g) => g.c.length));
  if (kept.length < FAMILY.editions || byLabel.size < FAMILY.labels || largest > FAMILY.labelShare * c.length) return null;
  const overall = group(c, ed, lab);
  if (!overall) return null;

  const editionRows = kept.map((e) => ({ n: byEdition.get(e).c.length, ...three(byEdition.get(e).c) }));
  editionRows.sort((a, b) => a.n - b.n || a.median - b.median || a.faster - b.faster || a.slower10 - b.slower10);
  const med = (key, rows) => D.sh(D.npMedian(rows.map((x) => x[key])));
  const editionsEqual = { editions: editionRows.length, median: med('median', editionRows), faster: med('faster', editionRows),
    slower10: med('slower10', editionRows), above_zero: editionRows.filter((x) => x.median > 0).length };

  // Each label left out: the rest's median and share faster. The rest is the sorted whole without the label's values.
  const own = [], labelRows = [];
  for (const [name, g] of byLabel) {
    const values = three(g.c);
    own.push(values);
    const rest = [];
    for (let i = 0; i < c.length; i++) if (lab[i] !== name) rest.push(c[i]);
    let faster = 0;
    for (const x of rest) if (x < 0) faster++;
    const shown = g.c.length >= MIN_CELL && g.eds.size >= MIN_EDITIONS;
    labelRows.push({ label: name, n: g.c.length, e: g.eds.size, share: D.sh(g.c.length / c.length),
      median: shown ? values.median : null, faster: shown ? values.faster : null, slower10: shown ? values.slower10 : null,
      without: { median: D.sh(D.npMedian(rest)), faster: D.sh(faster / rest.length) } });
  }
  labelRows.sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  const labelsEqual = { labels: own.length, median: med('median', own), faster: med('faster', own), slower10: med('slower10', own) };
  const without = labelRows.map((x) => x.without);
  const leaveLabelOut = { median_min: Math.min(...without.map((x) => x.median)), median_max: Math.max(...without.map((x) => x.median)),
    faster_min: Math.min(...without.map((x) => x.faster)), faster_max: Math.max(...without.map((x) => x.faster)) };

  const bands = [];
  for (let lo = BANDS_FROM_S; lo < BANDS_TO_S; lo += BAND_S) {
    const at = [];
    for (let i = 0; i < c.length; i++) if (finish[i] >= lo && finish[i] < lo + BAND_S) at.push(i);
    const g = at.length ? group(at.map((i) => c[i]), at.map((i) => ed[i]), at.map((i) => lab[i])) : null;
    if (g && g.l >= MIN_BAND_LABELS) bands.push({ lo_s: lo, ...g });
  }

  const verified = kept.filter((e) => editions[e].group === 'verified');
  return {
    family: 'half-pacing', schema_version: 1, scope: 'usable',
    rule: RULE,
    rules: { first_km: FIRST_KM, last_km: LAST_KM, pace_s_per_km: PACE, edition_min_results: EDITION_MIN_RESULTS, edition_min_share: EDITION_MIN_SHARE,
      screen: SCREEN, slower: SLOWER, band_s: BAND_S, bands_from_s: BANDS_FROM_S, bands_to_s: BANDS_TO_S, min_band_labels: MIN_BAND_LABELS,
      family_min_editions: FAMILY.editions, family_min_labels: FAMILY.labels, family_max_label_share: FAMILY.labelShare },
    cohort: { results: c.length, editions: kept.length, labels: byLabel.size, usable_finishes: kept.reduce((a, e) => a + usable.get(e), 0), funnel,
      verified: { editions: verified.length, results: verified.reduce((a, e) => a + byEdition.get(e).c.length, 0) } },
    screen: { candidates, removed },
    overall,
    editions_equal: editionsEqual,
    labels_equal: labelsEqual,
    leave_label_out: leaveLabelOut,
    labels: labelRows,
    edition_rows: editionRows,
    bands,
  };
}

module.exports = { pacing, clockSeconds, changeOf, histogram, three };
