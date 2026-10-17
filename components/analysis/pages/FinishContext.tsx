import Receipt from '@/components/ui/Receipt';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart, getCityData } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getNugget } from '@/lib/nuggets';
import { hm, spokenTime } from '@/lib/nuggets/format';

const PATH = '/analyses/finish-time-context';

/** Chapter 06, page 2: how much of the field is under 4:00 and the round times below it, the field's spread, then Make it yours. */
export default function FinishContext() {
  const definition = analysisBySlug('finish-time-context')!;
  const { summary, answers } = getAnalysisStart();
  const n = getNugget('target.context');
  const cohort = getCityData(EXAMPLE_PROFILE.city).cohorts['all|all|all'];
  // finish holds the 10th percentile, the median and the 90th, in seconds.
  const [p10, median, p90] = cohort?.finish ?? [];
  const minute = (s: number) => hm(Math.round(s / 60));
  const answer = cohort ? (
    <Receipt kicker="Every finish, every course"
      lines={[
        { label: 'The fastest tenth', key: 'finished under', value: minute(p10), sr: spokenTime(Math.round(p10 / 60) * 60) },
        { label: 'The slowest tenth', key: 'finished over', value: minute(p90), sr: spokenTime(Math.round(p90 / 60) * 60) },
      ]}
      result={{ label: 'Median finish', value: minute(median), sr: spokenTime(Math.round(median / 60) * 60) }} />
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
