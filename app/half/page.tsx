import HalfBody from '@/components/half/HalfBody';
import { HALF_NAME, HALF_PATH } from '@/components/half/HalfPage';
import { getNugget, plain, sentenceOf } from '@/lib/nuggets';
import { JsonLd, breadcrumbs, pageMetadata } from '@/lib/seo';

const TITLE = 'Half Marathon Finish Times: What the Field Ran | Pace Notes';
const TAIL = 'Women and men, round times, and the same cities’ marathons.';

/**
 * The search description, from the page's first two readings (half.field, half.under) when both guards hold: "Just over
 * half of half marathon finishes came in under 2:00, 1 in 4 under 1:45." and what else the page shows. Otherwise the
 * field reading alone (its fallback when its guard fails). No count of finishes: titles and descriptions name only the
 * marathon's finishes in millions.
 */
function description(): string {
  const field = getNugget('half.field'), under = getNugget('half.under');
  const lead = plain(sentenceOf(field));
  const share = under.guard ? /^\*([^*]+)\*(?: of)? half finishes came in under (\d:\d\d)\.$/.exec(sentenceOf(under)) : null;
  return field.guard && share ? `${lead.replace(/\.$/, '')}, ${share[1]} under ${share[2]}. ${TAIL}` : `${lead} ${TAIL}`;
}

export function generateMetadata() {
  return pageMetadata({ title: TITLE, description: description(), path: HALF_PATH });
}

export default function HalfMarathon() {
  return (
    <>
      <HalfBody />
      <JsonLd data={breadcrumbs([['Pace Notes', '/'], [HALF_NAME]])} />
    </>
  );
}
