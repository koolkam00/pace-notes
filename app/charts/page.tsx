import { UnitLink as Link } from '@/components/UnitsProvider';
import { chartWords } from '@/lib/charts/registry';
import { THEME_NAMES } from '@/lib/charts/types';
import { CATALOG, chartHref, readChart } from '@/lib/charts-server';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';

export const metadata = pageMetadata({
  title: 'Top 100 Marathon Charts | Pace Notes',
  description: 'One hundred charts from recorded marathon finishes, one finding each: finish times, pacing, racing, courses and weather, who runs and how it has changed.',
  path: '/charts',
});

/** The hub: every chart in series order, each row its number, theme, title and takeaway (in ink: one accent per screen). */
export default function ChartsHub() {
  const rows = CATALOG.map((c) => ({ c, words: chartWords(c, readChart(c.slug)) }));
  return (
    <div className="contents-page charts-hub">
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Top 100 charts']])} />
      <header className="contents-hero" data-track-section="hero">
        <h1 className="t-title">Top 100 charts</h1>
        <p className="contents-dek">One hundred charts from the data, one finding each.</p>
      </header>
      <ol className="charts-list" aria-label="Every chart">
        {rows.map(({ c, words }) => (
          <li key={c.slug}>
            <Link href={chartHref(c.number)} className="charts-row">
              <span className="charts-row-n" aria-hidden="true">{c.number}</span>
              <span className="charts-row-body">
                <span className="charts-row-theme">{THEME_NAMES[c.theme]}</span>
                <span className="charts-row-title">{words.title}</span>
                <span className="charts-row-take">{words.plain}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
