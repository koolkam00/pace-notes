import MovedPage from '@/components/MovedPage';
import { movedMetadata } from '@/lib/seo';
import { movedPackIds, movedTo } from '@/lib/seo-routes';

// Every former research-archive question page, closed with the archive on October 17, 2026 (the redesign spec, section
// 00): Vercel 308s each to the downloads, where its data files stay. /packs/smyth_htw has its own stub.
export const dynamicParams = false;
export function generateStaticParams() { return movedPackIds().map((packId) => ({ packId })); }

const SENTENCE = 'The research archive now lives in the methodology, where every data file is still free to download.';

export function generateMetadata({ params }: { params: { packId: string } }) {
  return movedMetadata(`/packs/${params.packId}`, 'Research Archive: Moved | Pace Notes', SENTENCE);
}

export default function PackMoved({ params }: { params: { packId: string } }) {
  return <MovedPage to={movedTo(`/packs/${params.packId}`)!} action="Go to Downloads">{SENTENCE}</MovedPage>;
}
