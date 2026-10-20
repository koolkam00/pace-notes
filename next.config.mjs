// The root layout's client references, recorded last. Next merges the client reference manifests of every entry in a
// route group, and app/layout shares its group ('app') with app/(home)/page and app/not-found; the last one written wins.
// A page whose own server components never import a module the layout renders (the units provider, the header) then
// told the browser to fetch that module with whichever sibling's chunk list came last. On October 18, 2026 that was the
// home page's: every stub and /privacy fetched the home page's chunk and the chips' chunk, 8.3 KB they never ran.
// Moving app/layout to the end of the entry order, just before the manifest is written, makes the layout's own chunk
// list (already on every page) the one those pages get.
class RootLayoutReferencesLast {
  apply(compiler) {
    const { Compilation } = compiler.webpack;
    compiler.hooks.thisCompilation.tap('RootLayoutReferencesLast', (compilation) => {
      compilation.hooks.processAssets.tap({ name: 'RootLayoutReferencesLast', stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH - 1 }, () => {
        const layout = compilation.entrypoints.get('app/layout');
        if (!layout) return;
        compilation.entrypoints.delete('app/layout');
        compilation.entrypoints.set('app/layout', layout);
      });
    });
  }
}

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
    if (!isServer && !dev) config.plugins.push(new RootLayoutReferencesLast());
    return config;
  }
};

export default nextConfig;
