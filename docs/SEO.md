# Search and social metadata

How Pace Notes tells search engines and link previews what each page is. Written October 8, 2026.

## What is indexed, and why

The route policy lives in [`lib/seo-routes.ts`](../lib/seo-routes.ts). The sitemap, page metadata and the SEO checks all read it, so there is one list to change.

| Pages | Robots | Canonical | In the sitemap |
| --- | --- | --- | --- |
| Home, stories, tools, analyses, courses, about, methodology, privacy, slowdown, `/research/personalized` | index, follow | the page itself | yes |
| The 33 primary research questions under `/packs` | index, follow | the page itself | yes |
| 45 pack aliases (`ext_*`, most `s*`, `rn3`, `p1`, `p2`) | index, follow | the primary pack (`packCanonical(id)`) | no |
| `THIN_PACKS`: p3, p4, r16, r33, rn1, rn4 | noindex, follow | none | no |
| `NOINDEX`: `/runners`, `/your-race`, `/request-analysis`, `/htw`, `/packs/smyth_htw` | noindex, follow | none | no |
| 404 | noindex (added by Next.js; see the note below) | none | no |

The 404 page also inherits the layout's `index, follow, max-image-preview:large`, so `out/404.html` carries two robots tags. Crawlers apply the stricter one and the page is served with a 404 status, so it is never indexed. Adding `robots: { index: false, follow: true }` to the metadata in `app/not-found.tsx` removes the conflict.

Reasons:
- **Pack aliases** repeat the text of a primary page. The canonical points at the primary, which the `/packs` index already links to.
- **Thin packs** have fewer than 170 words of text. Four only say the current release cannot answer the question.
- **`/runners`** looks up recorded names. Runner profiles must never be indexable.
- **`/your-race`** is a client-side redirect. **`/request-analysis`** is an email form.
- **`/htw` and `/packs/smyth_htw`** are old addresses. On Vercel they redirect to `/slowdown`.

Query strings (`?units=`, `?race=`, `?goal=` and so on) never appear in a canonical, an `og:url` or the sitemap. The static export serves the same HTML for every query, so the canonical on the clean path covers all of them. Runner names, birth dates, labels and search text never go in a URL, the sitemap, structured data or analytics.

## Where metadata comes from

- **[`app/layout.tsx`](../app/layout.tsx)** sets site-wide defaults only:
  - `metadataBase` is hard-coded to `https://splithappens.run`. Without it, Vercel would fall back to the deployment host.
  - Default Open Graph (`siteName` Pace Notes, `en_US`, `/og/default.png`), an X `summary_large_image` card and `robots: index, follow, max-image-preview:large`.
  - A fallback description that uses the build-time finish count.
  - Never put a canonical, `openGraph.url` or `title.template` here. Titles carry their own "| Pace Notes" suffix where it fits, so a template would double it.
- **[`lib/seo.tsx`](../lib/seo.tsx)** (server components only):
  - `pageMetadata({ title, description, path, type, noindex, canonicalPath, image, imageAlt, publishedTime, modifiedTime })` returns the title, description, absolute canonical, the full Open Graph block, the X card and robots. It throws if `path` contains `?` or `#`. A page-level `openGraph` replaces the layout's, so the helper always returns the whole object.
  - `finishesM()` gives the analysis cohort in millions ("3.4"), read from `analysis_n` in `public/data/insights/manifest.json`. Use it for every "N.N million" in a title or description, never a typed number.
  - `JsonLd` renders a JSON-LD block with `<` escaped. `breadcrumbs()` builds a BreadcrumbList.
- **[`lib/og-paths.ts`](../lib/og-paths.ts)** picks the social image for a page: its own card for a story, tool or course, else its section's card, else `/og/default.png`. It only returns files that exist in `public/`. See [Share cards](#share-cards-publicog).

How a page uses it:

