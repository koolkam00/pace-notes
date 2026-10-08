#!/usr/bin/env node
/**
 * Post-deploy checks on the live site (plan G2, docs/SEO.md): host redirects, legacy redirects, robots.txt,
 * the sitemap (every <loc> must answer 200 without a redirect), X-Robots-Tag headers, the trailing-slash
 * redirect and the live.json file the pacing-analysis workflow reads. Prints PASS or FAIL per check and
 * exits 1 if any check fails. Run it by hand right after each production deploy:
 *
 *   npm run verify:seo:live
 *   node scripts/verify-seo-live.cjs --base https://<preview>.vercel.app   path checks only; the host checks are skipped
 *
 * Needs network access and Node 18+ (fetch). Nothing is written anywhere.
 */
'use strict';

const args = process.argv.slice(2);
const at = args.indexOf('--base');
const PRODUCTION = 'https://splithappens.run';
const BASE = (at >= 0 ? args[at + 1] : PRODUCTION).replace(/\/$/, '');
const IS_PRODUCTION = BASE === PRODUCTION;
const TIMEOUT_MS = 20000;
const CONCURRENCY = 8;

async function request(url, method = 'GET') {
  const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'pace-notes-verify-seo-live/1 (+https://splithappens.run)' } });
  return response;
}
const header = (response, name) => response.headers.get(name) || '';
const target = (response, from) => { const location = header(response, 'location'); return location ? new URL(location, from).href : ''; };

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (error) {
    results.push({ name, ok: false, detail: error.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : error.cause ? `${error.message} (${error.cause.code || error.cause.message})` : error.message });
  }
}
function skip(name, why) { results.push({ name, ok: null, detail: why }); }
function expect(condition, message) { if (!condition) throw new Error(message); }

async function expectRedirect(from, to) {
  const response = await request(from);
  const location = target(response, from);
  expect(response.status === 308 && location === to, `${from} answered ${response.status}${location ? ` to ${location}` : ''}; expected 308 to ${to}`);
  return `308 to ${location}`;
}

