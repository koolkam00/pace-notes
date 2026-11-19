'use strict';
// The linked-records pages' recount (lib/linked-server.ts, lib/nuggets/linked.ts; the chapter "Over the years"), run by
// scripts/verify-nuggets.cjs. Every verdict a page reads is recomputed here from the published numbers with a second,
// plain implementation of the contract's guard (docs/LINKED_RECORDS.md), and the helper other pages call
// (linkedEditionReading) is tested on every edition of the file and on planted rows.
const fs = require('node:fs');
const path = require('node:path');

module.exports = function linkedRecounts({ ROOT, N, core, ok, eq, problems }) {
  let checks = 0;
  const step = (fn) => { fn(); checks++; };
  const read = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/linked', file), 'utf8'));
  const editions = read('editions.json');

  // ---------- The helper: the verdict of an edition as words ----------
  const S = require('../../lib/linked-server.ts');
  const WORDS = { slow: 'a slow year for linked runners', fast: 'a fast year for linked runners', usual: 'a usual year for linked runners' };
  const plain = (row) => {
    if (row.finishes < editions.min_finishes || row.others < 2) return null;
    const m = editions.margin_pct, h = row.high_pct;
    if (row.lo_pct > m && (h === null || h > 0)) return 'slow';
    if (row.hi_pct < -m && (h === null || h < 0)) return 'fast';
    if (row.lo_pct > -m && row.hi_pct < m) return 'usual';
    return null;
  };
  let shown = 0;
  for (const [label, years] of Object.entries(editions.races)) {
    for (const [year, row] of Object.entries(years)) {
      const verdict = plain(row);
      step(() => eq(verdict, row.verdict, `linked: ${label} ${year}: the file's verdict is its guard's`));
      const reading = S.linkedEditionReading(label, Number(year), row.series ?? null);
      const want = verdict && row.basis === 'chip_or_net' ? WORDS[verdict] : null;
      step(() => eq(reading ? reading.words : null, want, `linked: ${label} ${year}: the helper's words (chip or net only)`));
      if (reading) {
        shown++;
        step(() => eq(reading.reviewed, row.reviewed_release === true, `linked: ${label} ${year}: the review flag`));
        step(() => eq(S.linkedEditionWords(label, year), want, `linked: ${label} ${year}: the words without a series`));
      }
    }
  }
  step(() => eq(S.linkedEditionReading('No such race', 2020), null, 'linked: an unknown race has no words'));
  step(() => eq(S.linkedEditionReading('Berlin', 1900), null, 'linked: an edition not in the file has no words'));
  let threw = false;
  try { S.linkedEditionReading('Warsaw', 2015, 'PZU Warsaw Marathon'); } catch { threw = true; }
  step(() => ok(threw, 'linked: a series that is not the year\'s is an error'));
  threw = false;
  try { S.linkedEditionReading('Berlin', 2006, 'Some series'); } catch { threw = true; }
  step(() => ok(threw, 'linked: a series for a label without one is an error'));
  const base = { basis: 'chip_or_net', finishes: 500, others: 5, high_pct: null };
  const g = (row) => S.linkedEditionGuard({ ...base, ...row }, { margin: 1, minFinishes: 100 });
  step(() => eq([g({ lo_pct: 1.2, hi_pct: 2 }), g({ lo_pct: 1.2, hi_pct: 2, high_pct: -0.1 }), g({ lo_pct: -2, hi_pct: -1.1 }), g({ lo_pct: -0.9, hi_pct: 0.9 }),
    g({ lo_pct: -1, hi_pct: 0.5 }), g({ lo_pct: 1.2, hi_pct: 2, finishes: 99 }), g({ lo_pct: 1.2, hi_pct: 2, others: 1 })],
  ['slow', null, 'fast', 'usual', null, null, null], 'linked: the guard on planted rows (high-links sign, the ±1 margin, the two floors)'));
  step(() => ok(shown > 0 && shown < Object.values(editions.races).reduce((s, y) => s + Object.keys(y).length, 0), 'linked: the helper gives words for some editions and not others'));

  return { checks, shown };
};
