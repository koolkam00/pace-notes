// Helpers for the chart recounts (scripts/charts/<theme>.cjs) and the comparison verify-charts.cjs runs on each one.
//
// A recount is (C, file, H) => ({ values, plot }). `values` must hold every key of the file's values. `plot` mirrors the
// file's plot: every number in it (and in any array of rows, bins, points or series) must be recounted, and a label or
// tone the recount gives is compared too. Presentation is not recounted: axis objects (anything with `fmt` and `min`
// or `cats`), notes, keys, bands, heights, domains and the like. Numbers compare exactly when both are integers;
// otherwise within 0.051 at 50 and above (seconds published to a tenth) and within 1e-6 below (shares, ratios).
const assert = require('node:assert/strict');
const { quantile, quantileSorted, median, MIN_CELL } = require('./cohort.cjs');

module.exports = function helpers(C) {
  let counted = 0;
  const PRESENTATION = new Set(['form', 'fmt', 'height', 'notes', 'key', 'domain', 'overlap', 'r', 'compareFmt', 'bands', 'anchor', 'dx', 'dy', 'leader', 'labelAt', 'dash', 'width', 'area', 'dots', 'values', 'invert', 'grid', 'arrow', 'gap', 'legend', 'leftTitle', 'rightTitle', 'rowTitle', 'colTitle', 'title', 'rest', 'caption', 'mark', 'diverging', 'highlight']);
  const isAxis = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'fmt' in v && ('min' in v || 'cats' in v);
  const isInt = (x) => Number.isInteger(x);

  function same(a, b, where) {
    assert.ok(typeof b === 'number' && Number.isFinite(b), `${where}: the recount gives no number (${b})`);
    counted++;
    if (isInt(a) && isInt(b)) return assert.equal(a, b, `${where}: ${a} published, ${b} recounted`);
    const tol = Math.abs(a) >= 50 ? 0.051 : 1e-6;
    assert.ok(Math.abs(a - b) <= tol, `${where}: ${a} published, ${b} recounted`);
  }

  function walk(a, b, where) {
    if (Array.isArray(a)) {
      // A list of labels (a heatmap's rows, a flow's columns) is compared only when the recount gives it.
      if (b === undefined && a.every((x) => typeof x === 'string')) return;
      assert.ok(Array.isArray(b), `${where}: the recount gives no list`);
      assert.equal(b.length, a.length, `${where}: ${a.length} items published, ${b.length} recounted`);
      a.forEach((x, i) => walk(x, b[i], `${where}[${i}]`));
      return;
    }
    if (a && typeof a === 'object') {
      if (isAxis(a)) return;
      assert.ok(b && typeof b === 'object', `${where}: the recount gives nothing`);
      for (const [k, v] of Object.entries(a)) {
        if (PRESENTATION.has(k) || isAxis(v)) continue;
        if (k === 'cols' && typeof v === 'number') continue;
        if (typeof v === 'string' || typeof v === 'boolean') { if (b[k] !== undefined) { counted++; assert.equal(b[k], v, `${where}.${k}`); } continue; }
        if (k === 'tone') continue;
        if (!(k in b)) {
          if (Array.isArray(v) && v.every((x) => typeof x === 'string')) continue;
          assert.fail(`${where}.${k}: published but not recounted`);
        }
        walk(v, b[k], `${where}.${k}`);
      }
      if ('tone' in a && b.tone !== undefined) { counted++; assert.equal(b.tone, a.tone, `${where}.tone`); }
      return;
    }
    if (typeof a === 'number') return same(a, b, where);
  }

  function compare(doc, mine, slug) {
    assert.ok(mine && mine.values && mine.plot, `${slug}: the recount returns { values, plot }`);
    for (const k of Object.keys(mine.values)) assert.ok(k in doc.values, `${slug}: the recount names a value the file lacks (${k})`);
    for (const [k, v] of Object.entries(doc.values)) {
      assert.ok(k in mine.values, `${slug}.values.${k}: not recounted`);
      if (typeof v === 'string') { counted++; assert.equal(mine.values[k], v, `${slug}.values.${k}`); } else same(v, mine.values[k], `${slug}.values.${k}`);
    }
    if (mine.cohort_n !== undefined) same(doc.cohort_n, mine.cohort_n, `${slug}.cohort_n`);
    walk(doc.plot, mine.plot, `${slug}.plot`);
  }

  /** Within-edition places from 0 (lowest value) to 1, ties in shard order, as charts_common.edition_ranks. */
  function editionRanks(valueOf, include = () => true) {
    const out = new Float64Array(C.n).fill(NaN);
    for (let e = 0; e < C.editions.length; e++) {
      const rows = Array.from(C.rowsOf(e)).filter(include);
      if (rows.length < 2) continue;
      const vals = rows.map(valueOf);
      const order = rows.map((_, j) => j).sort((x, y) => vals[x] - vals[y] || x - y);
      order.forEach((j, rank) => { out[rows[j]] = rank / (rows.length - 1); });
    }
    return out;
  }

  /** A share and its denominator from a predicate over finishes (optionally within a subset). */
  function share(pred, within = () => true) {
    let hit = 0, d = 0;
    for (let i = 0; i < C.n; i++) if (within(i)) { d++; if (pred(i)) hit++; }
    return { share: d ? hit / d : NaN, n: d, hits: hit };
  }

  return { compare, editionRanks, share, quantile, quantileSorted, median, MIN_CELL, counted: () => counted };
};
