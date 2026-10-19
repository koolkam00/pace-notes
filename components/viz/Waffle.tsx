import type { CSSProperties, ReactNode } from 'react';
import ChartFrame from './ChartFrame';
import Plot from './Plot';
import Scrubber from './Scrubber.client';
import { pc } from './scale';

/**
 * A waffle (the redesign spec, section 3.6, calmed under section 00): one small square per case, 25 to a row, in ink
 * where the sentence's condition held and quiet (with its edge) elsewhere. The tile in the readout is the one signal
 * mark: tap a tile to read it out ("Berlin 2013 vs 2025: 44°F vs 68°F, 16% vs 28%"). Cells are at most 12 px with
 * 2 px gaps and the grid is centred, so a wide screen never turns the waffle into a slab; the squares keep their shape
 * at any width (the plot's height follows its width).
 */
export type WaffleTile = { id: string; lit: boolean; key: string; value: string; side?: string };

export default function Waffle({ tiles, columns = 25, label, keyLabels, values, initial, sideLabel, line = false, hint }: {
  tiles: WaffleTile[]; columns?: number; label: string; keyLabels: { lit: string; other: string }; values?: ReactNode; initial?: number;
  /** The readout's side label for each tile's `side` value. */
  sideLabel?: string;
  /** The readout as one quiet line (each tile's `key` says it all, its value empty), so a waffle under a reading's big
   * figure never stacks a second pair of big numbers under it. */
  line?: boolean;
  /** A quiet line under the waffle saying a square can be picked. */
  hint?: ReactNode;
}) {
  const ordered = [...tiles.filter((t) => t.lit), ...tiles.filter((t) => !t.lit)];
  const rows = Math.ceil(ordered.length / columns);
  const gap = 1 / 7; // 2 px of a 14 px pitch
  const cell = (i: number) => ({ col: i % columns, row: Math.floor(i / columns) });
  const plot = (
    <Plot>
      {ordered.map((t, i) => {
        const { col, row } = cell(i);
        return <rect key={t.id} className={t.lit ? 'm-ink' : 'm-quiet'} x={pc((col + gap / 2) / columns)} y={pc((row + gap / 2) / rows)} width={pc((1 - gap) / columns)} height={pc((1 - gap) / rows)} rx={1.5} />;
      })}
    </Plot>
  );
  const points = {
    x: ordered.map((_, i) => (cell(i).col + 0.5) / columns),
    y: ordered.map((_, i) => (cell(i).row + 0.5) / rows),
    keys: ordered.map((t) => t.key),
    values: ordered.map((t) => t.value),
    side: sideLabel ? [{ label: sideLabel, values: ordered.map((t) => t.side ?? '—') }] : undefined,
  };
  return (
    <ChartFrame className={`waffle${line ? ' is-line' : ''}`} label={label} caption={hint} style={{ '--ratio': String(columns / rows), '--cols': String(columns) } as CSSProperties}
      scrub={<Scrubber mode="pick" points={points} initial={initial ?? 0} label={label}>{plot}</Scrubber>}
      keys={[{ label: keyLabels.lit, mark: 'square' }, { label: keyLabels.other, mark: 'square', tone: 'quiet' }]}
      values={values}
    />
  );
}
