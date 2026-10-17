import type { ReactNode } from 'react';
import { UnitLink } from '@/components/UnitsProvider';
import Arrow from './Arrow';
import BigNumber from './BigNumber';
import MarkerBadge, { type Marker } from './MarkerBadge';
import { withEm } from './Reading';

/**
 * A nugget card (spec section 3.5): the home deck, /stories and story cards. A kicker row (marker, chapter), the figure,
 * the claim (at most 3 lines, the finding in italic), a server-drawn micro-viz of at most 64 px and a foot link. The
 * whole card is one link (pass className="story-card" on the home page); `share` is a sibling laid over the card's top
 * right corner, so links never nest. Content-sized: no minimum height. `night` is for answer-type nuggets.
 */
type Props = {
  href: string;
  marker?: Marker;
  chapter?: string;
  figure: { value: string; unit?: string; sr: string };
  claim: string;
  micro?: ReactNode;
  foot?: string;
  share?: ReactNode;
  night?: boolean;
  className?: string;
};

export default function NuggetCard({ href, marker, chapter, figure, claim, micro, foot = 'Read the story', share, night = false, className }: Props) {
  return (
    <div className="nugget-card-wrap">
      <UnitLink href={href} className={`nugget-card${night ? ' night' : ''}${className ? ` ${className}` : ''}`}>
        {marker || chapter ? (
          <span className="nugget-card-kicker">
            {marker ? <MarkerBadge marker={marker} /> : null}
            {chapter ? <span className="t-kicker">{chapter}</span> : null}
          </span>
        ) : null}
        <BigNumber value={figure.value} unit={figure.unit} sr={figure.sr} size="l" />
        <span className="nugget-card-claim">{withEm(claim)}</span>
        {micro ? <span className="nugget-card-micro" aria-hidden="true">{micro}</span> : null}
        <span className="nugget-card-foot">{foot}<Arrow /></span>
      </UnitLink>
      {share ? <div className="nugget-card-share">{share}</div> : null}
    </div>
  );
}
