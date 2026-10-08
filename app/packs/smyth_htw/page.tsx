import { pageMetadata } from '@/lib/seo';

export { default } from '@/app/htw/page';

// The original study's archive address, kept for bookmarks: noindex, no canonical (the host redirects it to /slowdown).
export const metadata = pageMetadata({
  title: 'Sustained Slowdown Study: New Address | Pace Notes',
  description: 'The original sustained slowdown study in the Pace Notes research archive now lives on the sustained slowdown page.',
  path: '/packs/smyth_htw',
  noindex: true,
});
