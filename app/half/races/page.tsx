import HalfRaces, { HALF_RACES_NAME, HALF_RACES_PATH } from '@/components/half/HalfRaces';
import { HALF_NAME, HALF_PATH } from '@/components/half/HalfPage';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';

const TITLE = 'Half Marathon Races: Every Race, Year by Year | Pace Notes';
const DESCRIPTION = 'Every half marathon race with results in Pace Notes: its years, how many results each holds, and how far each year’s results are checked.';

export function generateMetadata() {
  return pageMetadata({ title: TITLE, description: DESCRIPTION, path: HALF_RACES_PATH });
}

export default function HalfMarathonRaces() {
  return (
    <>
      <HalfRaces />
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], [HALF_NAME, HALF_PATH], [HALF_RACES_NAME]])} />
    </>
  );
}
