import type { ReactNode } from 'react';

/**
 * Rows of intervals on one shared scale (the chapter "Over the years"): a label, a track with its zero, the interval as a
 * whisker and, only where the row states a reading, its dot and its words. A row without a reading keeps its interval
 * and says so in plain words (`none`), so a reader sees the uncertainty without a reading being stated. Rows come in
 * the order given (label order for races: never by value). Drawn in HTML so labels never collide at any width; every
 * colour is a token (app/styles/pages/linked.css). The table twin is the page's All numbers.
 */
export type IntervalRow = { id: string; label: ReactNode; lo: number; hi: number; value: number | null; words: string; tone: 'ink' | 'quiet' | 'none' };

export default function IntervalRows({ rows, domain, ticks, label, zeroLabel, groups }: {
  rows: IntervalRow[]; domain: [number, number]; ticks: { value: number; label: string }[]; label: string;
  /** The words at the zero line ("Other races of the same years"). */
  zeroLabel: string;
  /** Optional group headings before a row id ("Trail and mountain courses"). */
  groups?: Record<string, string>;
}) {
  const [a, b] = domain;
  const at = (v: number) => `${(100 * (Math.min(b, Math.max(a, v)) - a) / (b - a)).toFixed(2)}%`;
  return (
    <figure className="linked-rows" aria-label={label}>
      <div className="linked-rows-scale" aria-hidden="true">
        <span className="linked-rows-spacer" />
        <span className="linked-rows-ticks">
          {ticks.map((t) => <span key={t.value} className={`linked-rows-tick${t.value === 0 ? ' is-zero' : ''}`} style={{ left: at(t.value) }}>{t.label}</span>)}
        </span>
      </div>
      <ul className="linked-rows-list">
        {rows.map((r) => (
          <li key={r.id} className={`linked-row is-${r.tone}`}>
            {groups?.[r.id] ? <span className="linked-rows-group t-label">{groups[r.id]}</span> : null}
            <span className="linked-row-label">{r.label}</span>
            <span className="linked-row-track" aria-hidden="true">
              <span className="linked-row-zero" style={{ left: at(0) }} />
              <span className="linked-row-whisker" style={{ left: at(r.lo), width: `calc(${at(r.hi)} - ${at(r.lo)})` }} />
              {r.value !== null ? <span className="linked-row-dot" style={{ left: at(r.value) }} /> : null}
            </span>
            <span className="linked-row-words">{r.words}</span>
          </li>
        ))}
      </ul>
      <figcaption className="linked-rows-key t-small">
        <span className="linked-rows-key-zero" aria-hidden="true" /> {zeroLabel}
        <span className="linked-rows-key-whisker" aria-hidden="true" /> 95% interval
      </figcaption>
    </figure>
  );
}
