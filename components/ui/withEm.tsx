import type { ReactNode } from 'react';

/**
 * Renders the one *…* span of a nugget sentence as <em> (the italic accent on the number or the comparison); text
 * without a marker comes back unchanged. Its own module, so a client island that needs it does not carry Reading.
 */
export function withEm(text: string): ReactNode {
  const m = /^([\s\S]*?)\*([^*]+)\*([\s\S]*)$/.exec(text);
  if (!m) return text;
  return <>{m[1]}<em>{m[2]}</em>{m[3]}</>;
}
