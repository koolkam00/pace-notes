import type { ReactNode } from 'react';
import ChapterRail from './ChapterRail';

/**
 * The chain's desktop frame for a page that has no shell of its own (the chain's tools and /runners): the chapter rail
 * on the left and the page in the content column, the frame every story and analysis already has, so from 1180 px a
 * reader moving through a chapter keeps the rail and one left edge from its first page to its last (round 4). Under
 * 1180 px the rail is not shown and the page is as it was. A server component: no JavaScript beyond the rail's beats.
 */
export default function ChainFrame({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="chain-frame with-rail">
      <ChapterRail path={path} />
      <div className="chain-flow">{children}</div>
    </div>
  );
}
