'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EvidenceTag, ScopeTag, SlowdownTerm } from '@/components/tools/EvidenceTag';
import { UnitLink as Link } from '@/components/UnitsProvider';
import ArrowTail from '@/components/ui/ArrowTail';
import { withEm } from '@/components/ui/withEm';
import { Choice, DataState } from '@/components/tools/ui';
import { loadHalf } from '@/lib/half';
import type { HalfGroup, HalfTool } from '@/lib/half-types';
import { HALF_TOOL_FILE, LINKED_LINE, NOT_A_PREDICTION, floorHM, linkedSentence, nearestMark, slowdownSentence, tooFewSentence, windowFor } from '@/lib/tools/half-to-full';
import { FinishStrip } from './FinishStrip';

/** The term the sentence links at its first use on the page (/methodology#half-linking says what it is). */
const LINKED = 'records linked by name';
const SLOWDOWN = 'sustained slowdown';

/** A tool line with its one *…* accent, and its "records linked by name" linked to its definition. */
function linkedText(text: string): ReactNode {
  const i = text.indexOf(LINKED);
  if (i < 0) return withEm(text);
  return <>{withEm(text.slice(0, i))}<Link href="/methodology#half-linking" className="term-link">{LINKED}</Link>{withEm(text.slice(i + LINKED.length))}</>;
}

/** "33% of these marathons had a sustained slowdown." (or "of these recorded women’s marathons"), the term linked. */
function slowdownText(text: string): ReactNode {
  const i = text.indexOf(SLOWDOWN);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<SlowdownTerm>{SLOWDOWN}</SlowdownTerm>{text.slice(i + SLOWDOWN.length)}</>;
}

const OPTIONS: { value: HalfGroup; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'F', label: 'Recorded women' }, { value: 'M', label: 'Recorded men' }];
const GROUPS: HalfGroup[] = ['all', 'F', 'M'];

/**
 * The predictor's "After a half" panel (Pace Notes data, records linked by name): for a recent half and a marathon to
 * predict, the marathons 3 to 16 weeks after a half within 2:30 of the typed half's whole minute (the window of
 * lib/tools/half-to-full.ts), their typical time and the 8 in 10 between, the strip of their finishes with the round
 * times the data publishes (one axis for the three groups at the typed half, the signal at all marathons' round time),
 * their share with a sustained slowdown, and a choice of recorded women's or men's marathons. It replaces the 20K-pace
 * panel for half inputs inside the published range; the research card above is untouched and no
 * figure combines the two badges. Loaded (next/dynamic) only once a half input exists; the file is checked against the
 * sha the build recorded (lib/half.ts). Every sentence is built by lib/tools/half-to-full.ts, which verify-tools checks.
 */
export default function LinkedPanel({ sha, seconds, group, onGroup }: {
  sha: string;
  /** The typed half, seconds. */
  seconds: number;
  group: HalfGroup;
  onGroup: (group: HalfGroup) => void;
}) {
  const [tool, setTool] = useState<HalfTool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    let live = true;
    setError(null);
    loadHalf<HalfTool>(HALF_TOOL_FILE, sha).then(
      (data) => { if (live) setTool(data); },
      (e: unknown) => {
        if (!live) return;
        const reason = e instanceof Error && e.message ? e.message.trim() : 'This data could not be loaded.';
        setError(`${/[.!?]$/.test(reason) ? reason : `${reason}.`} The published estimates above are unaffected.`);
      },
    );
    return () => { live = false; };
  }, [sha, attempt]);

  const win = tool ? windowFor(tool, seconds, group) : null;
  // One axis for the three groups at this half (every published window's 5th to 95th percentile and marks), and the
  // signal at the round time nearest all marathons' median, so the chips move and narrow the bars in place and the
  // orange share always answers the same question ("under 4:00").
  const groupWins = tool ? GROUPS.map((g) => windowFor(tool, seconds, g)).filter((w): w is NonNullable<typeof w> => !!w) : [];
  const domain: [number, number] | undefined = groupWins.length
    ? [Math.min(...groupWins.map((w) => Math.min(w.q[0], ...w.marks.map(([t]) => t)))), Math.max(...groupWins.map((w) => Math.max(w.q[w.q.length - 1], ...w.marks.map(([t]) => t))))]
    : undefined;
  const allWin = tool ? windowFor(tool, seconds, 'all') : null;
  const signalAt = allWin ? nearestMark(allWin)?.[0] : undefined;
  return (
    <section className="tool-panel predictor-linked" id="predictor-linked" data-half-scope="linked" aria-labelledby="predictor-linked-title" ref={panel} tabIndex={-1}>
      <p className="predictor-linked-tags"><EvidenceTag kind="data" /><ScopeTag /></p>
      <DataState error={error} loading={!error && !tool}>
        {tool && win ? (
          <>
            <p className="tool-nugget-text" id="predictor-linked-title">{withEm(linkedSentence(win, tool.Q, group))}</p>
            <p className="tool-panel-meta">{linkedText(LINKED_LINE)}</p>
            <FinishStrip q={win.q} Q={tool.Q} marks={win.marks.map(([s, share]) => ({ s, share }))} format={floorHM} domain={domain} signalAt={signalAt} bracketName="8 in 10" />
            <p className="predictor-linked-sus">{slowdownText(slowdownSentence(win, group))}</p>
          </>
        ) : tool ? (
          <>
            <p className="tool-state" id="predictor-linked-title">{group === 'all' ? `Too few marathons after a half near ${floorHM(Math.round(seconds / 60) * 60)} to show.` : tooFewSentence(tool, group, seconds)}</p>
            <p className="tool-panel-meta">{linkedText(LINKED_LINE)}</p>
          </>
        ) : null}
      </DataState>
      {error ? (
        <button type="button" className="btn btn-secondary is-compact predictor-retry" onClick={() => {
          // The button goes away while the data reloads, so focus moves to the panel first.
          panel.current?.focus();
          setAttempt((n) => n + 1);
        }}>Try again</button>
      ) : (
        <div className="tool-field predictor-linked-group">
          <span className="tool-label" aria-hidden="true">Marathons of</span>
          <Choice label="Marathons of" value={group} onChange={onGroup} options={OPTIONS} />
        </div>
      )}
      <p className="predictor-linked-not">{NOT_A_PREDICTION}</p>
      <p className="predictor-linked-more arrow-line"><Link href="/stories/half-to-full#after"><ArrowTail text="From the half to the marathon" /></Link></p>
    </section>
  );
}
