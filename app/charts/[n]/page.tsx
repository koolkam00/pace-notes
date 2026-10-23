import { notFound } from 'next/navigation';
import ChartPage from '@/components/charts/ChartPage';
import { chartWords } from '@/lib/charts/registry';
import { CATALOG, readChart } from '@/lib/charts-server';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';

const itemOf = (n: string) => (/^[1-9]\d{0,2}$/.test(n) ? CATALOG.find((c) => c.number === Number(n)) : undefined);

export function generateStaticParams() {
  return CATALOG.map((c) => ({ n: String(c.number) }));
}

export function generateMetadata({ params }: { params: { n: string } }) {
  const item = itemOf(params.n);
  if (!item) return {};
  const words = chartWords(item, readChart(item.slug));
  return pageMetadata({ title: `${words.title} | Pace Notes`, description: words.description, path: `/charts/${item.number}` });
}

export default function Chart({ params }: { params: { n: string } }) {
  const item = itemOf(params.n);
  if (!item) notFound();
  const words = chartWords(item, readChart(item.slug));
  return (
    <>
      <ChartPage item={item} />
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Top 100 charts', '/charts'], [words.title]])} />
    </>
  );
}
