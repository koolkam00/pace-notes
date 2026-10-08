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
- **[`lib/og-paths.ts`](../lib/og-paths.ts)** picks the social image for a page. Today every page uses `/og/default.png`.

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
- `public/og/default.png` is the 1200×630 share card: the brand mark, "Pace Notes", a tagline and the credit. It has no numbers (they would go stale) and no runner names. It was rendered with Playwright from an HTML card using the site's fonts and colour tokens. If you replace it, keep it 1200×630 and under 150 KB.

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

Right after each production deploy (keep Vercel Instant Rollback ready):

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
