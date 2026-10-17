import Reading from '@/components/ui/Reading';
import { ChapterCrumbs } from '@/components/ui/ChapterHeader';
import Values from '@/components/ui/Values';
import ShareBar from '@/components/viz/ShareBar';
import DotStrip from '@/components/viz/DotStrip';
import ChapterRail from '@/components/ChapterRail';
import ChapterEnd from '@/components/ChapterEnd';
import Columns from '@/components/analysis/Columns';
import { Beat } from '@/components/analysis/Shell';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { getStudyEvidence } from '@/lib/research-data';
import { getAllFinisherContextStart } from '@/lib/all-finisher-context-server';
import { readingAttrs } from '@/lib/chapters';
import { getNugget, readingOf } from '@/lib/nuggets';
import { comparableCourses, courseName } from '@/lib/nuggets/analyses';
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
 * Chapter 05's opener (the redesign spec, section 7.7, under section 00): where sustained slowdowns began, then two
 * findings: the spread across courses and how it rose with an earlier best's time. The definition and its citation are
 * on /methodology#sustained-slowdown, linked once from the question.
 */
export default function Page() {
  const study = getStudyEvidence();
  const onset = getNugget('slowdown.onset'), spread = getNugget('courses.spread'), history = getNugget('slowdown.history');
  const rows = study?.timing.charts[0]?.rows ?? [];
  const total = rows.reduce((s, r) => s + Number(r.episodes ?? 0), 0) || 1;
  const late = rows.filter((r) => Number(r.label) >= 30).reduce((s, r) => s + Number(r.episodes ?? 0), 0);
  const segments = [
    ...rows.filter((r) => Number(r.label) < 30).map((r, i) => ({ id: String(r.label), label: sectionLabel(Number(r.label), Number(r.label) + 5), share: Number(r.episodes) / total, display: pct(Number(r.episodes) / total), tone: (i ? 3 : 1) as 1 | 3 })),
    { id: 'late', label: '30K or later', share: late / total, display: pct(late / total), tone: 'signal' as const },
  ];
  const rate = Number(onset.values.rate);
  const courses = comparableCourses(getAllFinisherContextStart().initial.courses);
  const lo = Math.floor(Math.min(...courses.map((c) => c.slowdown_pct)) / 10) * 10, hi = Math.ceil(Math.max(...courses.map((c) => c.slowdown_pct)) / 10) * 10;
  const bands = (study?.figures.find((f) => f.id === 'history')?.charts[0]?.rows ?? []).filter((r) => Number(r.n_value) >= 100);
  const first = bands[0];
  return (
    <div className="analysis-page slowdown-page with-rail" {...readingAttrs(PATH)}>
      <ChapterRail path={PATH} />
      <article className="analysis-flow">
        <section className="analysis-hero" id="answer" data-track-section="hero" data-beat="Where it began">
          <Reading crumbs={<ChapterCrumbs path={PATH} />} title="Sustained slowdown: *when* it begins, and where." titleSize="title"
            dek={<>{Number.isFinite(rate) ? `${capitalize(approxWords(rate))} finishes had a ` : 'How often finishes had a '}<Link href="/methodology#sustained-slowdown">sustained slowdown</Link>. When did it begin, and where?</>}
            figure={onset.figure ? { ...onset.figure } : undefined} unitLine={onset.key}
            instrument={<ShareBar segments={segments} label={`Where sustained slowdowns began: ${segments.map((s) => `${s.label} ${s.display}`).join(', ')}`} />} />
        </section>
        <Beat id="courses" track="chapter-1" label="Course by course" title={spread}>
          <DotStrip items={courses.map((c) => ({ id: c.id, label: courseName(c.label), value: c.slowdown_pct, display: pct(c.slowdown_pct / 100), detail: count(c.n) }))}
            domain={[lo, Math.max(...courses.map((c) => c.slowdown_pct)) > hi - 5 ? hi + 5 : hi]} ticks={Array.from({ length: Math.round((hi - lo) / 10) + 1 }, (_, i) => lo + i * 10).map((t) => ({ value: t, label: `${t}%` }))}
            readoutKey="Finishes" label={`Sustained slowdown course by course, ${courses.length} courses; tap a dot to read it`}
            values={<Values id="sd-courses" caption="Sustained slowdown by course" columns={[{ key: 'c', label: 'Course', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'n', label: 'Finishes' }]}
              rows={[...courses].sort((a, b) => a.slowdown_pct - b.slowdown_pct).map((c) => [courseName(c.label), pct(c.slowdown_pct / 100), count(c.n)])} />} />
        </Beat>
        {first ? (
          <Beat id="history" track="chapter-2" label="Earlier best" title={history}>
            <Columns items={bands.map((r, i) => ({ id: String(i), label: bestLabel(String(r.label)), value: Number(r.value), display: pct(Number(r.value) / 100), tone: i === 0 ? 'signal' : 'ink' }))}
              max={Math.ceil(Math.max(...bands.map((r) => Number(r.value))) / 10) * 10 + 5}
              label={`Sustained slowdown by earlier recorded best: ${bands.map((r) => `${r.label} ${pct(Number(r.value) / 100)}`).join(', ')}`}
              values={<Values id="sd-history" caption="Sustained slowdown by earlier recorded best" columns={[{ key: 'b', label: 'Earlier best', text: true }, { key: 's', label: 'Sustained slowdown' }, { key: 'n', label: 'Finishes' }]}
                rows={bands.map((r) => [String(r.label), pct(Number(r.value) / 100), count(Number(r.n_value))])} />} />
          </Beat>
        ) : null}
        <ChapterEnd path={PATH} readingOf={readingOf} />
      </article>
    </div>
  );
}
