import MovedPage from '@/components/MovedPage';
import { movedMetadata } from '@/lib/seo';
import { movedTo } from '@/lib/seo-routes';

// The study's first address, kept for bookmarks. Vercel 308s it to /slowdown; this stub is for hosts that cannot redirect.
export const metadata = movedMetadata('/htw', 'Sustained Slowdown Analysis Has Moved | Pace Notes', 'The Pace Notes sustained slowdown analysis has moved to a new address on splithappens.run.');

export default function HtwMoved() {
  return <MovedPage to={movedTo('/htw')!} action="Read the study">The sustained-slowdown study now has its own page.</MovedPage>;
}
