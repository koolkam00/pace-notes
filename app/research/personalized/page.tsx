import MovedPage from '@/components/MovedPage';
import { movedMetadata } from '@/lib/seo';
import { guideTargets, movedTo } from '@/lib/seo-routes';

// The archived personalized guide (the redesign spec, section 7.16). Vercel 308s here to the contents; on a host that
// cannot redirect, the stub forwards an old #guide-<question> link to the analysis that answers it.
export const metadata = movedMetadata('/research/personalized', 'Personalized Guide: Moved | Pace Notes', 'The personalized guide’s questions are now the Pace Notes analyses, all listed in Contents.');

export default function PersonalizedMoved() {
  return <MovedPage to={movedTo('/research/personalized')!} action="Go to Contents" guides={guideTargets()}>The personalized guide’s questions are now the analyses, all listed in Contents.</MovedPage>;
}
