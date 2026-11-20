/**
 * Years as a reader scans them: a run of three or more consecutive years as its ends ("2005–2011"), the rest one by one,
 * the last joined by "and" ("2005–2011, 2020 and 2025").
 *
 * Kept out of format.ts on purpose: the chart cards' stamp hashes that file (scripts/build-chart-cards.cjs, CODE), so an
 * addition there would restamp every card although no drawing changes (November 20, 2026).
 */
export function yearSpans(input: number[]): string {
  const ys = [...new Set(input)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ys.length;) {
    let j = i;
    while (j + 1 < ys.length && ys[j + 1] === ys[j] + 1) j += 1;
    if (j - i >= 2) parts.push(`${ys[i]}–${ys[j]}`);
    else for (let k = i; k <= j; k += 1) parts.push(String(ys[k]));
    i = j + 1;
  }
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : (parts[0] ?? '');
}
