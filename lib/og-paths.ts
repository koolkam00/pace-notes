/**
 * The social preview image for a canonical page path. Every page uses the shared default card for now;
 * per-page cards (stories, tools, courses, sections) can be returned here later. Images are 1200x630 PNGs.
 */
export const DEFAULT_OG_IMAGE = '/og/default.png';

export const ogImageFor = (_path: string): string => DEFAULT_OG_IMAGE;
