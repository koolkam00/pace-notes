/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  // Allow GitHub Pages deployments by configuring basePath/assetPrefix via env
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',
  images: {
    unoptimized: true
  },
  reactStrictMode: true,
  webpack(config, { isServer, dev }) {
    // The units provider and the sheet's dialog behaviour, in one shared chunk. The site header needs both, so every page
    // loads them; left to its size rules, webpack copied them into the layout and into page chunks whenever a page's own
    // imports changed which chunks share them (October 18, 2026: the race report's share sheet put a second copy of the
    // units provider into /design-system, 2.2 KB over its budget). scripts/e2e/budget.json still bounds every page.
    const split = config.optimization && config.optimization.splitChunks;
    if (!isServer && !dev && split && split.cacheGroups) {
      split.cacheGroups.shell = {
        test: /[\\/](components[\\/](UnitsProvider|ui[\\/]dialog)\.tsx|lib[\\/](units|unit-preference)\.ts)$/,
        name: 'shell',
        chunks: 'all',
        enforce: true,
        priority: 20
      };
    }
    return config;
  }
};

export default nextConfig;
