import Receipt from '@/components/ui/Receipt';
import AnalysisExplorer from '@/components/AnalysisExplorer';
import AnalysisShell, { ExploreBeat } from '../Shell';
import { analysisBySlug } from '@/lib/ten-analyses';
import { getAnalysisStart, getCityData } from '@/lib/analysis-server';
import { EXAMPLE_PROFILE } from '@/lib/analysis-profile';
import { getNugget } from '@/lib/nuggets';
import { hm, pct, spokenPct, spokenTime } from '@/lib/nuggets/format';

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
  // "Finished under" takes the minute at or above the 10th percentile and "finished over" the minute at or below the
  // 90th, so each statement holds exactly.
  const p10m = Math.ceil(p10 / 60), p90m = Math.floor(p90 / 60);
  const share = Number(n.values.share), goal = Number(n.values.goal_min);
  // The result is the H1's accent (the share under the goal); the median and the two tenths place it in the field.
  const answer = cohort ? (
    <Receipt kicker="Every finish, every course"
      lines={[
        { label: 'Median finish', value: minute(median), sr: spokenTime(Math.round(median / 60) * 60) },
        { label: 'The fastest tenth', key: 'finished under', value: hm(p10m), sr: spokenTime(p10m * 60) },
        { label: 'The slowest tenth', key: 'finished over', value: hm(p90m), sr: spokenTime(p90m * 60) },
      ]}
      result={{ label: `Under ${hm(goal)}`, value: pct(share), sr: `${spokenPct(share)} of finishes under ${spokenTime(goal * 60)}`, fallback: n.guard ? undefined : `Under ${hm(goal)}: ${pct(share)}` }} />
  ) : null;
  return (
    <AnalysisShell path={PATH} title={n} dek={definition.title} answer={answer}>
      <ExploreBeat track="chapter-1">
        <AnalysisExplorer definition={definition} summary={summary} initialAnswer={answers.find((a) => a.id === definition.id)!} />
      </ExploreBeat>
    </AnalysisShell>
  );
}
