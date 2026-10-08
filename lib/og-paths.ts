/**
 * The social preview image (Open Graph and X card) for a canonical page path. Server only: it checks that the
 * image file is really in public/ before returning it, so a page never points at a missing card.
 *
 * Most specific first:
 *   /stories/<slug>, /tools/<slug>, /courses/<slug>   their own card, public/og/<section>/<slug>.png
 *   /tools/<slug>/<more>                              its own card, public/og/tools/<slug>/<more>.png (the goal pages
 *                                                     /tools/marathon-pace/<goal>, the race pages /tools/qualifying/<race>),
 *                                                     else the parent tool's card, public/og/tools/<slug>.png
 *   /stories, /tools, /courses, /analyses, /packs     the section card, public/og/sections/<section>.png,
 *   and every page below them                         also used by analysis and pack pages
 *   /<page> outside those sections                    its own card when it has one, public/og/pages/<page>.png
 *                                                     (/finish-times)
 *   anything else                                     public/og/default.png
 *
 * The cards are rendered by scripts/build-og-images.cjs (1200x630 PNG, words only); its card list says which pages
 * have their own card. scripts/verify-seo.cjs checks every og:image in the build exists and is 1200x630, and warns
 * when a page uses a fallback although the script makes a more specific card for it. See docs/SEO.md.
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

/** Top-level pages outside the sections keep their own cards here. */
const PAGE_CARD_DIR = '/og/pages';

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The images that could serve this path, most specific first, ending with the default. Existence is not checked. */
export function ogImageCandidates(pagePath: string): string[] {
  const [section, ...slugs] = pagePath.split(/[?#]/)[0].split('/').filter(Boolean);
  const candidates: string[] = [];
  const isSection = Boolean(section) && Object.prototype.hasOwnProperty.call(SECTION_CARDS, section);
  if (section && PAGE_CARD_SECTIONS.has(section)) {
    // /tools/qualifying/boston: og/tools/qualifying/boston.png, then og/tools/qualifying.png. Only clean slugs make a file name.
    const clean = slugs.findIndex((s) => !SLUG.test(s));
    const usable = clean < 0 ? slugs.length : clean;
    for (let depth = usable; depth >= 1; depth -= 1) candidates.push(`/og/${section}/${slugs.slice(0, depth).join('/')}.png`);
  }
  if (isSection) candidates.push(SECTION_CARDS[section]);
  else if (section && !slugs.length && SLUG.test(section)) candidates.push(`${PAGE_CARD_DIR}/${section}.png`);
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

/** The most specific share card that exists for a clean page path, falling back to the parent tool's card, the section card, then the default. */
export function ogImageFor(pagePath: string): string {
  return ogImageCandidates(pagePath).find(published) ?? DEFAULT_OG_IMAGE;
}
