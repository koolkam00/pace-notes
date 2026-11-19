import { getNugget } from '@/lib/nuggets';
import { halfDeks, halfPaceBands, halfPacing, paceBandLabel } from '@/lib/nuggets/half';
import { count, pct } from '@/lib/nuggets/format';
import { Beat } from '@/components/story/StoryPage';
import Values from '@/components/ui/Values';
import { ScopeTag } from '@/components/tools/EvidenceTag';
import { ChangeHistogram } from './HalfCharts';

/** A change of pace as a table prints it: one decimal with its sign ("+3.4%", "−0.5%"). */
const change = (v: number) => `${v < 0 ? '−' : '+'}${Math.abs(v * 100).toFixed(1)}%`;

/**
 * How halves are paced: a surface of its own at the foot of /half (docs/HALF_MARATHON.md, rule R5). Its figures come
 * from every usable result with a 10 km time, verified or not, so its root names the scope "usable" and it carries the
 * chip "Includes unverified half results" exactly once; nothing on it is a verified figure. The measure is the pace over
 * the last 11.1 km against the pace over the first 10 km, and the surface never calls either part a half of the race.
 *
 * The heading is half.pace (its neutral line when the guard fails); the dek is half.paceFaster's sentence and the two
 * finish bands half.paceBands may name, each only while its own guard holds; the histogram names the share faster only
 * with that guard and is quiet without it; the table lists the published finish bands and marks no row. Nothing renders
 * while the family is left out under a builder floor (no pacing.json in the manifest).
 */
export default function HalfPacing() {
  const p = halfPacing();
  if (!p) return null;
  const pace = getNugget('half.pace'), faster = getNugget('half.paceFaster');
  const deks = halfDeks();
  const said = [deks.paceFaster, deks.paceBands].filter(Boolean).join(' ');
  const o = p.overall, h = o.hist;
  const sign = (k: number) => `${k > 0 ? '+' : k < 0 ? '−' : ''}${Math.abs(k)}%`;
  const label = `Half results by the change of pace over the last 11.1 km against the first 10 km, in whole points from ${sign(h.lo)} to ${sign(h.hi)}`
    + `${pace.guard ? `: the typical change ${change(o.median)}` : ''}${faster.guard ? `${pace.guard ? ',' : ':'} ${pct(o.faster)} below zero` : ''}.`;
  const bands = halfPaceBands(p).bands.length ? p.bands : [];
  return (
    <div className="half-pacing" data-half-scope="usable">
      <Beat id="pace" track="chapter-5" label="Pacing" title={pace}
        dek={<>{said ? `${said} ` : null}<span className="reading-dek-tags"><ScopeTag /></span></>}>
        <ChangeHistogram hist={h} faster={faster.guard ? `${pct(o.faster)} faster` : null} label={label} />
        <Values id="hf-pace" caption="Pace over the last 11.1 km against the first 10 km, by finish time" how="/methodology#half-pacing"
          columns={[{ key: 'b', label: 'Finish' }, { key: 'n', label: 'Results' }, { key: 'm', label: 'Typical change' }, { key: 'f', label: 'Faster' }, { key: 's', label: 'Over 10% slower' }]}
          rows={[['All', count(o.n), change(o.median), pct(o.faster, 1), pct(o.slower10, 1)],
            ...bands.map((b) => [paceBandLabel(b.lo_s, p.rules.band_s), count(b.n), change(b.median), pct(b.faster, 1), pct(b.slower10, 1)])]} />
      </Beat>
    </div>
  );
}
