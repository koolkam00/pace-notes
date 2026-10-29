import Arrow from '@/components/ui/Arrow';
import BigNumber from '@/components/ui/BigNumber';
import { joinRanges } from '@/components/ui/keepTogether';
import { UnitLink as Link } from '@/components/UnitsProvider';
import type { ChapterReading } from '@/lib/chapters';

/**
 * The night card that closes /half: the same markup as a next card (components/NextCard.tsx), one link to the story of
 * the half and the marathon after it, with that story's reading and key. The reading is the linked page's own figure
 * repeated as a link, so it carries no scope chip here: the page it opens carries it (`data-half-link`, checked by
 * verify-half).
 */
export default function HalfNext({ href, kicker, title, reading }: { href: string; kicker: string; title: string; reading: ChapterReading | null }) {
  return (
    <Link href={href} className="next-card night" data-half-link="linked">
      <span className="next-card-kicker t-kicker">{kicker}</span>
      <span className="next-card-title">{title}</span>
      {reading ? (
        <span className="next-card-reading">
          <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size="m" tone="night" />
          {reading.key ? <span className="next-card-key">{joinRanges(reading.key)}</span> : null}
        </span>
      ) : null}
      <span className="next-card-go" aria-hidden="true"><Arrow /></span>
    </Link>
  );
}
