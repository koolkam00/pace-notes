import ChartCard from './ChartCard';
import ChartSvg from './ChartSvg';
import ByUnits from '@/components/ui/ByUnits.client';
import Values from '@/components/ui/Values';
import Arrow from '@/components/ui/Arrow';
import PageFeedback from '@/components/PageFeedback';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { rich } from '@/components/story/StoryPage';
import { chartWords } from '@/lib/charts/registry';
import { tableOf, unitAware } from '@/lib/charts/table';
import { THEME_NAMES, type CatalogItem } from '@/lib/charts/types';
import { CATALOG, chartHref, readChart } from '@/lib/charts-server';

/** The brand line under every card: the same on the page and on the image. */
export function CardFoot({ number }: { number: number }) {
  return <><b><span className="chart-mark" aria-hidden="true"><i /><i /><i /></span>Pace Notes</b><span>splithappens.run/charts/{number}</span></>;
}

/**
 * One chart's page: the card (its title is the page's H1, its takeaway links the sustained-slowdown term once), the
 * image to save, the chart's table twin with the one link to /methodology, and the way to the charts on either side.
 */
export default function ChartPage({ item }: { item: CatalogItem }) {
  const file = readChart(item.slug);
  const words = chartWords(item, file);
  const dual = unitAware(file.plot);
  const svg = (units: 'mi' | 'km') => <ChartSvg spec={file.plot} label={words.plain} units={units} />;
  const table = (units: 'mi' | 'km') => {
    const t = tableOf(file.plot, units);
    return <Values id="chart-numbers" caption={words.title} columns={t.columns} rows={t.rows} how="/methodology#top-charts" />;
  };
  const prev = CATALOG.find((c) => c.number === item.number - 1);
  const next = CATALOG.find((c) => c.number === item.number + 1);
  const titleOf = (c: CatalogItem) => chartWords(c, readChart(c.slug)).title;
  return (
    <div className="chart-page" data-track-section="hero">
      <p className="chart-crumbs"><Link href="/charts">Top 100 charts</Link></p>
      <ChartCard number={item.number} theme={THEME_NAMES[item.theme]} title={words.title} takeaway={rich(words.headline, { term: true })}
        label={words.plain} spec={file.plot} heading="h1" foot={<CardFoot number={item.number} />}
        plot={dual ? <ByUnits mi={svg('mi')} km={svg('km')} /> : undefined} />
      <p className="chart-save"><a href={`/charts/cards/${item.number}.png`} download={`pace-notes-chart-${item.number}.png`}>Save the image</a></p>
      <div className="chart-numbers">{dual ? <ByUnits mi={table('mi')} km={table('km')} /> : table('mi')}</div>
      <nav className="chart-pager" aria-label="More charts" data-track-section="related">
        {prev ? <Link href={chartHref(prev.number)} className="chart-pager-prev"><Arrow dir="left" /><span><span className="chart-pager-n">No. {prev.number}</span>{titleOf(prev)}</span></Link> : <span />}
        {next ? <Link href={chartHref(next.number)} className="chart-pager-next"><span><span className="chart-pager-n">No. {next.number}</span>{titleOf(next)}</span><Arrow /></Link> : <Link href="/charts" className="chart-pager-next"><span>All 100 charts</span><Arrow /></Link>}
      </nav>
      <PageFeedback />
    </div>
  );
}
