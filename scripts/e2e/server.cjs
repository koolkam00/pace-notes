'use strict';
// The static export in out/, served the way Vercel serves it for these checks: a path, then `.html`, then
// `/index.html`, else 404.html with status 404. browser.cjs answers every request for the site's hosts (and for the
// localhost and preview-host checks) from here inside Playwright's routing, so no port is opened and the browser's dead
// proxy stays the only network path.
const fs = require('node:fs');
const path = require('node:path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml', '.csv': 'text/csv', '.gz': 'application/gzip',
};

/** The file for a URL path, as { status, contentType, body }. */
function respond(out, urlPath) {
  let route;
  try { route = decodeURIComponent(urlPath).replace(/\/$/, ''); } catch { return { status: 400, contentType: 'text/plain', body: Buffer.from('Bad request') }; }
  for (const candidate of route === '' ? ['index.html'] : [route.slice(1), route.slice(1) + '.html', route.slice(1) + '/index.html']) {
    const file = path.join(out, candidate);
    if (file.startsWith(out + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      return { status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) };
    }
  }
  return { status: 404, contentType: TYPES['.html'], body: fs.readFileSync(path.join(out, '404.html')) };
}

module.exports = { respond };
