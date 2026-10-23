// Recounts of the finish-times charts (scripts/verify-charts.cjs): each rebuilds the chart's values and plotted numbers
// from the cohort the verifier streamed, without the Python builder.
module.exports = {
  'minute-before-the-hour': (C) => {
    const counts = new Float64Array(721);
    for (let i = 0; i < C.n; i++) counts[Math.floor(C.finish[i] / 60)]++;
    const bins = [];
    for (let m = 150; m < 330; m++) bins.push({ x0: m * 60, x1: (m + 1) * 60, v: counts[m] / C.n, tone: (m + 1) % 30 === 0 ? 'signal' : 'quiet' });
    return { values: { before: counts[239], after: counts[240], ratio: counts[239] / counts[240] }, plot: { bins }, cohort_n: C.n };
  },
};
