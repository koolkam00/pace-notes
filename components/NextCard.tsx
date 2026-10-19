import Arrow from './ui/Arrow';
import { joinRanges } from '@/components/ui/keepTogether';
import BigNumber from './ui/BigNumber';
import MarkerBadge from './ui/MarkerBadge';
import ChapterLink from './ChapterLink';
import { UnitLink as Link } from './UnitsProvider';
import { chapterNumber, type ChapterReading, type Next } from '@/lib/chapters';

/**
 * The next card (the redesign spec, section 2.6): one night card that is one link to the next page. Its kicker says
 * where it goes ("Next in this chapter", or the next chapter's marker and "Next chapter · its title"), then the page's title, its
 * reading when the page has one, and the go button. When the next page opens a new chapter, the reading is that
 * chapter's lead and key, so every chapter is announced by its headline number. States: hover (the go button moves 4 px
 * on), focus-visible (the card's ring), pressed.
 */
/** A title whose hyphenated words never break at the hyphen ("The finish-line magnet"). */
const unbroken = (title: string) => title.split(/(\S+-\S+)/).map((part, i) => (i % 2 ? <span key={i} className="nowrap">{part}</span> : part));

export default function NextCard({ next, reading }: { next: Next; reading?: ChapterReading | null }) {
  const { page, chapter, opensChapter } = next;
  const key = reading ? (reading.key ?? (opensChapter ? chapter.key : undefined)) : undefined;
  return (
    <ChapterLink href={page.href} className="next-card night">
      <span className="next-card-kicker t-kicker">
        {opensChapter
          ? <><MarkerBadge marker={chapter.marker} /><span>Next chapter · {chapter.title}<span className="sr-only"> (chapter {chapterNumber(chapter)})</span></span></>
          : 'Next in this chapter'}
      </span>
      <span className="next-card-title">{unbroken(page.title)}</span>
      {reading ? (
        <span className="next-card-reading">
          <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size="m" tone="night" />
          {key ? <span className="next-card-key">{joinRanges(key)}</span> : null}
        </span>
      ) : null}
      <span className="next-card-go" aria-hidden="true"><Arrow /></span>
    </ChapterLink>
  );
}

/** The journey's finish (/tools/plan): no next page, a way back to the contents and on to a past race. */
export function FinishCard() {
  return (
    <div className="next-card night is-finish">
      <span className="next-card-kicker t-kicker">Finish</span>
      <p className="next-card-title">You’ve read the race, start to finish.</p>
      <p className="finish-card-links">
        <Link href="/research" className="finish-card-link">Contents <Arrow /></Link>
        <Link href="/runners" className="finish-card-link">Analyze a past race <Arrow /></Link>
      </p>
    </div>
  );
}
