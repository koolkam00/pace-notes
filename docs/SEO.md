# Search and social metadata

How Pace Notes tells search engines and link previews what each page is. Written October 8, 2026.

## What is indexed, and why

The route policy lives in [`lib/seo-routes.ts`](../lib/seo-routes.ts). The sitemap, page metadata and the SEO checks all read it, so there is one list to change.

| Pages | Robots | Canonical | In the sitemap |
| --- | --- | --- | --- |
| Home, stories, tools, analyses, courses, about, methodology, privacy, slowdown, `/research/personalized` | index, follow | the page itself | yes |
| The search pages: the two pace charts, the five goal pages, the six qualifying race pages and `/finish-times` ([below](#search-pages-october-2026)) | index, follow | the page itself | yes |
| The 33 primary research questions under `/packs` | index, follow | the page itself | yes |
| 45 pack aliases (`ext_*`, most `s*`, `rn3`, `p1`, `p2`) | index, follow | the primary pack (`packCanonical(id)`) | no |
| `THIN_PACKS`: p3, p4, r16, r33, rn1, rn4 | noindex, follow | none | no |
| `NOINDEX`: `/runners`, `/your-race`, `/request-analysis`, `/htw`, `/packs/smyth_htw` | noindex, follow | none | no |
| 404 | noindex, follow (`app/not-found.tsx`; see the note below) | none | no |

`app/not-found.tsx` sets `robots: { index: false, follow: true }`, which replaces the layout's `index, follow`. Next.js adds its own `noindex` tag to the not-found page as well, so `out/404.html` carries two robots tags, `noindex` and `noindex, follow`, and they agree. The page is also served with a 404 status, so it is never indexed.

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
  - **Vercel previews point `og:image` at the preview host, by design.** Next.js 14.2 resolves a relative social image (every `og:image` and `twitter:image` here is a path such as `/og/tools/pace-band.png`) against the deployment's own URL (`VERCEL_BRANCH_URL`, else `VERCEL_URL`) whenever `VERCEL_ENV=preview`, ignoring `metadataBase` (`getSocialImageFallbackMetadataBase` in `next/dist/lib/metadata/resolvers/resolve-url.js`). This keeps previews from showing production images. Canonicals, `og:url`, the sitemap and JSON-LD use `absoluteUrl()` and stay on `https://splithappens.run`. Production builds (`VERCEL_ENV=production`) and local builds resolve images against `metadataBase`, so `https://splithappens.run`, which is what `verify-seo` checks. Do not "fix" a preview's image host; check production with `npm run verify:seo:live`.
  - Default Open Graph (`siteName` Pace Notes, `en_US`, `/og/default.png`), an X `summary_large_image` card and `robots: index, follow, max-image-preview:large`.
  - A fallback description that uses the build-time finish count.
  - Never put a canonical, `openGraph.url` or `title.template` here. Titles carry their own "| Pace Notes" suffix where it fits, so a template would double it.
- **[`lib/seo.tsx`](../lib/seo.tsx)** (server components only):
  - `pageMetadata({ title, description, path, type, noindex, canonicalPath, image, imageAlt, publishedTime, modifiedTime })` returns the title, description, absolute canonical, the full Open Graph block, the X card and robots. It throws if `path` contains `?` or `#`. A page-level `openGraph` replaces the layout's, so the helper always returns the whole object.
  - `finishesM()` gives the analysis cohort in millions ("3.4"), read from `analysis_n` in `public/data/insights/manifest.json`. Use it for every "N.N million" in a title or description, never a typed number.
  - `JsonLd` renders a JSON-LD block with `<` escaped. `breadcrumbs()` builds a BreadcrumbList.
- **[`lib/og-paths.ts`](../lib/og-paths.ts)** picks the social image for a page: its own card (a story, tool, goal page, qualifying race page, course or `/finish-times`), else the parent tool's card, else its section's card, else `/og/default.png`. It only returns files that exist in `public/`. See [Share cards](#share-cards-publicog).

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
  - The list comes from the same registries as the pages: `STORIES` (filtered by the data manifest), `TOOLS`, `TEN_ANALYSES` plus the ready weather analyses plus downhill-start, `getCourseNames()`, the primary packs, the fixed pages and `EXTRA_SITEMAP_PAGES` (the search pages). That is 115 URLs on October 8, 2026 (101 before the search pages).
  - `sitemapEntries()` throws if a path repeats, has a query or fragment, is noindex, or is not its own canonical.
  - **New content pages** register in their own module under [`lib/seo-pages/`](../lib/seo-pages/), which `EXTRA_SITEMAP_PAGES` in `lib/seo-routes.ts` collects (see [Search pages](#search-pages-october-2026)). A new entry in `TOOLS` is picked up automatically.
- **`lastmod` is honest.** It is the newest `as_of` date of the data the page shows (insights manifest, study, weather, personalized guide, fast-start, all-finisher, `pack_meta`, or `VERIFIED_AT` for qualifying and the qualifying race pages). Pages that are mostly written text use the hand-kept `CONTENT_DATES` map. When neither applies, `lastmod` is left out (`/privacy`, for example). The build never uses today's date or git dates. **When you change the visible text of a page in `CONTENT_DATES`, update its date.**
- Both routes use `dynamic = 'force-static'`, so they stay static files in the export.

## Search pages (October 2026)

Pages written for what runners search for, each static, indexable, its own canonical, in the sitemap, with a BreadcrumbList and its own share card. Numbers on them are computed at build time from the libraries and data named below; none is typed into the page.

| Page | Route | What it shows | Numbers | Sitemap module, `lastmod` |
| --- | --- | --- | --- | --- |
| `/tools/marathon-pace-chart` | `app/tools/marathon-pace-chart/page.tsx` | Pace per mile and per km for every goal in `MARATHON_CHART` (`lib/tools/pace-chart.ts`), the time at each 5 km mat and halfway, and mile markers | calculated at even pace, labelled as such | `lib/seo-pages/pace.ts`, the date the text was written (`PACE_CHARTS_WRITTEN`) |
| `/tools/half-marathon-pace-chart` | `app/tools/half-marathon-pace-chart/page.tsx` | The same for every goal in `HALF_CHART` | calculated | `lib/seo-pages/pace.ts`, `PACE_CHARTS_WRITTEN` |
| `/tools/marathon-pace/<goal>` (one per `GOAL_PAGE_MINUTES`: 3-00, 3-30, 4-00, 4-30, 5-00) | `app/tools/marathon-pace/[goal]/page.tsx` | Even-pace splits for the goal beside what finishes in the five minutes under it ran at each mat (the pace band's All-courses group), held pace against sustained slowdown, and finish-time bunching under the goal when the data shows it | calculated splits; Pace Notes data panels badged | `lib/seo-pages/pace.ts`, the later of the insights `as_of` date and 2026-10-08, when the pages were written (`GOAL_PAGES_WRITTEN`) |
| `/tools/qualifying/<race>` (one per `STANDARDS` key: boston, nyc, london, chicago, berlin, sydney) | `app/tools/qualifying/[race]/page.tsx`, `components/tools/QualifyingRace.tsx` | The race's official standards, window, age and application rules, what meeting a standard does not guarantee, Boston's published cut-offs, and even pace for each standard | official standards (dated `VERIFIED_AT`) and calculated even pace | `lib/seo-pages/qualifying.ts`, `VERIFIED_AT` |
| `/finish-times` | `app/finish-times/page.tsx`, `components/FinishTimeSummary.tsx` | Median finish (all, recorded women, recorded men), the minute-by-minute spread, observed shares under round times, percentiles and what the data covers | Pace Notes data (`lib/finish-times-summary.ts` reads `finish-times.json`, `courses.json` and the insights manifest) | `lib/seo-pages/finish-times.ts`, the later of the insights `as_of` date and 2026-10-08, when the page was written |

Five goal pages only, on purpose: one page per minute would be mass-produced near-duplicates. Internal links: the `/tools` index links both charts and the goal pages, the marathon chart links the goal pages, the qualifying checker and each race page link the race pages, and two pages link `/finish-times`: the round-numbers story (`/stories/round-numbers`, in its first section) and the finish-time-context analysis (`/analyses/finish-time-context`, in the aside after the analysis). No other analysis page links it.

**How a page registers.** A new search page needs four things, and the checks catch a missing one:
1. The route under `app/`, with `pageMetadata({ title, description, path })` (the canonical, Open Graph, X card and robots) and `JsonLd` breadcrumbs.
2. A module in [`lib/seo-pages/`](../lib/seo-pages/) that exports `ExtraPage[]` (`{ path, lastmod }`, typed in `lib/seo-pages/types.ts`), built from the route's own list (`GOAL_PAGE_MINUTES` with `goalPagePath`, `STANDARDS`), never a typed copy. `lastmod` is a `YYYY-MM-DD` string or a function such as `() => dataDate('insights')`; the function form lets the module import `dataDate` from `lib/seo-routes.ts`, which imports it back. Add the module to `EXTRA_SITEMAP_PAGES` in `lib/seo-routes.ts`. `sitemapEntries()` then lists the paths and throws on a repeat, an unclean path, a page that is noindex or not its own canonical, or a malformed date; `allSourceDates()` accepts the dates, so the `sitemap` check in `verify-seo` passes.
3. A share card: add the page to the card list in `scripts/build-og-images.cjs` (read from the same list), run `npm run og:images`, and commit the PNGs. Until then the page uses its parent's card and `verify-seo` warns (`og-image-fallback`).
4. Analytics: add the path to `searchPages` in [`lib/analytics-policy.ts`](../lib/analytics-policy.ts), from the route's own list where one is client-safe (`GOAL_PAGE_MINUTES` with `goalPagePath`, `STANDARDS`). Otherwise PostHog records the page as `/other`. `npm run verify:analytics` fails until it is there, because it checks that every sitemap page keeps its own path (see [ANALYTICS](ANALYTICS.md)).

**`verify-finish-times`.** [`scripts/verify-finish-times.cjs`](../scripts/verify-finish-times.cjs), the last step of `npm run verify:data`, checks every number `/finish-times` prints three ways: the helpers in `lib/finish-times-summary.ts` on small hand-made bins; an independent recount from `finish-times.json`, `courses.json` and the manifest, written without the helpers' code; and a rebuild of the story cohort from the checksum-verified runner shards in whole seconds, against which every printed figure must match exactly (about 400 MB, about 30 seconds; `--skip-records` skips this step). The goal pages' even-pace values and the goal list are checked by `scripts/verify-tools.cjs`.

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
| `/tools/<slug>` | `og/tools/<slug>.png` | "Runner tools" and the group, the heading or title (`lib/tools/registry.ts`) |
| `/tools/marathon-pace-chart`, `/tools/half-marathon-pace-chart` | `og/tools/<slug>.png` | "Runner tools · Pace charts", the page's heading |
| `/tools/marathon-pace/<goal>` | `og/tools/marathon-pace/<goal>.png` | "Runner tools · Marathon pace chart", "4:00 marathon pace" (one per `GOAL_PAGE_MINUTES` in `lib/tools/pace-chart.ts`) |
| `/tools/qualifying/<race>` | `og/tools/qualifying/<race>.png` | "Runner tools · Qualifying times", the race name and the page's noun: "Boston Marathon qualifying times", London's "Good For Age times" (one per `STANDARDS` in `lib/tools/qualifying.ts`; no race year) |
| any other page below `/tools/<slug>` | the parent tool's card | |
| `/courses/<slug>` | `og/courses/<slug>.png` | "Courses · Course profile", the race name, and the supplied route outline when there is one |
| `/finish-times` | `og/pages/finish-times.png` | "Finish times · Median and distribution", "Marathon finish times" (`PAGE_CARDS` in the script; any top-level page outside the sections can have a card in `og/pages/`) |
| `/stories`, `/tools`, `/courses` | `og/sections/<section>.png` | the section's own line |
| `/analyses` and every analysis page | `og/sections/analyses.png` | |
| `/packs` and every pack page | `og/sections/packs.png` (the research archive) | |
| everything else (home, about, methodology, slowdown, …) | `og/default.png` | |

If a page has no card yet, it falls back to the parent tool's card, then the section card, then the default, so a page never points at a missing file. `verify-seo` warns when a page uses a less specific card than the one the script makes for it: it reads the script's card list (`plannedCards()` in `scripts/build-og-images.cjs`, no browser needed), so a new goal page, race or story is expected to have its own card as soon as its list includes it. A goal time on a card ("4:00 marathon pace") is the page's name, not a data number.

**Rules for the cards:** words only (the brand, a section label, the title or race name, and "by Andrew Kam"); no data numbers, because they would go stale; no runner names; 1200×630; at most 120 KB each (63 cards, 32–81 KB, 3.2 MB in all on October 8, 2026). The race name follows the course page's rule: the supplied route's race name, else the course summary's, else the city plus " Marathon". "Washington Marathon" is shown as the data names it; if the owner renames that race, re-run the script.

**Making them.** [`scripts/build-og-images.cjs`](../scripts/build-og-images.cjs) renders the cards with Playwright and headless Chromium from an HTML template in the default card's design: Fraunces and Inter from `node_modules/@fontsource-variable` (the same stylesheets `app/layout.tsx` imports), the night background and accents from `app/globals.css` (the script stops if those tokens change), and each story's or tool's accent colour. It adds no project dependency: it loads `playwright` from `node_modules` if present, else `/opt/node-tools/node_modules/playwright`. Install it outside the project if you have neither (`npm i -g playwright && npx playwright install chromium`, then run with `NODE_PATH` set to the global modules folder).

```bash
npm run og:images                                  # render missing or changed cards; unchanged ones are skipped
node scripts/build-og-images.cjs --force           # render every card again
node scripts/build-og-images.cjs --only courses/   # only cards whose file name contains the text
npm run og:check                                   # no browser: report missing, changed, oversized or orphaned cards
```

Re-run it, and commit the PNGs, when you add or rename a story, tool, goal page, qualifying race or course, change a title, kicker, tool heading, race name or accent, or change the card design. Delete the cards it reports as orphans. Then run `npm run build` so the pages pick up the new files.

The card list comes from the registries in a fixed order (stories, tools, the pace charts, `GOAL_PAGE_MINUTES`, `STANDARDS`, courses, pages, sections), so runs are repeatable. Cards below a tool sit in a folder named after it (`og/tools/qualifying/boston.png`); `og:check` scans those folders for orphans too. Each PNG carries a `tEXt` chunk (`pace-notes-og`) with a hash of its HTML (text, layout, colours and the font package versions); that is how the script skips unchanged cards and how `og:check` spots stale ones without a browser. Pixels are identical between runs on the same machine; another Chromium or font build may anti-alias slightly differently, which only shows up as a binary change.

## Automated checks: `verify-seo`

[`scripts/verify-seo.cjs`](../scripts/verify-seo.cjs) reads the static export and fails if any page breaks the rules on this page. It loads `lib/seo-routes.ts` (and `finishesM()` from `lib/seo.tsx`) with the same TypeScript require hook as `scripts/verify-units.cjs`, so it checks the build against the same policy the pages were built from. It has no dependencies and takes a few seconds.

```bash
npm run build && npm run verify:seo
node scripts/verify-seo.cjs --out <folder>    # another export folder
node scripts/verify-seo.cjs --all             # list every page in a failed group, not just the first 25
node scripts/verify-seo.cjs --self-test       # only the built-in fixtures; no export needed
```

Every run starts with a self-test: the banned-words patterns against fixture phrases ("your personal chance", "your own personal chances", and phrases they must not catch, such as "your race. Chance …") and a small fixture page, parsed by the same code as the export, that must hit "your chance" in its description, `og:title`, visible text and alt text. If a fixture fails, the script stops before reading the export.

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
| `banned-words` | "the wall", "arithmetic" or "your chance" (any form: "your chances", or up to two words between, as in "your personal chance") is in visible text, alt, title or aria-label text, metadata or JSON-LD |
| `fastest` | "fastest" is in a title, description, `<h1>` or og/X tag (body text may use it) |
| `runner-counts` | a title or description says "million runners" or "N runners" (counts are finishes) |
| `personal-data` | `q=` is in a canonical, `og:url`, the sitemap or JSON-LD, or `/runners` is not noindex |
| `units-links` | an internal `href` in the static HTML carries `units=mi`, the default unit |
| `old-host` | `htw-live-study.vercel.app` is in any `<head>` (or in JSON-LD) |
| `finish-counts` | an "N.N million" or "N.NM" in a title or description is not `finishesM()` |

Warnings only: titles over 60 characters, descriptions over 155 (the site's limits), `og-image-fallback` (a page that uses a less specific card than the one `scripts/build-og-images.cjs` makes for it: a stale build or a missing card), and policy notes (noindex pages that also say nofollow, JSON-LD on pages the plan keeps without it, `changefreq` or `priority` in the sitemap).

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
| `/tools/marathon-pace` | 308 to `/tools/marathon-pace-chart` (the goal pages sit below this path, which has no page of its own) |
| Every path | `Referrer-Policy: strict-origin`, the same policy as the `<meta name="referrer">` tag from `app/layout.tsx`, so the requests a page makes before that tag is parsed also send only the origin |
| Every `.txt` path except `/robots.txt` | `X-Robots-Tag: noindex` (the React Server Components payloads the export writes beside each page, such as `out/tools.txt`, which the client fetches on in-app navigation) |
| `/data/*` | `X-Robots-Tag: noindex` (files stay downloadable and fetchable) |
| `/runners` with a `q` query | `X-Robots-Tag: noindex, nofollow` (old links that carry a name) |
| `trailingSlash: false` | `/tools/` goes to `/tools` in one hop, as before |

The pacing-analysis workflow reads `https://splithappens.run/data/live.json` directly. It uses `curl --fail` without `-L`, so it must never point at the old host.

### What a preview deployment cannot test

- **The host redirect.** Preview URLs have a different host, so the rule never fires there. Previews also already send `x-robots-tag: noindex`, so check that the `/data` and `/runners?q=` headers are present, not their value.
- **Whether a redirect beats an existing static file** (`out/htw.html`) and **whether query strings survive the host 308.** Neither is verified yet; check both in production.
- **The production `og:image` host.** On a preview, `og:image` and `twitter:image` name the preview host (`VERCEL_ENV=preview`; see [Where metadata comes from](#where-metadata-comes-from)). Only a production deploy shows `https://splithappens.run/og/…`.

Right after each production deploy (keep Vercel Instant Rollback ready), run `npm run verify:seo:live` ([above](#after-a-deploy-verify-seo-live)). It makes these requests and more; the same checks by hand:

```bash
curl -sI 'https://htw-live-study.vercel.app/slowdown?a=1'   # 308, location https://splithappens.run/slowdown?a=1
curl -sI 'https://splithappens.run/htw'                      # 308, location /slowdown
curl -sI 'https://splithappens.run/packs/smyth_htw'          # 308, location /slowdown
curl -sI 'https://splithappens.run/data/insights/manifest.json' | grep -i x-robots-tag   # noindex
curl -sI 'https://splithappens.run/runners?q=x' | grep -i x-robots-tag                   # noindex, nofollow
curl -sI 'https://splithappens.run/tools/'                   # 308 to /tools in one hop
curl -sI 'https://splithappens.run/tools/marathon-pace'      # 308, location /tools/marathon-pace-chart
curl -sI 'https://splithappens.run/tools.txt' | grep -i -e x-robots-tag -e referrer-policy   # noindex; strict-origin
curl -s  'https://splithappens.run/robots.txt'               # the rules above and the Sitemap line
curl -s  'https://splithappens.run/sitemap.xml' | grep -c '<loc>'
curl -sf 'https://splithappens.run/data/live.json' | python3 -m json.tool > /dev/null && echo live.json ok
```

## Owner checklist (outside the repo, after the deploy)

- [ ] **Right after the production deploy.** Run `npm run verify:seo:live` ([above](#after-a-deploy-verify-seo-live)); every check should PASS once the www redirect below is 308. Keep Vercel Instant Rollback ready.
- [ ] **Vercel www redirect.** Project → Settings → Domains. Set `www.splithappens.run` to "Redirect to splithappens.run" with **308 Permanent** (add it if it is not listed). Today it answers 307. Check: `curl -sI 'https://www.splithappens.run/tools?x=1'` returns 308 to `https://splithappens.run/tools?x=1`.
- [ ] **Old vercel.app host.** Run the first `curl` above. If it does not return 308, set the redirect in Settings → Domains instead. Do not remove the domain.
- [ ] **Google Search Console.** Add a Domain property for `splithappens.run` and verify it with a TXT record in Vercel DNS. Submit `sitemap.xml`. Request indexing for `/`, `/tools/pace-calculator`, `/tools/qualifying`, `/tools/marathon-pace-chart`, `/finish-times`, `/courses`, `/courses/boston`, `/stories/round-numbers` and `/slowdown`.
- [ ] **After two to three weeks.** Inspect `/slowdown`: Google's chosen canonical should be on `splithappens.run`. In the Pages report, "Alternate page with proper canonical" is expected for pack aliases. Look into any "Duplicate, Google chose different canonical".
- [ ] **Bing Webmaster Tools.** Import the site from Search Console, or add it and verify by DNS. Submit `https://splithappens.run/sitemap.xml`.
- [ ] **GitHub.** Set the repository's About → Website to `https://splithappens.run`.

### Known minor items (left as they are)

- **Pack pages put `h3` chart titles straight after the `h1`.** The charts inside a research question use `h3` titles with no `h2` between (`/packs/r32_where_pbs_are_gained` goes h1, h3, h3). Pre-existing; a heading-order nit that accessibility checkers flag, not an indexing problem.
- **The host redirect's value is unescaped on purpose.** The old-host rule in `vercel.json` matches `htw-live-study.vercel.app` with its dots unescaped. As a regular expression an unescaped dot also matches a dot, so the rule works whether Vercel reads the value as a literal host or as a pattern; escaping it would only be right under one of the two readings.

### Decisions still open for the owner

- **"Washington Marathon".** The course data (`course-geometry.json`, `courses.json`) names the race "Washington Marathon", and the course page, its title and its share card show that name. It may really be the Marine Corps Marathon. Only the owner can confirm; if it is renamed in the data, rebuild and re-run `npm run og:images`.
- **A licence for the Dataset JSON-LD.** `/methodology` describes the story summaries as a schema.org `Dataset` without a `license`, because the repository states none. Google Dataset Search recommends one. Choose a licence first; then add it to the repository and to `storyDataset()` in `app/methodology/page.tsx`.
- **Search Console and Bing verification.** The Domain property, the TXT record and the sitemap submissions above are owner steps; nothing in the repository can do them.
