import Arrow from '@/components/ui/Arrow';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { CHAPTERS, chapterHref, chapterNumber } from '@/lib/chapters';

/** The one name of the way into the race, wherever it is offered (round 5: it had three). The finish card's "Back to
 *  the gun" answers it, so the journey opens and closes on the same words. */
export const startLabel = () => `Start at the gun · Chapter ${chapterNumber(CHAPTERS[0])}`;

/**
 * The one closing line of every info page (/about, /methodology, /privacy, /request-analysis) and of the home guide:
 * the way into the race, chapter 01, so a reader who lands on one from a share or the footer is never left at the footer.
 */
export default function InfoNext({ className }: { className?: string }) {
  return <p className={`info-next${className ? ` ${className}` : ''}`}>
    <Link href={chapterHref(CHAPTERS[0])} className="info-next-link">{startLabel()}<Arrow /></Link>
  </p>;
}
