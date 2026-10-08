import Projector, { ProjectorExclusions } from '@/components/tools/Projector';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { pageMetadata } from '@/lib/seo';
import { getInsightsManifest } from '@/lib/insights-server';
import { SLOWDOWN_CITATION, SLOWDOWN_DEFINITION } from '@/lib/tools/splits';
import './projector.css';

export const metadata = pageMetadata({
  title: 'Marathon Finish Time Projector from Tracker Splits',
  description: 'Type a tracker time from any 5 km mat to see a finish range and next-mat arrival windows from what finishes on the same pace ran next.',
  path: '/tools/projector',
});

const INDEX = 'tools/projector.json';

function indexVersion(): string | null {
  try {
    return getInsightsManifest().files[INDEX]?.sha256 ?? null;
  } catch {
    return null;
  }
}

export default function ProjectorPage() {
  const sha = indexVersion();
  return (
    <div className="container tool-page">
      <ToolHeader slug="projector" />
      <Projector indexSha={sha} />
      <ToolMethod sources={[SLOWDOWN_CITATION]}>
        <p><strong>Grouping.</strong> An elapsed time E at a 5 km mat implies an even-pace finish P = E × 42.195 ÷ mat km. Finishes are grouped in 2-minute bands of P, so “on 3:58–4:00 pace” means the same thing at every mat. At 5 km a band spans only about 14 seconds of elapsed time. Each group is one course (or All courses), one mat and one band, optionally narrowed by trend or by recorded gender. Gender and trend are never combined, and gender groups exist for All courses only. The checkpoint analysis elsewhere on the site asks a similar question with its own elapsed-time groups and set of editions, so its shares and medians differ slightly from these.</p>
        <p><strong>Trend.</strong> The latest 5 km pace is compared with the average pace so far: (E<sub>m</sub> − E<sub>m−5</sub>) ÷ 5 against E<sub>m</sub> ÷ m. More than 2% quicker is “faster”, within ±2% is “similar” and more than 2% slower is “slower”. There is no trend at the 5 km mat.</p>
        <p><strong>What each group stores.</strong> Finish percentiles from the 5th to the 95th in steps of 5; the 10th, 50th and 90th percentile elapsed times at every later mat; the median pace over the rest of the race; and the share of finishes with a sustained slowdown, split by whether it was already recorded by this mat. Shares under a target are interpolated between neighbouring percentiles, so they are approximate. Groups with fewer than 100 finishes are never published, and the page says so instead of guessing.</p>
        <p><strong>Sustained slowdown.</strong> {SLOWDOWN_DEFINITION} The definition follows the published slowdown method cited below. Shares describe what happened in these finishes; they are not a cause, a forecast or anyone’s chance.</p>
        <p><strong>Accuracy.</strong> The validation builds the same groups from earlier races only and scores every later finish on All courses: how often the actual finish fell inside the 10th–90th range, and the median absolute miss of the median, compared with a constant-pace projection. The figures are recomputed with every data release. Course groups were not tested separately.</p>
        <p><strong>Limits.</strong> Only complete finishes with all nine 5 km checkpoints are counted, so runners who stopped are not in the data and a group cannot say how often people drop out. Course groups pool years, weather and fields. No weather or elevation adjustment is applied. Nothing is interpolated between mats: spectators should pick the mat nearest their spot. The arrival windows are observed mat arrivals of similar finishes, not live tracking. The start-clock conversion is calculated from the time you enter.</p>
        <ProjectorExclusions indexSha={sha} />
      </ToolMethod>
      <ToolNext current="projector" />
    </div>
  );
}
