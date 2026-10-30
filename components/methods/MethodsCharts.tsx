import { Detail, Topic } from './shared';
import { count } from '@/lib/nuggets/format';
import { chartWords } from '@/lib/charts/registry';
import { CATALOG, getChartsManifest, readChart } from '@/lib/charts-server';
import { HalfCardsDetail } from './MethodsHalf';

const WEIGHTING = { pooled: 'Finishes pooled across editions.', 'editions-equal': 'Each edition counted equally.', pairs: 'Pairs of linked records, one pair per consecutive race.' } as const;

/**
 * The Top 100 charts' methods (/charts shows the findings only): the rules every chart keeps, then each chart's own
 * method line, cohort and weighting, read from its verified data file.
 */
export default function MethodsCharts() {
  const manifest = getChartsManifest();
  return (
    <Topic id="top-charts" title="The Top 100 charts">
      <p>Each chart is drawn from the same eligible finishes as the stories ({count(manifest.cohort.after_duplicate_screen)} finishes in {count(manifest.cohort.editions)} race editions), with one finding each. Counts are race finishes, not people. Every group a chart shows holds at least 100 finishes. Percentages are observed shares of past finishes, never a forecast, and every comparison is an association: a chart never says why.</p>
      <p>Charts about pacing shape leave out the editions whose first 5 km looks inflated by a start delay ({count(manifest.cohort.shape)} finishes remain). Exact ages come only from editions that record them; elsewhere a chart uses age groups. Places are clock ranks within a race, not positions on the road. Records linked across races by name are candidates, not verified people. Weather is the edition’s race-morning conditions, context and never an adjustment. A chart about round finish times describes how finishes bunch, not what anyone aimed for.</p>
      <p>Every chart is rebuilt from the verified runner shards for each adopted release, and an independent recount checks every number it shows before it is published.</p>
      {CATALOG.map((c) => {
        const file = readChart(c.slug);
        return (
          <Detail key={c.slug} title={`No. ${c.number}: ${chartWords(c, file).title}`}>
            <p>{file.method} {WEIGHTING[file.weighting]}</p>
          </Detail>
        );
      })}
      <HalfCardsDetail />
    </Topic>
  );
}