async function main() {
  console.log(`verify-seo-live: ${BASE}${IS_PRODUCTION ? '' : ' (not production: host checks skipped)'}\n`);

  if (IS_PRODUCTION) {
    await check('www host: 308 to the apex, keeping path and query', () => expectRedirect('https://www.splithappens.run/tools?x=1', 'https://splithappens.run/tools?x=1'));
    await check('htw-live-study.vercel.app: 308 to the apex, keeping path and query', () => expectRedirect('https://htw-live-study.vercel.app/slowdown?a=1', 'https://splithappens.run/slowdown?a=1'));
  } else {
    skip('www host: 308 to the apex, keeping path and query', 'needs the production host');
    skip('htw-live-study.vercel.app: 308 to the apex, keeping path and query', 'needs the production host');
  }
  await check('/htw: 308 to /slowdown', () => expectRedirect(`${BASE}/htw`, `${BASE}/slowdown`));
  await check('/packs/smyth_htw: 308 to /slowdown', () => expectRedirect(`${BASE}/packs/smyth_htw`, `${BASE}/slowdown`));

  await check('/robots.txt: 200 text/plain with the Sitemap line', async () => {
    const response = await request(`${BASE}/robots.txt`);
    const type = header(response, 'content-type');
    const body = response.status === 200 ? await response.text() : '';
    expect(response.status === 200, `answered ${response.status}`);
    expect(/^text\/plain\b/i.test(type), `content-type is "${type}"`);
    expect(/^sitemap:\s*https:\/\/splithappens\.run\/sitemap\.xml\s*$/im.test(body), 'no "Sitemap: https://splithappens.run/sitemap.xml" line');
    expect(!/^disallow:\s*\/\s*$/im.test(body), 'has "Disallow: /"');
    return `200 ${type}`;
  });

  let locs = [];
  await check('/sitemap.xml: 200 XML with <loc> entries', async () => {
    const response = await request(`${BASE}/sitemap.xml`);
    const type = header(response, 'content-type');
    const body = response.status === 200 ? await response.text() : '';
    expect(response.status === 200, `answered ${response.status}`);
    expect(/\bxml\b/i.test(type), `content-type is "${type}"`);
    expect(/<urlset\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(body), 'no sitemaps.org <urlset>');
    locs = [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    expect(locs.length > 0, 'no <loc> entries');
    return `200 ${type}, ${locs.length} URLs`;
  });
  if (locs.length) {
    await check('every sitemap <loc>: 200 without a redirect', async () => {
      const bad = [];
      const queue = locs.map((loc) => (IS_PRODUCTION ? loc : loc.replace(PRODUCTION, BASE)));
      await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
        for (let url = queue.shift(); url; url = queue.shift()) {
          try {
            let response = await request(url, 'HEAD');
            if (response.status === 405) response = await request(url);
            if (response.status !== 200) bad.push(`${url} ${response.status}${target(response, url) ? ` to ${target(response, url)}` : ''}`);
          } catch (error) { bad.push(`${url} ${error.name === 'TimeoutError' ? 'timed out' : error.message}`); }
        }
      }));
      expect(!bad.length, `${bad.length} of ${locs.length} did not answer 200: ${bad.slice(0, 8).join('; ')}${bad.length > 8 ? '; …' : ''}`);
      return `${locs.length} of ${locs.length} answered 200`;
    });
  } else skip('every sitemap <loc>: 200 without a redirect', 'no sitemap to read');

  await check('/data/insights/manifest.json: X-Robots-Tag noindex', async () => {
    const response = await request(`${BASE}/data/insights/manifest.json`, 'HEAD');
    const tag = header(response, 'x-robots-tag');
    expect(response.status === 200, `answered ${response.status}`);
    expect(/\bnoindex\b/i.test(tag), `X-Robots-Tag is "${tag || 'absent'}"`);
    return `X-Robots-Tag: ${tag}`;
  });
  await check('/runners?q=x: X-Robots-Tag noindex, nofollow', async () => {
    const response = await request(`${BASE}/runners?q=x`, 'HEAD');
    const tag = header(response, 'x-robots-tag');
    expect(response.status === 200, `answered ${response.status}`);
    expect(/\bnoindex\b/i.test(tag) && /\bnofollow\b/i.test(tag), `X-Robots-Tag is "${tag || 'absent'}"`);
    return `X-Robots-Tag: ${tag}`;
  });

  await check('/tools/: 308 to /tools in one hop', async () => {
    const detail = await expectRedirect(`${BASE}/tools/`, `${BASE}/tools`);
    const next = await request(`${BASE}/tools`, 'HEAD');
    expect(next.status === 200, `/tools then answered ${next.status}`);
    return `${detail}, which answers 200`;
  });
  await check('/tools.html: 404', async () => {
    const response = await request(`${BASE}/tools.html`, 'HEAD');
    expect(response.status === 404, `answered ${response.status}${target(response, `${BASE}/tools.html`) ? ` to ${target(response, `${BASE}/tools.html`)}` : ''}`);
    return '404';
  });

  await check('/data/live.json: 200 and parses as JSON', async () => {
    const response = await request(`${PRODUCTION}/data/live.json`);
    expect(response.status === 200, `answered ${response.status}${target(response, `${PRODUCTION}/data/live.json`) ? ` to ${target(response, `${PRODUCTION}/data/live.json`)}` : ''}`);
    const body = await response.text();
    try { JSON.parse(body); } catch (error) { throw new Error(`does not parse: ${error.message}`); }
    return `200, ${body.length.toLocaleString('en-US')} bytes of JSON`;
  });

  await check('home page: canonical and a loading 1200x630 og:image', async () => {
    const response = await request(`${BASE}/`);
    expect(response.status === 200, `answered ${response.status}`);
    const html = await response.text();
    const head = html.slice(0, html.search(/<\/head>/i));
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(head);
    const image = /<meta property="og:image" content="([^"]+)"/.exec(head);
    expect(canonical && canonical[1] === PRODUCTION, `canonical is ${canonical ? canonical[1] : 'missing'}`);
    expect(image, 'no og:image');
    const picture = await request(image[1].replace(PRODUCTION, BASE));
    const bytes = Buffer.from(await picture.arrayBuffer());
    expect(picture.status === 200 && /^image\//.test(header(picture, 'content-type')), `${image[1]} answered ${picture.status} ${header(picture, 'content-type')}`);
    const size = bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504E47 ? `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}` : 'not a PNG';
    expect(size === '1200x630', `${image[1]} is ${size}`);
    return `canonical ${canonical[1]}, og:image ${image[1]} (${size})`;
  });

  for (const r of results) console.log(`${r.ok === null ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
  const failed = results.filter((r) => r.ok === false);
  console.log(`\n${failed.length ? `verify-seo-live: ${failed.length} of ${results.length} checks failed.` : `verify-seo-live: all ${results.filter((r) => r.ok).length} checks passed${results.some((r) => r.ok === null) ? ' (some skipped)' : ''}.`}`);
  if (failed.some((r) => /fetch failed/.test(r.detail)) && (process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    console.log('Network errors behind a proxy: re-run with NODE_USE_ENV_PROXY=1 (Node 22.21+ or 24+).');
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
