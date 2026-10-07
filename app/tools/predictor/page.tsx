import Predictor from '@/components/tools/Predictor';
import { ToolHeader, ToolMethod, ToolNext } from '@/components/tools/ToolShell';
import { getInsightsManifest } from '@/lib/insights-server';
import './predictor.css';

export const metadata = {
  title: 'Marathon finish-time predictor with honest ranges | Pace Notes',
  description: 'Predict a marathon from a recent 5K, 10K, 10-mile race or half: Riegel, the Daniels–Gilbert equations, the half-to-full exponents runners actually show, a two-race personal exponent and Tanda, each with its known error, and what happened to real finishes on that pace at 20 km.',
};

const INDEX = 'tools/projector.json';
const SHARD = 'tools/projector/all/20.json';

/** The verified index digest, or null when the index or the 20 km shard is not part of this build. */
function indexVersion(): string | null {
  try {
    const files = getInsightsManifest().files;
    return files[INDEX] && files[SHARD] ? files[INDEX].sha256 : null;
  } catch {
    return null;
  }
}

export default function PredictorPage() {
  const sha = indexVersion();
  return (
    <div className="container tool-page">
      <ToolHeader slug="predictor" />
      <Predictor indexSha={sha} />
      <ToolMethod sources={[
        { label: 'Vickers & Vertosick (2016), An empirical study of race times in recreational endurance runners. BMC Sports Science, Medicine and Rehabilitation 8:26', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5000509/' },
        { label: 'RunningAHEAD forum analysis of half-to-full exponents in 4,402 training logs', url: 'https://www.runningahead.com/forums/post/2b60fbf5f01e41fcae69ea40a70223d4' },
        { label: 'Riegel (1981), Athletic records and human endurance. American Scientist 69:285–290 (summary)', url: 'https://en.wikipedia.org/wiki/Peter_Riegel' },
        { label: 'Daniels–Gilbert equations (Oxygen Power, 1979), transcribed', url: 'https://forum.intervals.icu/t/script-for-calculating-jack-daniels-vdot/131024' },
        { label: 'Tanda (2011), Prediction of marathon performance time on the basis of training indices. Journal of Human Sport and Exercise 6(3)', url: 'https://rua.ua.es/dspace/handle/10045/18930?locale=en' },
        { label: 'Keogh et al. (2019), Prediction equations for marathon performance: a systematic review. IJSPP 14:1159', url: 'https://www.insight-centre.org/wp-content/uploads/2020/05/Prediction-equations-for-marathon-performance-A-systematic-review-.pdf' },
        { label: 'Published slowdown method (2021), doi:10.1371/journal.pone.0251513', url: 'https://doi.org/10.1371/journal.pone.0251513' },
      ]}>
        <p><strong>Riegel (1981).</strong> T₂ = T₁ × (D₂ ÷ D₁)<sup>b</sup> with b = 1.06, the value most calculators use. Riegel fitted the power law to records over efforts of roughly 3.5 to 230 minutes. Vickers and Vertosick (2,303 recreational runners) found it well calibrated for races up to the half marathon, but for the marathon it was a median 10:09 too fast, and at least 10 minutes too fast for half of the runners.</p>
        <p><strong>Daniels–Gilbert equations (the basis of VDOT).</strong> Oxygen cost VO₂ = −4.60 + 0.182258v + 0.000104v² (v in metres per minute) and the sustainable fraction 0.8 + 0.1894393e<sup>−0.012778t</sup> + 0.2989558e<sup>−0.1932605t</sup> (t in minutes). Their ratio scores the race; the target time with the same score is found by bisection. For the marathon these equations imply an exponent of about 1.05 to 1.06, so they are about as optimistic as Riegel.</p>
        <p><strong>Typical recreational range.</strong> In 4,402 RunningAHEAD training logs with a half and a full marathon within a year, the half-to-full exponent was 1.09 most often, 1.13 at the median and 1.15 on average (SD 0.084). From a half or longer, the estimates are T × (42.195 ÷ D)<sup>b</sup> for those three exponents. From a shorter race, Riegel 1.06 first gives a half-marathon equivalent, where Vickers and Vertosick found it well calibrated, and the exponents apply from there. This composition of published estimates is Pace Notes’ own; nothing in it is fitted to Pace Notes data. Error grows with the distance ratio (Keogh et al. 2019 reviewed 114 marathon equations and found no single best one), so estimates from a 5K or 10K are less certain than the range shows.</p>
        <p><strong>Personal exponent.</strong> b = ln(T₂ ÷ T₁) ÷ ln(D₂ ÷ D₁) from two races, applied from the longer one. The page warns when b falls outside 1.00 to 1.30 or the races may be more than six months apart, and shows no number outside 0.90 to 1.50.</p>
        <p><strong>Tanda (2011).</strong> Marathon pace (s/km) = 17.1 + 140 × e<sup>−0.0053K</sup> + 0.55P, where K is average weekly kilometres and P the average training pace (s/km) over the eight weeks before the race. It was built on 22 runners and 46 marathons of 2:47 to 3:36, with a standard error of about four minutes, so outside that range the page shows no number.</p>
        <p><strong>Not modelled.</strong> Adding weekly mileage cut Vickers and Vertosick’s typical error from about 19.5 to about 15 minutes, but their coefficients are not reproduced here. No course, weather, age or sex adjustment is applied. Every estimate assumes marathon-specific training, a flat course and cool weather.</p>
        <p><strong>Pace Notes data.</strong> The panel takes the even pace of the estimate you pick and finds the All-courses group from the race-day projector: complete finishes whose 20 km time put them in the same 2-minute band of even-pace finish (20 km time × 42.195 ÷ 20). It shows their finish percentiles (stored from the 5th to the 95th), the share that finished under the estimate (interpolated between percentiles, so approximate) and the share with a sustained slowdown. Groups with fewer than 100 finishes are never published. Pace Notes holds marathons only, so it cannot test a half-to-full prediction: the panel describes finishes that ran this pace, not you.</p>
        <p><strong>Sustained slowdown.</strong> A 5 km section after 20 km run at least 25% slower than the runner’s own 5–20 km pace, with contiguous slowed sections totalling at least 5 km, following the published slowdown method cited below. Only complete finishes with all nine 5 km checkpoints are counted, so runners who stopped are not in the data. Shares describe what happened in these finishes; they are not a cause, a forecast or anyone’s chance.</p>
      </ToolMethod>
      <ToolNext current="predictor" />
    </div>
  );
}
