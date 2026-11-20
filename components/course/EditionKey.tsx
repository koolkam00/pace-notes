import { Fragment, type ReactNode } from 'react';
import { SplitTierTag, TagGroup, TierTag, TimingClassTag } from '@/components/ui/TierTag';
import { yearSpans } from '@/lib/nuggets/format';
import { isGunTiming } from '@/lib/tiers';

/**
 * An edition table's labels said once (lead decision D48, review M5, November 20, 2026). A label true of more than half
 * the table's rows (an edition's tier, "Finish times only", "Gun times") is said once in the table's key, with the years
 * it is not true of named ("Finish times only, except 2015"), and rows show it only where they differ; a label true of
 * half the rows or fewer stays on its rows. A table of fewer than three rows keeps every label on its rows. The words are
 * the tier module's, drawn by components/ui/TierTag.tsx; this file decides only where they stand.
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

export function editionKey(rows: readonly KeyRow[]): EditionKeyModel {
  const none: EditionKeyModel = { tier: null, split: null, gun: null };
  if (rows.length < KEY_MIN_ROWS) return none;
  const most = (pred: (r: KeyRow) => boolean) => {
    const yes = rows.filter(pred);
    return yes.length * 2 > rows.length ? { except: rows.filter((r) => !pred(r)).map((r) => r.year) } : null;
  };
  const tiers = new Map<string, number>();
  for (const r of rows) tiers.set(r.tier, (tiers.get(r.tier) ?? 0) + 1);
  const top = [...tiers.entries()].find(([, n]) => n * 2 > rows.length)?.[0] ?? null;
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
      {items.map((item, i) => (
        <Fragment key={i}>
          {i ? '; ' : null}
          <span className="edition-key-item"><TagGroup>{item.label}</TagGroup>{item.except.length ? `, except ${yearSpans(item.except)}` : ', every year'}</span>
        </Fragment>
      ))}
      .
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
