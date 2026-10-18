import type { ReactNode } from 'react';

/** A range or a figure with its unit ("41–50°F", "3:22:30–3:37:30", "25 s/mi"): it never breaks across lines. */
export const TOGETHER = /\d[\d:.,]*(?:–\d[\d:.,]*)?(?:\s?(?:°[FC]|s\/mi|s\/km|mph|km\/h|ft|pts?))|\d[\d:.,]*–\d[\d:.,]*%?/g;

/** Plain text with its ranges and figures kept on one line each (`.nowrap`), for headlines built from data. */
export function keepTogether(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0, key = 0;
  for (const m of text.matchAll(TOGETHER)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(<span key={key++} className="nowrap">{m[0]}</span>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
