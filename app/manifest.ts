import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

// Colours are the paper token from app/globals.css; icons are the brand mark in public/icons.
// NEXT_PUBLIC_BASE_PATH keeps the paths right for the optional GitHub Pages build.
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Pace Notes',
    short_name: 'Pace Notes',
    description: 'Marathon pacing from recorded race splits: data stories, pacing tools and course pages.',
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'browser',
    background_color: '#F5F0E6',
    theme_color: '#F5F0E6',
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${base}/icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
