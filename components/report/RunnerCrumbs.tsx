import MarkerBadge from '@/components/ui/MarkerBadge';
import { UnitLink as Link } from '@/components/UnitsProvider';
import { chapterNumber, contentsHref, placeOf } from '@/lib/chapters';

/**
 * The chapter line of /runners and /report: "[10] Chapter 10 · Your race", the chapter linking to its row on the
 * contents. The kind and place ("Your race 1 of 2") are left out: on these pages they only repeat the chapter's name.
 * Server only (lib/chapters reads the published data); the report view takes it as a prop.
 */
export default function RunnerCrumbs({ path }: { path: string }) {
  const place = placeOf(path);
  if (!place) return null;
  return (
    <>
      <MarkerBadge marker={place.chapter.marker} />
      <Link href={contentsHref(place.chapter)} className="crumb-chapter">Chapter {chapterNumber(place.chapter)} · {place.chapter.title}</Link>
    </>
  );
}
