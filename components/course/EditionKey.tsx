import { Fragment, type ReactNode } from 'react';
import { SplitTierTag, TagGroup, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import { yearSpans } from '@/lib/nuggets/years';
import { isGunTiming } from '@/lib/tiers';

/**
 * An edition table's labels said once (lead decision D48, review M5, November 20, 2026). A label true of more than half
 * the table's rows (an edition's tier, "Finish times only", "Gun times") is said once in the table's key, with the years
 * it is not true of named ("Finish times only, except 2015"), and rows show it only where they differ; a label true of
 * half the rows or fewer stays on its rows. A table of fewer than three rows keeps every label on its rows. The words are
 * the tier module's, drawn by components/ui/TierTag.tsx; this file decides only where they stand.
 *
 * Amended November 20, 2026 (lead decision D53, second review D1): a label is said in the key only when (a) the table has
 * three or more rows, (b) the label is true of more than half of them and (c) the rows it is not true of number at most
 * three; otherwise it stays on every row it is true of. (Rimouski's key had been two exception lists of 8 and 6 years
 * whose rows showed no label, so a reader had to intersect two lists to learn one year's tier.) The label and its
 * ", except" (or ", every year.") never part at a line break; a long list of years may wrap after them.
 */

/** One row of an edition table: its year and the codes its labels answer to. */
export type KeyRow = { year: number; tier: string; weakerSource?: boolean | null; splitTier: string; timing: string };
/** The labels a table's key says once, each with the years it is not true of. */
export type EditionKeyModel = {
  tier: { code: string; except: number[] } | null;
  split: { except: number[] } | null;
  gun: { except: number[] } | null;
};

/** The fewest rows a key is drawn for. */
export const KEY_MIN_ROWS = 3;
/** The most years a key label may name as exceptions (lead decision D53). */
export const KEY_MAX_EXCEPT = 3;

export function editionKey(rows: readonly KeyRow[]): EditionKeyModel {
  const none: EditionKeyModel = { tier: null, split: null, gun: null };
  if (rows.length < KEY_MIN_ROWS) return none;
  const most = (pred: (r: KeyRow) => boolean) => {
    const yes = rows.filter(pred).length, except = rows.filter((r) => !pred(r)).map((r) => r.year);
    return yes * 2 > rows.length && except.length <= KEY_MAX_EXCEPT ? { except } : null;
  };
  const tiers = new Map<string, number>();
  for (const r of rows) tiers.set(r.tier, (tiers.get(r.tier) ?? 0) + 1);
  const top = [...tiers.entries()].find(([, n]) => n * 2 > rows.length && rows.length - n <= KEY_MAX_EXCEPT)?.[0] ?? null;
  return {
    tier: top ? { code: top, except: rows.filter((r) => r.tier !== top).map((r) => r.year) } : null,
    split: most((r) => r.splitTier === 'finish_time_only'),
    gun: most((r) => isGunTiming(r.timing)),
  };
}

/** Whether a table's key says anything. */
export const keySays = (key: EditionKeyModel) => !!(key.tier || key.split || key.gun);

/** The key, above the table: each label once, then the years it is not true of, or "every year". */
export function EditionKey({ model }: { model: EditionKeyModel }) {
  const items: { label: ReactNode; except: number[] }[] = [];
  if (model.tier) items.push({ label: <TierTag tier={model.tier.code} weakerSource={model.tier.code === 'stamped_weaker_source'} />, except: model.tier.except });
  if (model.split) items.push({ label: <SplitTierTag splitTier="finish_time_only" />, except: model.split.except });
  if (model.gun) items.push({ label: <TimingClassTag timing="gun" />, except: model.gun.except });
  if (!items.length) return null;
  return (
    <p className="edition-key">
      {/* One label to a line, each line 44 px high, so a linked label's hit area never reaches the next line's. The label
          and its ", except" (or ", every year.") are one unbreakable head (lead decision D53); the years follow it and
          may wrap. */}
      {items.map((item, i) => (
        <Fragment key={i}>
          {i ? ' ' : null}
          <span className="edition-key-item">
            <span className="edition-key-head"><TagGroup>{item.label}</TagGroup><span className="edition-key-join">{item.except.length ? ', except' : ', every year.'}</span></span>
            {item.except.length ? <span className="edition-key-years">{` ${yearSpans(item.except)}.`}</span> : null}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** A row's labels: those its table's key does not already say for it. */
export function RowTags({ row, model }: { row: KeyRow; model: EditionKeyModel }) {
  const tier = model.tier?.code === row.tier ? null : <TierTag tier={row.tier} weakerSource={row.weakerSource} />;
  const split = model.split ? null : <SplitTierTag splitTier={row.splitTier} />;
  const gun = model.gun ? null : <TimingClassTag timing={row.timing} />;
  if (!tier && !split && !gun) return null;
  return <TagGroup>{tier}{split}{gun}</TagGroup>;
}

/** Whether a row shows any label once its table's key is said. */
export function rowHasTags(row: KeyRow, model: EditionKeyModel): boolean {
  return model.tier?.code !== row.tier || (!model.split && row.splitTier === 'finish_time_only') || (!model.gun && isGunTiming(row.timing));
}