```tsx
import { pageMetadata } from '@/lib/seo';
import { canonicalPathFor, isNoindex } from '@/lib/seo-routes';

export const metadata = pageMetadata({ title: 'Printable Marathon Pace Band for Any Goal | Pace Notes', description: '…', path: '/tools/pace-band' });

// A pack page:
const path = `/packs/${id}`;
pageMetadata({ title, description, path, noindex: isNoindex(path), canonicalPath: canonicalPathFor(path) ?? undefined });
```

## robots.txt and the sitemap

- **[`app/robots.ts`](../app/robots.ts)** writes `out/robots.txt`. It allows everything except `/data/runners/index/` and `/data/runners/profiles/`, the two folders that hold recorded names. Pages render their charts from the rest of `/data`, so `/data`, `/_next`, `/og` and `/icons` stay crawlable. It also points to the sitemap.
- **[`app/sitemap.ts`](../app/sitemap.ts)** writes `out/sitemap.xml` from `sitemapEntries()`. It uses absolute URLs and no `priority` or `changefreq`, because Google ignores both.
  - The list comes from the same registries as the pages: `STORIES` (filtered by the data manifest), `TOOLS`, `TEN_ANALYSES` plus the ready weather analyses plus downhill-start, `getCourseNames()`, the primary packs and the fixed pages. That is 101 URLs today.
  - `sitemapEntries()` throws if a path repeats, has a query or fragment, is noindex, or is not its own canonical.
  - **New content pages** go in `EXTRA_SITEMAP_PAGES` in `lib/seo-routes.ts`. A new entry in `TOOLS` is picked up automatically.
- **`lastmod` is honest.** It is the newest `as_of` date of the data the page shows (insights manifest, study, weather, personalized guide, fast-start, all-finisher, `pack_meta`, or `VERIFIED_AT` for qualifying). Pages that are mostly written text use the hand-kept `CONTENT_DATES` map. When neither applies, `lastmod` is left out (`/privacy`, for example). The build never uses today's date or git dates. **When you change the visible text of a page in `CONTENT_DATES`, update its date.**
- Both routes use `dynamic = 'force-static'`, so they stay static files in the export.

## Icons and manifest

- `app/manifest.ts` writes `out/manifest.webmanifest`: name Pace Notes, paper colour `#F5F0E6`, `display: browser`, icons in `public/icons/` (192, 512 and a maskable 512).
  - With `NEXT_PUBLIC_BASE_PATH` set (the optional GitHub Pages build), the manifest's own paths carry the base path, but Next.js 14.2.5 writes the `<link rel="manifest">` tag as `/manifest.webmanifest` without it, so the manifest does not load there. Favicons, canonicals, Open Graph images and the sitemap are unaffected. The Vercel site has no base path.
- `app/icon1.png` (192 px) gives Google a PNG favicon; SVG is not a Google favicon format. `app/icon.svg`, `favicon.ico` and `apple-icon.png` stay.
- `public/og/default.png` is the 1200×630 share card for pages without a more specific one: the brand mark, "Pace Notes", a tagline and the credit. It has no numbers (they would go stale) and no runner names. It was rendered with Playwright from an HTML card using the site's fonts and colour tokens. If you replace it, keep it 1200×630 and at most 120 KB, like the other cards. The other cards are described in [Share cards](#share-cards-publicog).

## Share cards (`public/og/`)

Every page's `og:image` and X card is a 1200×630 PNG picked by `ogImageFor(path)` in [`lib/og-paths.ts`](../lib/og-paths.ts). It returns the most specific card that exists in `public/`:

| Page | Card | Text on the card |
| --- | --- | --- |
| `/stories/<slug>` | `og/stories/<slug>.png` | "Data story" and the kicker, the story title (`lib/stories.ts`) |
| `/tools/<slug>` and pages below it | `og/tools/<slug>.png` | "Runner tools" and the group, the heading or title (`lib/tools/registry.ts`) |
| `/courses/<slug>` | `og/courses/<slug>.png` | "Courses · Course profile", the race name, and the supplied route outline when there is one |
| `/stories`, `/tools`, `/courses` | `og/sections/<section>.png` | the section's own line |
| `/analyses` and every analysis page | `og/sections/analyses.png` | |
| `/packs` and every pack page | `og/sections/packs.png` (the research archive) | |
| everything else (home, about, methodology, slowdown, …) | `og/default.png` | |

