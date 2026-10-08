import FinishTimeSummary from '@/components/FinishTimeSummary';
import { getFinishTimeSummary, percentileLabel } from '@/lib/finish-times-summary';
import { JsonLd, breadcrumbs, finishesM, pageMetadata } from '@/lib/seo';
import '../tools/tools.css';
import './finish-times.css';

const PATH = '/finish-times';
const MAX_DESCRIPTION = 155;

/** Search title and description, from the same numbers the page shows. The headline number is the median; no mean is claimed. */
function seo() {
  const s = getFinishTimeSummary();
  const t = (group: 'all' | 'women' | 'men') => percentileLabel(s.groups[group].median, s.lastMinute);
  const { races, firstYear, lastYear } = s.coverage;
  const span = `${firstYear}–${lastYear}`;
  const variants = [
    `What is the average marathon time? The median finish in ${races} large city marathons is ${t('all')} (recorded women ${t('women')}, men ${t('men')}), from ${finishesM()} million finishes, ${span}.`,
    `What is the average marathon time? The median finish in ${races} large city marathons is ${t('all')} (recorded women ${t('women')}, men ${t('men')}), from ${finishesM()} million finishes.`,
    `The median finish in ${races} large city marathons is ${t('all')}: ${t('women')} for recorded women, ${t('men')} for recorded men, from ${finishesM()} million finishes, ${span}.`,
    `Median finish in ${races} large city marathons: ${t('all')}, from ${finishesM()} million finishes, ${span}, with shares under each round time and percentiles.`,
  ];
  return {
    title: 'Average Marathon Time: Median and Distribution | Pace Notes',
    description: variants.find((text) => text.length <= MAX_DESCRIPTION) ?? variants[variants.length - 1],
  };
}

export function generateMetadata() {
  return pageMetadata({ ...seo(), path: PATH });
}

export default function FinishTimesPage() {
  return (
    <>
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Finish times']])} />
      <FinishTimeSummary summary={getFinishTimeSummary()} />
    </>
  );
}
