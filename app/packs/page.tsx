import MovedPage from '@/components/MovedPage';
import { movedMetadata } from '@/lib/seo';
import { movedTo } from '@/lib/seo-routes';

// The research archive closed on October 17, 2026 (the redesign spec, section 00): Vercel 308s here to the downloads.
export const metadata = movedMetadata('/packs', 'Research Archive: Moved | Pace Notes', 'The Pace Notes research archive now lives in the methodology, where every data file is still free to download.');

export default function PacksMoved() {
  return <MovedPage to={movedTo('/packs')!} action="Go to downloads">The research archive now lives in the methodology, where every data file is still free to download.</MovedPage>;
}