If a story, tool or course has no card yet, its page falls back to the section card, then to the default, so a page never points at a missing file. `verify-seo` warns about those fallbacks.

**Rules for the cards:** words only (the brand, a section label, the title or race name, and "by Andrew Kam"); no data numbers, because they would go stale; no runner names; 1200×630; at most 120 KB each (49 cards, 32–81 KB, 2.6 MB in all on October 8, 2026). The race name follows the course page's rule: the supplied route's race name, else the course summary's, else the city plus " Marathon". "Washington Marathon" is shown as the data names it; if the owner renames that race, re-run the script.

**Making them.** [`scripts/build-og-images.cjs`](../scripts/build-og-images.cjs) renders the cards with Playwright and headless Chromium from an HTML template in the default card's design: Fraunces and Inter from `node_modules/@fontsource-variable` (the same stylesheets `app/layout.tsx` imports), the night background and accents from `app/globals.css` (the script stops if those tokens change), and each story's or tool's accent colour. It adds no project dependency: it loads `playwright` from `node_modules` if present, else `/opt/node-tools/node_modules/playwright`. Install it outside the project if you have neither (`npm i -g playwright && npx playwright install chromium`, then run with `NODE_PATH` set to the global modules folder).

```bash
npm run og:images                                  # render missing or changed cards; unchanged ones are skipped
node scripts/build-og-images.cjs --force           # render every card again
node scripts/build-og-images.cjs --only courses/   # only cards whose file name contains the text
npm run og:check                                   # no browser: report missing, changed, oversized or orphaned cards
```

Re-run it, and commit the PNGs, when you add or rename a story, tool or course, change a title, kicker, tool heading or accent, or change the card design. Delete the cards it reports as orphans. Then run `npm run build` so the pages pick up the new files.

The card list comes from the registries in a fixed order, so runs are repeatable. Each PNG carries a `tEXt` chunk (`pace-notes-og`) with a hash of its HTML (text, layout, colours and the font package versions); that is how the script skips unchanged cards and how `og:check` spots stale ones without a browser. Pixels are identical between runs on the same machine; another Chromium or font build may anti-alias slightly differently, which only shows up as a binary change.

## Automated checks: `verify-seo`

[`scripts/verify-seo.cjs`](../scripts/verify-seo.cjs) reads the static export and fails if any page breaks the rules on this page. It loads `lib/seo-routes.ts` (and `finishesM()` from `lib/seo.tsx`) with the same TypeScript require hook as `scripts/verify-units.cjs`, so it checks the build against the same policy the pages were built from. It has no dependencies and takes a few seconds.

```bash
npm run build && npm run verify:seo
node scripts/verify-seo.cjs --out <folder>    # another export folder
node scripts/verify-seo.cjs --all             # list every page in a failed group, not just the first 25
```

CI runs it after `npm run build` in [`site-validation.yml`](../.github/workflows/site-validation.yml). Failures are grouped by check, with the page and the reason; the script exits 1 if any check fails.

