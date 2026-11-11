import BigNumber, { type BigNumberSize, type BigNumberTone } from './BigNumber';
import ByUnits from './ByUnits.client';
import type { ChapterReading } from '@/lib/chapters';

/**
 * A reading's figure where the shell repeats it (next cards, contents and page-list rows): its miles figure, or, when
 * the reading has a kilometre twin (lib/nuggets readingOf `km`), both in a ByUnits pair, so a reader who chose KM sees
 * "s/km" and "°C" there too (design review D2, November 11, 2026). The server HTML holds the default units' figure; a
 * reading with a twin is only shown on pages with the working units switch (the build stops otherwise).
 */
export default function ReadingFigure({ reading, size, tone }: { reading: ChapterReading; size: BigNumberSize; tone?: BigNumberTone }) {
  const mi = <BigNumber value={reading.value} unit={reading.unit} sr={reading.sr} size={size} tone={tone} />;
  if (!reading.km) return mi;
  return <ByUnits mi={mi} km={<BigNumber value={reading.km.value} unit={reading.km.unit} sr={reading.km.sr} size={size} tone={tone} />} />;
}
