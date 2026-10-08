/**
 * The social preview image (Open Graph and X card) for a canonical page path. Server only: it checks that the
 * image file is really in public/ before returning it, so a page never points at a missing card.
 *
 * Most specific first:
 *   /stories/<slug>, /tools/<slug>, /courses/<slug>   their own card, public/og/<section>/<slug>.png
 *   /tools/<slug>/<more>                              the parent tool's card
 *   /stories, /tools, /courses, /analyses, /packs     the section card, public/og/sections/<section>.png,
 *   and every page below them                         also used by analysis and pack pages
 *   anything else                                     public/og/default.png
 *
 * The cards are rendered by scripts/build-og-images.cjs (1200x630 PNG, words only). scripts/verify-seo.cjs checks
 * every og:image in the build exists and is 1200x630. See docs/SEO.md.
 */
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_OG_IMAGE = '/og/default.png';

/** Sections whose pages each have their own card. */
const PAGE_CARD_SECTIONS: ReadonlySet<string> = new Set(['stories', 'tools', 'courses']);

/** Sections with a section card; every page below them falls back to it. */
const SECTION_CARDS: Readonly<Record<string, string>> = {
  stories: '/og/sections/stories.png',
  tools: '/og/sections/tools.png',
  courses: '/og/sections/courses.png',
  analyses: '/og/sections/analyses.png',
  packs: '/og/sections/packs.png',
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The images that could serve this path, most specific first, ending with the default. Existence is not checked. */
export function ogImageCandidates(pagePath: string): string[] {
  const [section, slug] = pagePath.split(/[?#]/)[0].split('/').filter(Boolean);
  const candidates: string[] = [];
  if (section && slug && PAGE_CARD_SECTIONS.has(section) && SLUG.test(slug)) candidates.push(`/og/${section}/${slug}.png`);
  if (section && Object.prototype.hasOwnProperty.call(SECTION_CARDS, section)) candidates.push(SECTION_CARDS[section]);
  candidates.push(DEFAULT_OG_IMAGE);
  return candidates;
}

const present = new Map<string, boolean>();
/** True when public/<image> exists. next build runs from the project root, as lib/insights-server.ts assumes. */
function published(image: string): boolean {
  let found = present.get(image);
  if (found === undefined) {
    found = fs.existsSync(path.join(process.cwd(), 'public', image));
    present.set(image, found);
  }
  return found;
}

/** The most specific share card that exists for a clean page path, falling back to the section card, then the default. */
export function ogImageFor(pagePath: string): string {
  return ogImageCandidates(pagePath).find(published) ?? DEFAULT_OG_IMAGE;
}
