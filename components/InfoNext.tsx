import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { CHAPTERS, chapterHref, chapterNumber } from '@/lib/chapters';

/**
 * The one closing line of every info page (/about, /methodology, /privacy, /request-analysis): the way into the race,
 * chapter 01, so a reader who lands on one from a share or the footer is never left at the footer.
 */
export default function InfoNext() {
  const first = CHAPTERS[0];
  return <p className="info-next">
    <Link href={chapterHref(first)} className="info-next-link">Start reading: Chapter {chapterNumber(first)} · {first.title}<Arrow /></Link>
  </p>;
}