| Check | Fails when |
| --- | --- |
| `head-tags` | a page (404 excepted) lacks exactly one non-empty `<title>`, meta description or `<h1>` |
| `robots-meta` | noindex is missing from a `NOINDEX` path, a `THIN_PACKS` page or the 404, is on any other page, or two robots tags disagree; or a pack is noindex only because `packCanonical()` found no primary page |
| `canonical` | an indexable page lacks exactly one canonical, or it is off `https://splithappens.run`, has `?`, `#` or a trailing slash, or differs from `canonicalPathFor(path)`; or a noindex page has one |
| `aliases` | a pack alias's primary page is not indexable, was not built, or is not its own canonical |
| `social-tags` | an indexable page lacks `og:title`, `og:description`, `og:image`, `twitter:card` or `og:url`, or `og:url` is not the canonical |
| `og-image` | an `og:image` or `twitter:image` is off the host, missing from the export, or not 1200×630 (read from the PNG, JPEG or WebP header) |
| `duplicates` | two indexable pages (aliases included) share a title or a description |
| `sitemap` | `sitemap.xml` does not parse, repeats a `<loc>`, has a relative or unclean `<loc>`, lists a page that is missing, noindex, an alias or not its own canonical, misses an indexable self-canonical page, disagrees with `sitemapEntries()`, or has a `lastmod` in the future or not among the data and content dates |
| `robots-txt` | the `Sitemap:` line is missing, a group disallows `/`, any group blocks the pages, `/_next/`, `/data/` (outside the two runner folders), `/og/` or `/icons/`, or the runner folders are not blocked |
| `json-ld` | a block does not parse, its `@context` is not schema.org, a `Person` is anyone but "Andrew Kam" or carries a URL, `/runners` has any, a `ProfilePage` appears, a site URL has a query, or breadcrumb positions are not 1..n or point off the host |
| `banned-words` | "the wall", "arithmetic" or "your chance" is in visible text, alt, title or aria-label text, metadata or JSON-LD |
| `fastest` | "fastest" is in a title, description, `<h1>` or og/X tag (body text may use it) |
| `runner-counts` | a title or description says "million runners" or "N runners" (counts are finishes) |
| `personal-data` | `q=` is in a canonical, `og:url`, the sitemap or JSON-LD, or `/runners` is not noindex |
| `units-links` | an internal `href` in the static HTML carries `units=mi`, the default unit |
| `old-host` | `htw-live-study.vercel.app` is in any `<head>` (or in JSON-LD) |
| `finish-counts` | an "N.N million" or "N.NM" in a title or description is not `finishesM()` |

