// Recounts of the racing charts (scripts/verify-charts.cjs).
module.exports = {
  'quarter-at-20k': (C, file, H) => {
    const big = (i) => C.edN[C.edition[i]] >= 400;
    const r20 = H.editionRanks((i) => C.times[i * 9 + 3], big), rf = H.editionRanks((i) => C.finish[i], big);
    const m = Array.from({ length: 4 }, () => new Float64Array(4)), d = new Float64Array(4);
    let n = 0;
    for (let i = 0; i < C.n; i++) {
      if (!big(i)) continue;
      n++;
      const a = Math.min(3, Math.floor(r20[i] * 4)), b = Math.min(3, Math.floor(rf[i] * 4));
      m[a][b]++; d[a]++;
    }
    const cells = m.map((row, a) => Array.from(row, (x) => x / d[a]));
    return { values: { front_stay: cells[0][0], back_stay: cells[3][3] }, plot: { cells, rows: ['Front', 'Second', 'Third', 'Back'] }, cohort_n: n };
  },
};
