import Reading from '@/components/ui/Reading';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import Values from '@/components/ui/Values';
import ShareBar from '@/components/viz/ShareBar';
import ChapterRail from '@/components/ChapterRail';
import ChapterEnd from '@/components/ChapterEnd';
import Columns from '@/components/viz/Columns';
import { Beat, Say } from '@/components/analysis/Shell';
import { getStudyEvidence } from '@/lib/research-data';
import { readingAttrs } from '@/lib/chapters';
import { getNugget, settledReadingOf } from '@/lib/nuggets';
import { approxWords, count, pct, sectionLabel } from '@/lib/nuggets/format';
import { capitalize } from '@/lib/nuggets/build';
import { pageMetadata } from '@/lib/seo';

const PATH = '/slowdown';

export function generateMetadata() {
  const study = getStudyEvidence();
  const share = study && Number.isFinite(study.rate) ? ` (${study.rate.toFixed(1)}% of finishes)` : '';
  const describe = (detail: string) => `How often recorded marathon finishes had a sustained slowdown${detail}, where episodes began, and patterns by age and earlier results.`;
  return pageMetadata({
    title: 'Sustained Slowdown in the Marathon | Pace Notes',
    description: describe(share).length <= 155 ? describe(share) : describe(''),
    path: '/slowdown',
  });
}

/** An earlier-best band as a short column label: "Under 3 hours" → "Under 3:00", "4 hours or longer" → "4:00+". */
const bestLabel = (label: string) => label.replace(/(\d+)\s*hours?/g, '$1:00').replace(/^(\d+)–/, '$1:00–').replace(' or longer', '+');

/**
 * Chapter 05's opener (the redesign spec, section 7.7, under section 00): where sustained slowdowns began, then one
 * finding: how it rose with an earlier best's time. The spread across courses is course comparison's finding (chapter
 * 08), so it is not repeated here. The definition and its citation are on /methodology#sustained-slowdown, linked once
 * from the H1.
 */
export default function Page() {
  const study = getStudyEvidence();
  const onset = getNugget('slowdown.onset'), history = getNugget('slowdown.history');
  const rows = study?.timing.charts[0]?.rows ?? [];
  const total = rows.reduce((s, r) => s + Number(r.episodes ?? 0), 0) || 1;
  const late = rows.filter((r) => Number(r.label) >= 30).reduce((s, r) => s + Number(r.episodes ?? 0), 0);
  const segments = [
    // Ordinal 2 then 3: ordinal 1 is under 3:1 on paper and on night.
    ...rows.filter((r) => Number(r.label) < 30).map((r, i) => ({ id: String(r.label), label: sectionLabel(Number(r.label), Number(r.label) + 5), share: Number(r.episodes) / total, display: pct(Number(r.episodes) / total), tone: (i ? 3 : 2) as 2 | 3 })),
    // The big figure states this share and the H1 names the segment in the same signal, so the bar carries no callout.
    { id: 'late', label: '', share: late / total, display: '', tone: 'signal' as const },
  ];
  const barLabel = `Where sustained slowdowns began: ${segments.map((s) => `${s.label || '30K or later'} ${s.display || pct(s.share)}`).join(', ')}`;
  const rate = Number(onset.values.rate);
  // The H1 is the finding (its first "sustained slowdowns" linked to the definition); the figure under it gives the
  // share, and the dek how common one was.
  const title = { ...onset, headline: 'Most sustained slowdowns began at *30K or later*.', fallback: 'Sustained slowdown: when it began, and where.' };
  const bands = (study?.figures.find((f) => f.id === 'history')?.charts[0]?.rows ?? []).filter((r) => Number(r.n_value) >= 100);
  const first = bands[0];
  return (
    <div className="analysis-page slowdown-page with-rail" {...readingAttrs(PATH)}>
      <ChapterRail path={PATH} />
      <article className="analysis-flow">
        <section className="analysis-hero" id="answer" data-track-section="hero" data-beat="Where it began">
          <Reading crumbs={<ChapterCrumbs path={PATH} />} title={<Say nugget={title} term />} titleSize="title"
            dek={Number.isFinite(rate) ? `${capitalize(approxWords(rate))} finishes had one.` : 'Where sustained slowdowns began.'}
            figure={onset.figure ? { ...onset.figure } : undefined} unitLine={onset.key}
            instrument={<ShareBar segments={segments} inside={false} label={barLabel} />} />
        </section>
        {first ? (
          <Beat id="history" track="chapter-1" label="Earlier best" title={history}>
            <Columns items={bands.map((r, i) => ({ id: String(i), label: bestLabel(String(r.label)), value: Number(r.value), display: pct(Number(r.value) / 100), tone: i === 0 ? 'signal' : 'ink' }))}
              max={Math.ceil(Math.max(...bands.map((r) => Number(r.value))) / 10) * 10 + 5}
              label={`Sustained slowdown by earlier recorded best: ${bands.map((r) => `${r.label} ${pct(Number(r.value) / 100)}`).join(', ')}`}
              values={<Values id="sd-history" caption="Sustained slowdown by earlier recorded best" columns={[{ key: 'b', label: 'Earlier best', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'n', label: 'Finishes' }]}
                rows={bands.map((r) => [String(r.label), pct(Number(r.value) / 100), count(Number(r.n_value))])} />} />
          </Beat>
        ) : null}
        <ChapterEnd path={PATH} readingOf={settledReadingOf} />
      </article>
    </div>
  );
}
