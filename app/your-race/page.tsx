import MovedPage from '@/components/MovedPage';
import { movedMetadata } from '@/lib/seo';
import { guideTargets, movedTo } from '@/lib/seo-routes';

// The first address of the personalized guide. It has no 308 (lib/seo-routes FORWARD_ONLY): the stub reads an old
// #guide-<question> link in the browser and forwards it to the analysis that answers it, or to the contents.
export const metadata = movedMetadata('/your-race', 'Your Race: Moved | Pace Notes', 'The personalized guide’s questions are now the Pace Notes analyses, all listed in Contents.');

export default function YourRaceMoved() {
  return <MovedPage to={movedTo('/your-race')!} action="Go to Contents" guides={guideTargets()}>The personalized guide’s questions are now the analyses, all listed in Contents.</MovedPage>;
}