Warnings only: titles over 60 characters, descriptions over 155 (the site's limits), story, tool and course pages that use a fallback card, and policy notes (noindex pages that also say nofollow, JSON-LD on pages the plan keeps without it, `changefreq` or `priority` in the sitemap).

## After a deploy: `verify-seo-live`

[`scripts/verify-seo-live.cjs`](../scripts/verify-seo-live.cjs) checks what only the live site can show. Run it by hand right after each production deploy; it prints PASS or FAIL per check and exits 1 on any failure.

```bash
npm run verify:seo:live
node scripts/verify-seo-live.cjs --base https://<preview>.vercel.app   # path checks only; host checks are skipped
```

| Check | Passes when |
| --- | --- |
| www host | `https://www.splithappens.run/tools?x=1` answers 308 to `https://splithappens.run/tools?x=1` |
| old host | `https://htw-live-study.vercel.app/slowdown?a=1` answers 308 to `https://splithappens.run/slowdown?a=1` |
| `/htw`, `/packs/smyth_htw` | each answers 308 to `/slowdown` |
| `/robots.txt` | 200 `text/plain`, with the `Sitemap:` line and no `Disallow: /` |
| `/sitemap.xml` | 200 XML with a sitemaps.org `<urlset>`, and every `<loc>` answers 200 without a redirect |
| `/data/insights/manifest.json` | sends `X-Robots-Tag: noindex` |
| `/runners?q=x` | sends `X-Robots-Tag: noindex, nofollow` |
| `/tools/`, `/tools.html` | `/tools/` answers 308 to `/tools` (which answers 200) in one hop; `/tools.html` answers 404 |
| `/data/live.json` | answers 200 and parses as JSON (the pacing-analysis workflow reads it with `curl --fail`, no `-L`) |
| home page | has the canonical `https://splithappens.run` and an `og:image` that loads as a 1200×630 PNG |

On a preview, the host checks are skipped, and Vercel already sends `x-robots-tag: noindex` on every preview response, so the header checks prove only that a header is there.

Status on October 8, 2026, before this work was deployed: 3 of 13 checks pass (`/tools/`, `/tools.html` and `/data/live.json`), 9 fail and the sitemap-URL check is skipped because there is no sitemap yet. www answers 307, not 308 (an owner setting; see the checklist below). The old host, `/htw` and `/packs/smyth_htw` answer 200. `robots.txt` and `sitemap.xml` are 404. Neither `X-Robots-Tag` header is sent, and the home page has no canonical. All of those should pass once the integration branch is deployed and the www redirect is changed.

## Redirects and headers ([`vercel.json`](../vercel.json))

Next.js `redirects()` and `headers()` do not work with `output: 'export'`, so these live in `vercel.json`:

| Rule | Effect |
| --- | --- |
| Host `htw-live-study.vercel.app`, any path | 308 to `https://splithappens.run/<same path>` |
| `/htw` | 308 to `/slowdown` |
| `/packs/smyth_htw` | 308 to `/slowdown` |
| `/data/*` | `X-Robots-Tag: noindex` (files stay downloadable and fetchable) |
| `/runners` with a `q` query | `X-Robots-Tag: noindex, nofollow` (old links that carry a name) |
| `trailingSlash: false` | `/tools/` goes to `/tools` in one hop, as before |

The pacing-analysis workflow reads `https://splithappens.run/data/live.json` directly. It uses `curl --fail` without `-L`, so it must never point at the old host.

### What a preview deployment cannot test

- **The host redirect.** Preview URLs have a different host, so the rule never fires there. Previews also already send `x-robots-tag: noindex`, so check that the `/data` and `/runners?q=` headers are present, not their value.
- **Whether a redirect beats an existing static file** (`out/htw.html`) and **whether query strings survive the host 308.** Neither is verified yet; check both in production.

Right after each production deploy (keep Vercel Instant Rollback ready), run `npm run verify:seo:live` ([above](#after-a-deploy-verify-seo-live)). It makes these requests and more; the same checks by hand:

```bash
curl -sI 'https://htw-live-study.vercel.app/slowdown?a=1'   # 308, location https://splithappens.run/slowdown?a=1
curl -sI 'https://splithappens.run/htw'                      # 308, location /slowdown
curl -sI 'https://splithappens.run/packs/smyth_htw'          # 308, location /slowdown
curl -sI 'https://splithappens.run/data/insights/manifest.json' | grep -i x-robots-tag   # noindex
curl -sI 'https://splithappens.run/runners?q=x' | grep -i x-robots-tag                   # noindex, nofollow
curl -sI 'https://splithappens.run/tools/'                   # 308 to /tools in one hop
curl -s  'https://splithappens.run/robots.txt'               # the rules above and the Sitemap line
curl -s  'https://splithappens.run/sitemap.xml' | grep -c '<loc>'
curl -sf 'https://splithappens.run/data/live.json' | python3 -m json.tool > /dev/null && echo live.json ok
```

## Owner checklist (outside the repo, after the deploy)

- [ ] **Vercel www redirect.** Project → Settings → Domains. Set `www.splithappens.run` to "Redirect to splithappens.run" with **308 Permanent** (add it if it is not listed). Today it answers 307. Check: `curl -sI 'https://www.splithappens.run/tools?x=1'` returns 308 to `https://splithappens.run/tools?x=1`.
- [ ] **Old vercel.app host.** Run the first `curl` above. If it does not return 308, set the redirect in Settings → Domains instead. Do not remove the domain.
- [ ] **Google Search Console.** Add a Domain property for `splithappens.run` and verify it with a TXT record in Vercel DNS. Submit `sitemap.xml`. Request indexing for `/`, `/tools/pace-calculator`, `/tools/qualifying`, `/courses`, `/courses/boston`, `/stories/round-numbers` and `/slowdown`.
- [ ] **After two to three weeks.** Inspect `/slowdown`: Google's chosen canonical should be on `splithappens.run`. In the Pages report, "Alternate page with proper canonical" is expected for pack aliases. Look into any "Duplicate, Google chose different canonical".
- [ ] **Bing Webmaster Tools.** Import the site from Search Console, or add it and verify by DNS. Submit `https://splithappens.run/sitemap.xml`.
- [ ] **GitHub.** Set the repository's About → Website to `https://splithappens.run`.
