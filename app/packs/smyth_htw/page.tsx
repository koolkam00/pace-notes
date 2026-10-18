import MovedPage from '@/components/MovedPage';
import { movedMetadata } from '@/lib/seo';
import { movedTo } from '@/lib/seo-routes';

// The original study's archive address, kept for bookmarks: Vercel 308s it to /slowdown (before the /packs/:id* rule).
export const metadata = movedMetadata('/packs/smyth_htw', 'Sustained Slowdown Study: New Address | Pace Notes', 'The original sustained slowdown study in the Pace Notes research archive now lives on the sustained slowdown page.');

export default function SmythMoved() {
  return <MovedPage to={movedTo('/packs/smyth_htw')!} action="Read the study">The study now has a page of its own.</MovedPage>;
}
