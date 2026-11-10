> **Copy of a reviewer's report.** This file is the SEO and answer-engine reviewer's report on https://splithappens.run, written on November 9, 2026 against commit `068b6c370`. It is a reviewer's claim, not a measured record of this repository: its claims were not all tested, and [REVIEW.md](REVIEW.md) says which were and what the second read found. Where the report says "verified", that is the reviewer's word for its own tests.
>
> Paths beginning `/home/user/pace-notes-review/` mean this repository at that commit. Paths under `/tmp/` were the review's working folder (screenshots, crawl output, scripts); it is not kept.
>
> The copy was made by a script and was not retyped (1,229 lines, 124,103 bytes in the source). The script strips trailing spaces, shortens the working folder's path to `/tmp/scratchpad` (2 places), and writes a Markdown link whose target does not resolve from this folder as a code span with a space between its two parts (none in this file). One sentence about the reviewer's own tools is not copied; a note in brackets marks the place.

---

# Pace Notes (splithappens.run): SEO and AEO audit

Date: 2026-11-09. Auditor: an independent review agent. Production commit: `068b6c3700f7201b78d13698c1838c515b21a32c` (`https://splithappens.run/version.json` read at 20:40 UTC: `"ref": "main"`, `"builtAt": "2026-11-05T20:24:05.684Z"`).

## Summary

This report holds 28 findings (4 P0, 14 P1, 10 P2), ten page proposals, a list of what is already good and a list of what I did not check.

The technical base is sound: all 182 sitemap URLs answer 200 with a self-canonical, one title, one description and one H1, and no two pages share any of them. Nothing found blocks indexing. The four P0 items are small defects where the site says something that is not true of what it serves. The larger opportunity is in the P1 list:

- 100 of the 182 sitemap URLs are chart pages that sit three clicks deep, share one share image and reuse their takeaway as the description.
- Three pages do not carry in their served text what their metadata or tabs promise: `/finish-times` never shows the phrase "average marathon time", `/slowdown` never shows the 30.8% its description quotes, and `/analyses/race-day-weather` serves one of its three findings.
- The pages built for search demand (pace charts, goal pages, qualifying pages) have one or two inbound links each.
- For answer engines, the site has no entity links (`sameAs`), no licence, DOI or citation line on its Dataset, and one question-shaped heading in 513.

Whether Google or Bing has indexed the site could not be checked; Search Console and Bing Webmaster are still open owner items and remain the first step.

## How to read this report

Paths are relative to the frozen checkout `R=/home/user/pace-notes-review` unless they start with `/`. Evidence commands use:

```
D=/tmp/scratchpad/review/seo
R=/home/user/pace-notes-review
```

Every finding carries two labels.

- **Status** is "verified by me" with the method (a curl command against production, a count from the saved crawl, or a file line I read), or "inferred" where I reasoned from evidence and did not observe the thing itself.
- **Fix type** is "safe mechanical code change" (the file and the change are named) or "owner decision". Changes to what a visitor sees are marked "owner decision (design)".

Effort is S (under an hour), M (half a day) or L (more).

## Scope, method and limits

- Crawl: every URL in `https://splithappens.run/sitemap.xml` (182) fetched with curl on 2026-11-09 from 19:33:05 to 19:33:25 UTC, at most 4 requests at a time, and parsed into `crawl.tsv` (182 rows, 45 columns), which sits beside this report. The body, response headers and curl error file of each page are in `$D/raw/pages/`.
- Follow-up requests to the two hosts ran until 21:45 UTC the same day: hosts, redirects and special files (19:38 to 19:39); links outside the sitemap, assets and query-string pages (19:54 to 20:00); the response headers of both hosts (20:08); one share card (20:22); `version.json` (20:40); the user-agent test (21:28); the 404 check (21:36); three HEAD requests (21:45). Nothing was requested after that. Every count in this report that is not shown under a curl command comes from those saved files.
- Seven steps: crawl; hosts, redirects, errors and headers; structured data; answer-engine readiness; internal links; page weight; search demand, with 10 web searches.
- No browser was used and no JavaScript ran. "Server-rendered" and "served HTML" mean the text is in the HTML outside `<script>` tags. The pages inline their React payload in script tags (a median of 67% of the HTML across the 182 pages, from 40% to 94%: `node $D/scripts/script-share.cjs $D/raw/pages/*.html`), so text that exists only there is invisible to crawlers that do not run JavaScript.
- I ran no build and no verifier, and edited no file in either checkout. Every code proposal is untested; the lead runs `npm run verify:data`, `npm run build` and the image build.
- Hosts contacted: splithappens.run, htw-live-study.vercel.app, and web search. The web search tool is neither Google nor Bing, so rankings quoted from it are indicative only.
- Recommendations respect the standing rules in `AGENTS.md`: rule 15 (methods and coverage only on `/methodology`), rule 17 (banned words, no release tags or dates in copy), rule 13 (numbers from data files, a reading only under its guard), rule 12 (no inference), rule 14 and rule 16. Where a common SEO tactic would break one, the finding says so and gives a compliant form.

## Index of findings

| Id | Finding | Most telling number | Fix type |
| --- | --- | --- | --- |
| P0-1 | Old host's root serves a copy of the home page instead of redirecting | 200, not 308; same 90,373 bytes | mechanical |
| P0-2 | Analyses share card says "the essential ten"; the hub lists 11 | on 12 pages | mechanical |
| P0-3 | Dataset markup lists `courses.json` twice | 8 entries, 7 files | mechanical |
| P0-4 | Course titles promise elevation the page does not show | 26 promise, 9 draw a profile, 2 show nothing | mechanical, with one wording choice |
| P1-1 | Charts section is deep, thin and undifferentiated | 100 pages at depth 3; 0 own descriptions | mixed |
| P1-2 | Race-day weather: the warming and wind findings only in the script payload | 0 of 4 sentences in served HTML | owner decision (design); one line of code |
| P1-3 | `/finish-times` never shows "average marathon time" | 0 times in visible text | owner decision (design) |
| P1-4 | `/slowdown` description promises 30.8%; the page shows "About 3 in 10" | 139 words in main | mechanical, small copy |
| P1-5 | Search-target tool pages have almost no inbound links | 1 inbound page for each qualifying race page | mechanical |
| P1-6 | Article markup: headline is not the H1; analyses have none | 8 of 9 stories differ | mechanical |
| P1-7 | No entity links for the site or its author | 0 `sameAs`, 0 profile links | owner decision |
| P1-8 | Dataset has no licence, identifier or citation; no "how to cite" | 3 recommended fields absent | owner decision |
| P1-9 | Headings are not question-shaped | 1 question in 513 headings | owner decision (design); a mechanical form exists |
| P1-10 | AI crawlers are allowed (keep); the choice is recorded nowhere and Bing is not set up | 9 user agents, each 200; 1 robots group | owner steps; one mechanical check fix |
| P1-11 | No `llms.txt` | 404 | owner decision (optional) |
| P1-12 | Page dates that machines can read, outside the sitemap | 10 of 182 pages (9 stories and `/methodology`) | mechanical, part of P1-4 and P1-6 |
| P1-13 | `/half` title lacks "average half marathon time" | 0 pages contain "average half" | mechanical, one string; the wording is the owner's |
| P1-14 | Only five goal pages | 5 pages; 4 more goals pass both data checks | owner decision |
| P2-1 | `/methodology` is long, and its limits and licence come last | 39,758 words; Limits start at 94%, Downloads at 97% | owner decision (design) |
| P2-2 | Breadcrumb markup and the visible crumb name different parents | 23 pages; 2 hubs with 1 inbound page | owner decision (design) |
| P2-3 | Two descriptions over the verifier's limit; one number not in its page's served text | 169 characters, limit 155 | mechanical, small copy |
| P2-4 | Fonts are revalidated on every page view | `max-age=0` on 2 preloaded fonts | mechanical |
| P2-5 | No page embeds an image | 0 `<img>` on 182 pages | owner decision (design) |
| P2-6 | `docs/SEO.md` contradicts the code on `/privacy` and is silent on answer engines | 0 lines on AI crawlers | mechanical (documentation) |
| P2-7 | Special files and the 404 page | nothing broken | no change |
| P2-8 | Response headers | 4 hardening headers absent | optional, not an SEO matter |
| P2-9 | Search words the site never uses | "negative split" on 1 page | owner decision (wording) |
| P2-10 | Small notes | 6 notes; note 6 is a stale line in `analysis/ACCESS.md` | mixed |

"Mechanical" in this table is short for "safe mechanical code change"; each finding's last line gives the exact split. After the findings come four sections: "Page proposals" (ten, with what was considered and not proposed), "Already good, keep", "What I did not check" and "Appendix: files and commands".


## P0: broken or untrue (all small)

### P0-1 The old host's root serves a copy of the home page instead of redirecting

**What.** `https://htw-live-study.vercel.app/` answers 200 with the same bytes as `https://splithappens.run/`. Every other path I tried on that host redirects. `docs/SEO.md:261` says any path on the host answers 308, and the owner checklist marks it done (`docs/SEO.md:305`).

**Evidence (production, 2026-11-09 20:08, 20:21 and 20:40 UTC, identical each time).**

```
curl -sS -o /dev/null -D - https://htw-live-study.vercel.app/
  HTTP/2 200   etag: "770365a6b2e1393657d4a9d6a2a9e505"   content-length: 90373
curl -sS -o /dev/null -D - https://splithappens.run/
  HTTP/2 200   etag: "770365a6b2e1393657d4a9d6a2a9e505"   content-length: 90373
curl -sS -o /dev/null -D - https://htw-live-study.vercel.app/tools
  HTTP/2 308   location: https://splithappens.run/tools
```

`https://htw-live-study.vercel.app` (no slash) and `/?x=1` also answer 200 with 90,373 bytes. The copy's canonical is `<link rel="canonical" href="https://splithappens.run"/>`. Saved output: `$D/raw/step7/oldhost-root.headers`, `$D/raw/step7/apex-root.headers`, `$D/raw/step2/oldhost-root.txt`.

**Why the check passes.** `scripts/verify-seo-live.cjs:80` tests only `https://htw-live-study.vercel.app/slowdown?a=1`. The root is never tested.

**Cause (inferred).** The rule at `vercel.json:5-10` uses `"source": "/:path*"`, which does not appear to match `/` on Vercel. A Vercel Community post describes the same behaviour and recommends pairing it with a `"source": "/"` rule (https://community.vercel.com/t/docs-vercel-json-redirects-path-does-not-match-root/50541). I found no official documentation that settles it.

**Why it matters.** The root is the URL old links and bookmarks point at. The canonical tag keeps the harm small, but a canonical is a hint and a 308 is not, and the contract document says the redirect exists.

**Proposed change.**

1. `vercel.json`, insert before line 5:
   ```json
   {
     "source": "/",
     "has": [{ "type": "host", "value": "htw-live-study.vercel.app" }],
     "destination": "https://splithappens.run/",
     "permanent": true
   },
   ```
2. `scripts/verify-seo-live.cjs`, add after line 80 (and a matching `skip` after line 83):
   ```js
   await check('htw-live-study.vercel.app: the root answers 308 to the apex', () => expectRedirect('https://htw-live-study.vercel.app/', 'https://splithappens.run/'));
   ```
3. `docs/SEO.md:305`: reopen the item until the live check with the new line passes.

An alternative source pattern is `"/(.*)"` with destination `https://splithappens.run/$1`: the header rule at `vercel.json:24` uses that pattern and its `referrer-policy` header is present on the old root's 200 response, so the pattern does match `/` on this deployment. If neither works, the domain-level redirect in Vercel's Settings, Domains is the fallback the checklist already names (whether a `.vercel.app` domain can be redirected there is unverified).

**Effort / risk.** S. Low: the static `redirects` check and `movedChecks()` skip rules that carry `has`. It can only be proven after a deploy.

**Status.** The 200 and the identical body: verified by me (curl, three times). The cause: inferred. **Fix type.** Safe mechanical code change.

### P0-2 The analyses share card says "the essential ten"; the hub lists 11

**What.** `/og/sections/analyses.png` reads "ANALYSES · THE ESSENTIAL TEN / Marathon pacing questions, answered with recorded splits. / by Andrew Kam". It is the share image of 12 pages: the hub and the 11 analyses. The hub's title and `og:image:alt` say "Marathon Pacing: 11 Analyses".

**Evidence.**

```
grep -n "essential" $R/scripts/build-og-images.cjs
  88:  { name: 'analyses', eyebrow: 'Analyses · the essential ten', title: 'Marathon pacing questions, *answered with recorded splits.*', accent: TOKENS.green },
curl -sS https://splithappens.run/og/sections/analyses.png | sha256sum
sha256sum $R/public/og/sections/analyses.png
  both f4e265280517f668b651931a76fb2232c8d3edce5367cb36debd31bf08ef9c12
node $D/scripts/recount.cjs $D/crawl.tsv | grep "share images"
  ... "/og/sections/analyses.png x12" ...
```

I opened the live PNG to read it (`$D/raw/final/analyses-card-live.png`). The hub's count is computed (`app/analyses/page.tsx:10`: `` `Marathon Pacing: ${listed} Analyses | Pace Notes` ``), the card's is typed. The `hub-counts` check reads the hub pages and never the cards, so nothing catches this.

**Why it matters.** Instagram is a third of the traffic, and this card is what a shared analysis link shows. It contradicts the page it previews.

**Proposed change.** `scripts/build-og-images.cjs:88`: `eyebrow: 'Analyses'`. A card should carry no typed count. Then `npm run og:images` (`package.json:29`), open the PNG, and `npm run og:check`. While there: `app/layout.tsx:22`, the default description, says "ten essential runner questions". No served page uses it (0 of 182 crawled pages and 5 probe pages), but it is the same typed count; replace "ten essential runner questions" with "the essential runner questions".

**Effort / risk.** S. None beyond regenerating one image.

**Status.** Verified by me (hash of the live file, the PNG opened, the source line). **Fix type.** Safe mechanical code change.

### P0-3 The Dataset markup lists `courses.json` twice

**What.** The one `Dataset` node on the site, on `/methodology`, has 8 `distribution` entries for 7 files, and its description repeats a clause: "…course pacing profiles, with race-morning weather as context, and course pacing profiles, with race-morning weather as context."

**Evidence.**

```
curl -sS https://splithappens.run/methodology | node $D/scripts/dataset.cjs /dev/stdin
  distribution entries: 8 -> archetypes.json, finish-times.json, replay.json, positions.json, kick.json, demographics.json, courses.json, courses.json
  distinct files: 7
  repeated: courses.json
  description clauses repeated: ["course pacing profiles"]
```

(The same from the saved page: `node $D/scripts/dataset.cjs $D/raw/pages/splithappens.run_methodology.html`.)

**Cause.** `app/methodology/page.tsx:40` maps published stories to their file without removing repeats, and two stories read `courses.json`. The visible downloads list already does it right (`components/methods/MethodsDownloads.tsx:62`).

**Why it matters.** This node is the machine-readable statement of what the data is, and the description is the text a dataset search result or an answer engine would quote.

**Proposed change.** `app/methodology/page.tsx:40`:

```ts
const files = [...new Set(STORIES.filter((s) => s.source !== 'half' && storyPublished(s) && STORY_FILE_TOPICS[s.file]).map((s) => s.file))];
```

**Effort / risk.** S. None; `topics` and `distribution` both derive from `files`.

**Status.** Verified by me (parsed from the live page). **Fix type.** Safe mechanical code change.

### P0-4 Course titles and descriptions promise elevation that the page does not show

**What.** 26 of 27 course pages have "Elevation" in the title and "elevation profile" in the description. 9 draw a profile. 15 print only a total climb. 2 (New York and Dubai) print nothing about elevation at all. The `/courses` hub's title says "Elevation for 26" while 24 rows print a climb.

**Evidence.**

```
node $D/scripts/course-promises.cjs $D
  {"pages":27,"promiseElev":26,"profile":9,"climbOnly":15,"nothing":2,"promiseWeather":15,"weatherSection":4,"weatherTempOnly":11,"weatherNone":0}
  climbOnly: amsterdam, berlin, chicago, copenhagen, frankfurt, eindhoven, gold-coast, hamburg, helsinki, london, prague, rotterdam, stockholm, valencia, warsaw
  nothing: dubai, new-york
```

- `/courses/new-york`: title "New York City Marathon: Elevation, Pacing and Finish Times"; description "New York City Marathon elevation profile, finish times by year and how 843,852 recorded finishes paced each 5 km across 18 editions (2006–2026)."; the words climb, elevation, descent and hill each occur 0 times in `<main>` (`node $D/scripts/in-main.cjs $D /courses/new-york climb elevation descent hill`).
- `/courses/berlin`: the only elevation text is "240 ft of climbing" and "Climb, whole route 240 ft".
- Profile drawn (an element with `id="elevation"`): auckland, austin, barcelona, boston, madrid, oslo, paris, singapore, sydney.

**Cause.** The title and description ask "is there a route file" (`app/courses/[city]/page.tsx:25-26` pass `!!page.geometry`). The page asks a narrower question before it draws: `elevationShown()` at `components/course/CourseElevation.tsx:25-28` also needs the profile not to read water under a bridge and the climb guard to pass. The hub counts the same way (`app/courses/page.tsx:23`: `pages.filter((p) => p.geometry).length`).

**Why it matters.** "New York City Marathon elevation" is plausibly the most searched course query on the site, and the page that claims it has nothing to show. A description is also the text an answer engine attributes to the page.

**Proposed change.**

1. `app/courses/[city]/page.tsx:25`: `title: courseTitle(page.race, !!page.geometry && !profileUnderWater(page))`. New York and Dubai take the existing no-route title, "… Pacing and Finish Times by Year". The other 24 keep "Elevation", which a printed climb supports. The page needs `import { profileUnderWater } from '@/lib/nuggets/courses';` (the hub already has it at `app/courses/page.tsx:16`); `elevationShown` is already imported at line 2.
2. `app/courses/[city]/page.tsx:26`: pass `elevationShown(page)` so only the 9 pages with a profile say "elevation profile". For the 15 climb-only pages the existing fallback wording is true but drops the word. A middle wording keeps it, for example `${race} elevation gain, finish times by year and how …` in `lib/course-page.ts:82`. That wording is the owner's choice.
3. `app/courses/page.tsx:23`: `const drawn = pages.filter((p) => p.geometry && !profileUnderWater(p)).length;` which gives 24, matching the rows. The description at line 26 says "with route and elevation for N"; routes exist for 26, so drop "route and" or count the two separately.
4. Same change: update the pinned strings in `scripts/verify-courses.cjs:146-151` and `docs/SEO.md:91-92`.

The weather promise is fine: all 15 pages whose description says "with race-morning weather" show weather (4 in a `#weather` section, 11 as temperatures elsewhere).

**Effort / risk.** S. Titles change on 2 pages and descriptions on up to 17, so their sitemap dates should move to the merge day (`COURSE_PAGES_WRITTEN`, `lib/seo-routes.ts:173`).

**Status.** Verified by me (counted in the saved crawl; code lines read). **Fix type.** Safe mechanical code change for items 1, 3 and 4 and the `elevationShown` switch; the middle wording is an owner decision.

## P1: high value

### P1-1 The charts section is deep, thin and undifferentiated, and it is 100 of the 182 URLs

**What.** The 100 chart pages are 55% of the sitemap. Each one:

- sits three clicks from the home page and is linked only from inside the charts section. The hub `/charts` has one inbound link from outside the section, on `/research`;
- never uses the word "marathon": 0 of 100 in the title, the description, the H1 or the visible text of `<main>`;
- has no description of its own. All 100 reuse the takeaway sentence (median 113 characters, 26 under 100, shortest 59);
- shares one share image with the hub (`/og/sections/charts.png` on 101 pages);
- has a median of 129 words in `<main>`;
- links out only to the hub, the previous and next chart, its PNG and `/methodology#top-charts`.

The hub is one flat list of 100 links with no theme headings and no `ItemList` markup.

**Evidence** (outputs abridged to the lines that matter).

```
node $D/scripts/depth.cjs $D /charts /charts/1
  pages by depth {"0":1,"1":19,"2":56,"3":106}     depth 3 by section {"/tools/*":6,"/charts/N":100}
  /charts depth 2     /charts/1 depth 3
node $D/scripts/inbound-of.cjs $D /charts '^/charts/[0-9]+$'
  /charts: 101 source pages {"/charts":100,"/research":1}
  /charts/N: each linked from 2 to 3 pages (median 3), all of them in the charts section
node $D/scripts/chart-words.cjs $D marathon
  "marathon": title 0 | description 0 | h1 0 | visible text of <main> 0 | any of the four 0
node $D/scripts/recount.cjs $D/crawl.tsv
  chart description_len min 59, median 113, max 140; under 120: 59
  chart words_main min 95, median 129, max 543
  share images: "/og/sections/charts.png x101"
grep -c "description:" $R/lib/charts/text/*.ts
  0 in each of the 14 files
```

Two examples from `crawl.tsv`:

- `/charts/22`: title "Only 1 in 20 finishes came in under 3:00 | Pace Notes"; description (59 characters) "Under 3:00 held 5% of finishes; 3:00–4:00 held another 37%."; 95 words.
- `/charts/16`: description (63 characters) "45% of all finishes landed in a single hour, from 3:28 to 4:28."

Code:

- `lib/charts/registry.ts:50` uses the takeaway when a chart defines no description: `description: text.description ? typo(text.description(file.values)) : plain`. The optional field exists (`lib/charts/types.ts:49`); no chart uses it.
- `app/charts/page.tsx:18` emits breadcrumbs only; lines 23 to 36 are one `<ol className="charts-list">`.
- `components/charts/ChartPage.tsx:37-46` holds every link a chart page has.
- `lib/og-paths.ts:27`: `PAGE_CARD_SECTIONS = new Set(['stories', 'tools', 'courses'])`, so charts fall to the section card.
- The chart PNGs (`public/charts/cards/1.png`) are 1080 by 1350, portrait, so they cannot serve as share images as they are.

**Why it matters.** More than half of what the sitemap offers a search engine is this section, and it is the weakest part of the site. A result that reads "Only 1 in 20 finishes came in under 3:00" does not say which sport it is about. Pages three clicks deep with no links from the rest of the site receive the least internal weight. A large share of short, similar pages can also hold down how a new site is assessed as a whole (inferred; index status could not be checked). For answer engines a chart page is close to an ideal unit (one finding, one number, one table) once it names its subject. On Instagram, 100 different findings all preview as the same card.

**Proposed change**, most value for the effort first.

1. **Name the subject (S).** `components/charts/ChartPage.tsx:37` and `app/charts/[n]/page.tsx:27`: change the crumb text `Top 100 charts` to `Top 100 marathon charts`. That puts the word in the visible text and in the breadcrumb markup of all 100 pages. Safe mechanical code change (three visible words).
2. **Give each chart its own description (M to L).** Add `description(v)` to the chart words in `lib/charts/text/*.ts`, built from the chart's values, naming the marathon and adding a second fact from the values table. For chart 22 the form would be "Under 3:00 held 5% of marathon finishes; 3:00–4:00 held another 37%. …" with the numbers taken from `v`, never typed. The existing checks bind it: at most 155 characters, unique, no banned word, no release label (`scripts/verify-charts.cjs:141-149`). A fallback must state no reading (rule 13), so a description function needs the same guard as its takeaway. Mechanical once the wording pattern is agreed; the wording is the owner's.
   An interim that needs no wording: in `lib/charts/registry.ts:50`, append a neutral sentence such as ` Marathon chart ${item.number}.` when the result still fits 155 characters. A 19-character suffix fits 95 of the 100 current descriptions; a 28-character one fits 74 (computed from `description_len` in `crawl.tsv`).
3. **`ItemList` on the hub (S).** `app/charts/page.tsx:18`: emit an `ItemList` of the 100 chart URLs beside the breadcrumbs, as `app/courses/page.tsx:99-102` does for courses. `ItemList` is not a restricted type in `scripts/verify-seo.cjs:461-504`, and the URLs carry no `#` or `?`. Safe mechanical code change.
4. **Links in from the rest of the site (M).** A theme-to-page map in `lib/charts/` (for example `finish-times` to `/finish-times`, `courses` to `/courses`, `pacing` and `racing` to their chapter pages), used both ways: each chart page links to its theme's page from `components/charts/ChartPage.tsx`, and those pages, the home page and the chapter pages link to `/charts` or to a few charts of their theme. No such map exists today, so the mapping itself is an owner decision; the code is mechanical after it. A `/charts` link in the footer or the navigation is also an owner decision (design): `components/SiteFooter.tsx:16-19` keeps four links by a layout rule that scenarios pin.
5. **A share card per chart (M).** A 1200 by 630 chart card type in `scripts/build-og-images.cjs` (beside `SECTION_CARDS`, lines 84 to 91) and `'charts'` added to `PAGE_CARD_SECTIONS` at `lib/og-paths.ts:27`. Then `npm run og:images` and open the PNGs.
6. **Theme headings on the hub.** Owner decision (design). Themes alternate in number order in `lib/charts/catalog.json`, so headings mean regrouping the list.

**Effort / risk.** Items 1 and 3: S, low. Items 2, 4 and 5: M each. Any change to visible chart text moves those pages' sitemap dates.

**Status.** Verified by me (counts from the saved crawl with the commands above; the code lines read). The effect on how search engines assess the site: inferred. **Fix type.** Items 1 and 3: safe mechanical code change. Items 2, 4 and 5: mechanical after an owner choice of wording, mapping and card design. Item 6: owner decision (design).

### P1-2 Race-day weather: the warming and wind findings are not in the served HTML

**What.** `/analyses/race-day-weather` holds three answers behind three tabs: start temperature, warming and wind. The old warming and wind URLs redirect to it (`vercel.json:19-20`:`/analyses/warming-and-pacing` to `/analyses/race-day-weather#warming`, `/analyses/wind-and-pacing` to `…#wind`). The three panels are in the served HTML (two carry `hidden`). The H1 and the sentence under it are not: the server renders only the first tab's, and the warming and wind findings exist only inside the script payload. The page's title and description are about start temperature alone.

**Evidence.**

```
node $D/scripts/outside-script.cjs $D/raw/pages/splithappens.run_analyses_race-day-weather.html "On a morning that warmed" "wind at the start instead of" "Races that warmed" "Stronger wind at the start went" "41–50°F starts had the fewest"
  "On a morning that warmed"           whole=2  outside-script=0     (the warming tab's H1)
  "wind at the start instead of"       whole=2  outside-script=0     (the wind tab's H1)
  "Races that warmed"                  whole=1  outside-script=0     (the sentence under the warming H1)
  "Stronger wind at the start went"    whole=1  outside-script=0     (the sentence under the wind H1)
  "41–50°F starts had the fewest"      whole=6  outside-script=3     (the first tab's H1)
```

- The only `<h1>` in the served HTML is "41–50°F starts had the fewest sustained slowdowns."
- `components/analysis/TabTitle.client.tsx:31` returns one title: `return <>{(titles.find((t) => t.id === current) ?? titles[0])?.title}</>;`. The comment at lines 5 to 7 says "The server renders the first tab's".
- `components/analysis/pages/RaceDayWeather.tsx:76` passes both the H1 and the sentence under it through `TabTitle`. The warming and wind H1s are the headlines of `getNugget('weather.warming')` and `getNugget('weather.wind')` (line 60, rendered at line 70; the wording is at `lib/nuggets/analyses.ts:450` and `463`). The sentence under each is at line 63 and shows only under the nugget's guard (line 69). The page's payload holds both headlines and neither nugget's fallback text, so both guards pass at the release production serves.
- The panels already do it the other way: `components/analysis/WeatherTabs.client.tsx:36-38` renders every panel and sets `hidden` on the unselected ones.

**Why it matters.** Two of the eleven analyses have no URL of their own, no title of their own, and no finding sentence that a crawler can read without running the page. Most answer-engine crawlers do not run JavaScript. The tables are there, but the sentence that says what they mean is not.

**Proposed change.** Make `TabTitle` do what `WeatherTabs` does, at `components/analysis/TabTitle.client.tsx:31`:

```tsx
return <>{titles.map((t) => <span key={t.id} hidden={t.id !== current}>{t.title}</span>)}</>;
```

Both instances (the H1 and the sentence under it) then serve all three texts, with two hidden until their tab is chosen. Do not add `#warming` or `#wind` ids: `components/analysis/WeatherTabs.client.tsx:5-11` leaves them out on purpose so the browser never jumps to a panel.

Things to check when implementing, none of which I tested: a parser that ignores `hidden` reads an H1 of three sentences, so any verifier that compares the built H1 with the nugget sentence must skip hidden spans; the spans must not change the H1's layout; a screen reader must still announce one finding.

The alternative is to give warming and wind their own URLs again. The owner merged them into tabs on purpose, so I do not propose it.

**Effort / risk.** S to M. Medium: it changes the H1's markup on one page.

**Status.** Verified by me (the four sentences counted inside and outside script tags in the saved page; the code lines read). Whether a given engine uses text under `hidden`: not verified. **Fix type.** Owner decision (design); the code change is one line.

### P1-3 `/finish-times` targets "average marathon time" and never shows the phrase

**What.** The title is "Average Marathon Time: Median and Distribution | Pace Notes" and the description opens "What is the average marathon time? The median finish in … large city marathons is 4:11 (recorded women 4:32, men 4:00) …". The visible page never says "average marathon time". The women's and men's medians appear once, in the 50th-percentile row of a table.

**Evidence.**

```
node $D/scripts/in-main.cjs $D /finish-times "average marathon time" "average" "4:32" "recorded women" "median finish"
  "average marathon time"  in-main=0
  "average"                in-main=1   (in "each bar, their average")
  "4:32"                   in-main=1   (the table row "50th 4:11 4:32 4:00")
  "recorded women"         in-main=1
  "median finish"          in-main=4
```

- H1: "More than half of all finishes took over four hours." Hero: "4:11 4 hours 11 minutes median finish".
- `app/finish-times/page.tsx:23` holds the title, lines 17 to 20 the description, built from `getFinishTimeSummary()`.
- `components/FinishTimeSummary.tsx:22-24` records the choice to show the median alone under the H1.
- The page has breadcrumb markup only: no `Article`, no dates.
- A web search for "average marathon finish time median" returned therunningchannel.com, marathonhandbook.com, runbundle.com, runningwithrock.com and livestrong.com (indicative; the tool is neither Google nor Bing).

**Why it matters.** This is the highest-volume question the site can answer from its own data, and the page that targets it gives the answer in the metadata, not on the page. A search engine weighs the visible text; an answer engine quotes it. The question and its answer, with the split by recorded gender, should be one visible sentence near the top.

**Proposed change.** Add one line under the H1 in `components/FinishTimeSummary.tsx`, built from the same values `seo()` reads at `app/finish-times/page.tsx:11-26`, for example:

> Average marathon time: the median finish was 4:11. Recorded women 4:32, recorded men 4:00.

Constraints: the three times come from `getFinishTimeSummary()`, never typed; no mean is claimed (the page's own comment at `app/finish-times/page.tsx:10`); no coverage text such as the number of races or finishes, which rule 15 keeps on `/methodology`; the line shows only while the summary's guard holds. The verifier that recounts this page's numbers needs the new line added (I did not identify which verifier that is).

**Effort / risk.** S. Low; it reverses a recorded design choice, so the owner decides.

**Status.** Verified by me (phrase counts in the saved page; code lines read). **Fix type.** Owner decision (design).

### P1-4 `/slowdown`, the page for the site's own metric: the described number is not on the page, and the page is the thinnest hub

**What.** The description promises a figure: "How often recorded marathon finishes had a sustained slowdown (30.8% of finishes), where they began, and how often by earlier recorded best." The page shows "About 3 in 10 finishes had one." and never 30.8. The page also has 139 words in `<main>`, one H2, no structured data at all (not even breadcrumbs) and the default share image.

**Evidence.**

```
node $D/scripts/in-main.cjs $D /slowdown "30.8" "3 in 10" "1,298,524"
  "30.8"       in-main=0
  "3 in 10"    in-main=1
  "1,298,524"  in-main=1
node $D/scripts/recount.cjs $D/crawl.tsv
  pages without JSON-LD: /about, /analyses, /privacy, /slowdown, /stories, /tools
```

- `crawl.tsv`, row `/slowdown`: title (47) "Sustained Slowdown in the Marathon | Pace Notes"; `words_main` 139; `jsonld_types` empty; `og_image` `https://splithappens.run/og/default.png`.
- `app/slowdown/page.tsx:21` builds the description's share from `study.rate` (`getStudyEvidence()`): `` ` (${study.rate.toFixed(1)}% of finishes)` ``.
- `app/slowdown/page.tsx:53` and `:65` build the visible sentence from a different object, `onset.values.rate` (`getNugget('slowdown.onset')`): `` `${capitalize(approxWords(rate, 'finishes'))} had one.` ``.
- The page returns no `<JsonLd>` element (lines 59 to 86).

**Why it matters.** "Sustained slowdown" is the term the whole site is built on, and rule 14 sends every other page's reader to it. For an answer engine the natural question is "what share of marathon finishes slow down late", and the citable number is in the metadata only. The description and the page also read the rate from two different objects, so they can drift apart after a data release with no check noticing (the practice "two numbers on one screen must add up").

**Proposed change.**

1. `app/slowdown/page.tsx:65`: show the exact share beside the approximation, from the same `rate` value, for example "About 3 in 10 finishes had one (30.8%)." I did not check whether `onset.values.rate` is in percent or a fraction; `study.rate` is in percent (line 21).
2. `app/slowdown/page.tsx:21`: read the rate from the same source as line 53 so the description and the page cannot disagree.
3. Add breadcrumbs, as every other chapter page has: `<JsonLd data={pageCrumbs(PATH, 'Sustained slowdown')} />` with `JsonLd` and `pageCrumbs` imported from `@/lib/seo` (`lib/seo.tsx:113-116`).
4. A share card for the page: it uses `/og/default.png` today (`lib/og-paths.ts:27` covers only stories, tools and courses). Owner decision (design).

The definition stays where rule 14 puts it, on `/methodology#sustained-slowdown`; the page already links there from the unit line (line 67).

**Effort / risk.** S for items 1 to 3. Low. The page's visible text changes, so its sitemap date moves.

**Status.** Verified by me (phrase counts in the saved page; the crawl row; code lines read). Whether the two rate values are equal today: not checked. **Fix type.** Items 2 and 3: safe mechanical code change. Item 1: safe mechanical code change with five visible characters of copy. Item 4: owner decision (design).

### P1-5 The pages built for search demand have one or two inbound links each

**What.** The pace chart, the five goal pages and the six qualifying race pages are the pages whose titles match what runners type into a search box. They are almost unlinked:

| Page | Pages that link to it | Click depth |
| --- | --- | --- |
| `/tools/marathon-pace-chart` | 2 (`/tools`, `/tools/half-marathon-pace-chart`) | 2 |
| each of the 5 goal pages, for example `/tools/marathon-pace/4-00` | 2 (`/tools`, `/tools/marathon-pace-chart`) | 2 |
| each of the 6 race pages, for example `/tools/qualifying/boston` | 1 (`/tools/qualifying`) | 3 |
| `/tools/projector` | 1 | 2 |

No course page links to its race's qualifying page, and no qualifying page links to its course page. For comparison, 21 URLs are linked from at least 170 of the 182 pages.

**Evidence.**

```
node $D/scripts/inbound-of.cjs $D /tools/marathon-pace-chart '^/tools/marathon-pace/' '^/tools/qualifying/' /tools/qualifying
  /tools/marathon-pace-chart: 2 source pages   (/tools: "Marathon pace chart Every goal from 2:30 to 6:30"; /tools/half-marathon-pace-chart)
  /tools/marathon-pace/*: 2 source pages each  (/tools, /tools/marathon-pace-chart)
  /tools/qualifying/*: 1 source page each      (/tools/qualifying, anchors such as "Every London age group")
  /tools/qualifying: 8 source pages            (/methodology, /tools, the six race pages)
node $D/scripts/depth.cjs $D /tools/qualifying/boston /tools/marathon-pace-chart /tools/marathon-pace/4-00
  depth 3 by section {"/tools/*":6,"/charts/N":100}
  /tools/qualifying/boston 3   /tools/marathon-pace-chart 2   /tools/marathon-pace/4-00 2
```

- `app/tools/page.tsx:62-69` lists the two pace charts and the five goal pages; it has no row for the six race pages.
- `lib/seo-pages/qualifying.ts:10` builds the race pages from `STANDARDS` (`lib/tools/qualifying.ts:111-194`: boston, nyc, london, chicago, berlin, sydney). All six races have a course page (`/courses/boston`, `/courses/new-york`, `/courses/london`, `/courses/chicago`, `/courses/berlin`, `/courses/sydney`).
- Outbound links counted in the saved pages (`$D/raw/pages/`, script tags removed): `/tools/qualifying/boston` has 36 links and none to `/courses/boston`; `/courses/boston` has 51 and none to a qualifying page; `/tools/marathon-pace/4-00` has 44 and none to `/tools/marathon-pace-chart`.
- Web searches (indicative only): "marathon pace chart" returned fitnessvolt.com, brooksrunning.com, marathonhandbook.com and others; "Boston Marathon qualifying times 2027" returned baa.org, marathonhandbook.com and boston.com. These are established pages; internal links are the one ranking input fully in the site's hands.

**Why it matters.** A search engine reads internal links as the site's own statement of which pages matter. Today the site says its navigation and footer pages matter most and these pages least. Course pages are also where a runner interested in Boston or London already is.

**Proposed change.**

1. `app/tools/page.tsx`, after the goal list (line 69): a row of six links built from `QUALIFYING_PAGES`, with the race name as the anchor text ("Boston qualifying times" and so on). Depth falls from 3 to 2.
2. Course page to race page and back, for the six races. A small map (`boston`, `nyc` to `new-york`, `london`, `chicago`, `berlin`, `sydney`) used by the course page component and by `components/tools/QualifyingRace.tsx`. The link is a plain link with neutral text such as "Boston qualifying times by age", so rule 16 holds: nothing from the standards page is combined with Pace Notes data.
3. Each goal page links up to `/tools/marathon-pace-chart`. Today none does: the only pace link on `/tools/marathon-pace/4-00` points at itself ("Pace for a 4:00 goal"), although the page's breadcrumb markup names "Marathon pace chart" as its parent.
4. `/finish-times` and `/analyses/pacing-pattern` link to `/tools/marathon-pace-chart`. `/finish-times` has 62 links today, none of them to a pace chart or a chart page.
5. The home page body links to the pace chart and the qualifying checker.

**Effort / risk.** S to M. Low; each link is visible copy, so the pages' sitemap dates move, and `verify-courses --html` pins some course page content (I did not check whether an added link trips it).

**Status.** Verified by me (link counts from the saved crawl; code lines read). The effect on rankings: inferred. **Fix type.** Safe mechanical code change; where each link sits on the page is a small design choice.

### P1-6 Article markup: the story headline is the least informative of three titles, and the analyses have no Article markup

**What.** Each of the 9 stories has three names: the page title, the H1 and the `headline` in its `Article` markup. The `headline` is the short internal title. On 8 of 9 stories it differs from the H1, and it rarely names the subject:

| Story | `headline` in the markup | H1 on the page |
| --- | --- | --- |
| `/stories/round-numbers` | Round numbers | Finishes crowd in just under 3:00. |
| `/stories/who-holds-pace` | Women and men | Recorded women had far fewer sustained slowdowns. |
| `/stories/places` | Pass or be passed | From 30K, a 1:00–1:30 gap closed twice as often as from 40K. |
| `/stories/pacing-types` | Six ways to run the same race | Most finishes were Gentle faders or Metronomes. |
| `/stories/final-kick` | After the slowdown | A sustained slowdown: 20 minutes later at the finish. |
| `/stories/courses` | Every course has a fingerprint | A race's pacing shape can name its course. |
| `/stories/race-morning` | Race-morning weather | On a warmer morning, the same course slowed more. |
| `/stories/race-replay` | Watch a marathon unfold | At London 2026's first finish, nearly half the field hadn't reached 20K. |

(`/stories/half-to-full` is the ninth; its headline and H1 are both "From the half to the marathon".)

The 11 analyses, `/finish-times` and `/half` are articles in the same sense and carry breadcrumbs only: no `Article`, no author, no date.

**Evidence.**

- `app/stories/[slug]/page.tsx:64`: `headline: story.title,`. The node is lines 61 to 74; the author and publisher are `{ '@type': 'Person', name: 'Andrew Kam' }`, as the policy in `scripts/verify-seo.cjs:461-504` requires.
- `app/analyses/[slug]/page.tsx:128`: `<JsonLd data={breadcrumbs([['Pace Notes', '/'], ['Analyses', '/analyses'], [seo.crumb ?? seo.title]])} />` is the page's only structured data.
- `node $D/scripts/recount.cjs $D/crawl.tsv`: `jsonld_types {"WebSite":1,"(none)":6,"BreadcrumbList":164,"BreadcrumbList,ItemList":1,"Dataset":1,"Article,BreadcrumbList":9}`; `article dates present 9`.
- Headlines and H1s are in `$D/raw/jsonld.json` and the `h1` column of `crawl.tsv`.
- The scripts that mention structured data are `verify-seo`, `verify-courses`, `verify-analytics`, the autopilot guard and `scripts/e2e/browser.cjs` (`grep -ilE "json-ld|jsonld|BreadcrumbList" $R/scripts/*.cjs $R/scripts/*/*.cjs`). `grep -n "Article" $R/scripts/verify-seo.cjs` prints nothing, so the policy check does not name the type. I did not read what `verify-analytics` and the browser script do with structured data.

**Why it matters.** The `headline` is what a machine reader takes as the article's name. "Women and men" or "Round numbers" names nothing. The analyses answer the ten questions the site is organised around, and markup is the cheapest way to tell an engine who wrote them and when they were last updated.

**Proposed change.**

1. `app/stories/[slug]/page.tsx:64`: `headline: seo.title.replace(/ \| Pace Notes$/, ''),`. The search title exists for all 9, is already the page's `<title>`, and names the marathon (for example "Women and Men: Who Holds Marathon Pace"). An alternative is the H1 finding: `story.heading ?? story.title` covers the four stories that define `heading` (`lib/stories.ts:167`, `194`, `222`, `237`); the other five build their H1 inside the body component, which I did not trace.
2. `app/analyses/[slug]/page.tsx:128`: emit an `Article` node beside the breadcrumbs with `headline` (the search title without the brand suffix), `description: seo.description`, `url` and `mainEntityOfPage` (the canonical URL, which carries no `#` or `?`), `image` (the page's share image), `dateModified` from the same function the sitemap uses for this path (`lib/seo-routes.ts`), `inLanguage: 'en'`, and the same name-only author and publisher as the stories. Pass `type: 'article'` and `modifiedTime` to `pageMetadata` at line 112 so the Open Graph date agrees, as it does on the stories.
3. The same node on `/finish-times` (`app/finish-times/page.tsx:35`) and `/half` (`app/half/page.tsx:30`).

Leave `datePublished` out where no first-published date is recorded; a guessed date is worse than none.

**Effort / risk.** S for item 1, M for items 2 and 3. Low. The policy check fails any site URL in JSON-LD that contains `#` or `?` (`scripts/verify-seo.cjs:497`), so use canonical paths only.

**Status.** Verified by me (headline and H1 compared on all 9 stories in the saved pages; code lines read). **Fix type.** Safe mechanical code change.

### P1-7 The site has no entity links: nothing ties "Pace Notes" to its Instagram account, its repository or its data record

**What.** A third of the traffic comes from Instagram (the lead's figure), and the analytics policy accepts campaign tags for links in an Instagram bio, story, highlight, reel and post, so the account presumably links to the site; I did not open Instagram. The site never links back: no page links to Instagram or to any other profile. The `WebSite` markup on the home page has a name, an alternate name and a name-only creator, and no `sameAs`. `/about` says "the code behind every page is public" with no link on those words and carries no structured data. The repository and the data DOI are linked from one page, `/methodology`.

**Evidence.**

```
for h in instagram.com github.com doi.org twitter.com x.com strava.com linkedin.com; do printf '%s ' $h; grep -l "href=\"https\?://[^\"]*$h" $D/raw/pages/*.html | wc -l; done
  instagram.com 0   github.com 1   doi.org 1   twitter.com 0   x.com 0   strava.com 0   linkedin.com 0
grep -rn "instagram" $R/app $R/components $R/lib
  lib/analytics-policy.ts:65:  utm_source: ['instagram'], utm_medium: ['social'], utm_content: ['bio', 'story', 'highlight', 'reel', 'post'],
```

- The one page with a github.com or doi.org link is `/methodology` (`components/methods/MethodsDownloads.tsx:22`, `23` and `29` hold the three URLs).
- `app/(home)/page.tsx:74-77`: the `WebSite` node has `name: 'Pace Notes'`, `alternateName: 'splithappens.run'`, `url`, `inLanguage`, `description` and `creator: { '@type': 'Person', name: 'Andrew Kam' }`. No `sameAs`, no `publisher`, no logo.
- `app/about/page.tsx:72`: "Pace Notes is made by Andrew Kam, from public race results and the questions runners ask before and after a marathon. … It has no ads, and the code behind every page is public." Lines 73 and 74 link to `/methodology#sources`, `/methodology#release`, `/methodology#limits` and `/request-analysis`.
- `node $D/scripts/recount.cjs $D/crawl.tsv`: `/about` is one of the six pages with no JSON-LD.
- Three web searches for the brand (`site:splithappens.run`, and two with the name and "marathon") returned nothing from the site. The tool is neither Google nor Bing, so this is indicative only.

**Why it matters.** "Pace notes" is also a rallying term, so the name alone does not identify the site. Search and answer engines decide what a name refers to from links between a site and its profiles that point both ways. Today the one profile with an audience sends visitors to the site and the site does not point back, so that audience does nothing for the name. For an answer engine, "who publishes this and where else do they exist" is part of deciding whether to quote a page.

**Proposed change.**

1. **A visible Instagram link** in the footer or on `/about`. It is not a method, a source or a coverage statement, so rule 15 does not bar it. The footer keeps four links by a layout rule that the browser scenarios pin (`components/SiteFooter.tsx:16-19`), so `/about` is the cheaper place. I do not know the handle; the owner supplies it.
2. **`sameAs` on the `WebSite` node** (`app/(home)/page.tsx:74-77`): `sameAs: ['https://www.instagram.com/<handle>/']`. It must sit on the `WebSite` node. The policy check fails any `Person` that has `url`, `sameAs`, `@id`, `email` or `image` (`scripts/verify-seo.cjs:485`), and that reads as a deliberate choice to credit the author by name only. Whether the brand's account counts as the author's is the owner's call.
3. **The repository and the DOI belong on the `Dataset` node**, not on the site node: see P1-8.
4. **`/about`: link the words "the code behind every page is public".** A direct link to the repository is the stronger signal. Rule 15 has `/about` link to the `/methodology` ids for the downloads "instead of repeating them", so the compliant form that needs no decision is a link from those words to `/methodology#downloads`. The direct link is the owner's reading of the rule.
5. **Off the site, owner steps.** Set the repository's About, Website field to `https://splithappens.run` (`docs/SEO.md:309`, still open). Put the site URL on the Figshare record and on every profile.

**Effort / risk.** S once the owner names the handle. Low. External URLs in JSON-LD pass the policy check; only site URLs with `?` or `#` and URLs with `q=` fail (`scripts/verify-seo.cjs:496-497`).

**Status.** Verified by me (link counts in the saved pages; code lines read). That the Instagram bio links to the site: inferred from the campaign values the analytics policy accepts and from the traffic share the lead gave me; I did not open Instagram. The effect on how engines resolve the name: inferred. **Fix type.** Owner decision (the handle, and whether to link it). The code is a safe mechanical change after that: one array on the `WebSite` node and one link.

### P1-8 The Dataset has no licence, identifier or citation, and the site never says how to cite it

**What.** The `Dataset` markup on `/methodology` omits three fields Google's dataset guidelines recommend and that the site could fill today: `license`, `identifier` and `citation`. It also has no `sameAs`, `keywords`, `version`, `spatialCoverage` or `publisher`. No page tells a reader how to cite Pace Notes: the phrase "how to cite" occurs nowhere.

**Evidence.**

```
node $D/scripts/dataset.cjs $D/raw/pages/splithappens.run_methodology.html
  keys: @context, @type, name, description, url, creator, isAccessibleForFree, temporalCoverage, dateModified, variableMeasured, distribution
  license: (absent)   identifier: (absent)   citation: (absent)   sameAs: (absent)
  keywords: (absent)  version: (absent)      spatialCoverage: (absent)   publisher: (absent)
  temporalCoverage: 2005/2026 | dateModified: 2026-11-05   variableMeasured: 7
node $D/scripts/phrase.cjs $D "how to cite" "CC BY"
  "how to cite"  main: 0
  "CC BY"        main: 1 [/methodology]
```

- `app/methodology/page.tsx:32-36`, the comment over `storyDataset()`: "No licence is given because the repository does not state one." The node is lines 43 to 59.
- `docs/SEO.md:318` records the open owner item: "A licence for the Dataset JSON-LD… Choose a licence first; then add it to the repository and to `storyDataset()`".
- The page already states a licence for one of its downloads: `components/methods/MethodsDownloads.tsx:72`, "Exports of the race records, each version with its own DOI, under a CC BY 4.0 licence", linking `https://doi.org/10.6084/m9.figshare.33965155` (line 29).
- That DOI has no version. The comment over it (`components/methods/MethodsDownloads.tsx:24-28`) says it "resolves to the newest version there, which need not be the release the site uses", and that `analysis/ACCESS.md` "gives the versioned DOI of the adopted one". In the checkout that document gives a versioned DOI for `private-export-20261021-1050` only (`10.6084/m9.figshare.33965155.v3`, line 169). Its section for the adopted `master-20261103b` names none: `sed -n '1,47p' $R/analysis/ACCESS.md | grep -c -i 'doi\|figshare'` prints 0.
- `analysis/half-release.json:5` records `"license": "CC BY 4.0"` for the half data; `AGENTS.md` rule 4 calls the half releases "the owner's public CC BY 4.0 releases".
- The checkout has no `LICENSE` or `CITATION` file at its root, and `package.json` has no `license` field.

**Why it matters.** Answer engines and researchers quote a source they can cite. Dataset search engines rank and filter on licence and identifier. The data here is already public, and its Figshare exports have a DOI and a stated licence, so the missing part is saying so in the two places a machine and a person look.

**Proposed change.**

1. **A "How to cite" line in the downloads part** (`components/methods/MethodsDownloads.tsx`, after the file rows at lines 70 to 75). It belongs on `/methodology` by rule 15. For example: "To cite Pace Notes: Andrew Kam, Pace Notes (splithappens.run), with the page's address and the date you read it. To cite the data, use the DOI of the Figshare version you used." No release tag or date appears in it, so rule 17 holds. The wording is the owner's.
2. **`identifier` and `sameAs` on the Dataset node** (`app/methodology/page.tsx:43-59`): the DOI and the repository. First the owner confirms what the node describes. Its `distribution` lists the seven aggregate story files, while the DOI covers the exports of the race records, which are a different thing. Two honest forms:
   - keep the node for the aggregate files and add `isBasedOn: 'https://doi.org/10.6084/m9.figshare.33965155'`; or
   - add a second `Dataset` node for the race records, with the DOI as `identifier`, `license: 'https://creativecommons.org/licenses/by/4.0/'` and the Figshare page as `url`.
   Either form needs the owner to name the identifier first. The DOI on the page has no version, and the access document records no DOI for the adopted release (evidence above), so the unversioned DOI may resolve to an export that is not the one behind the pages. I did not contact doi.org or Figshare, so what that record holds is unverified.
3. **`license` for the aggregate files** waits on the open owner decision at `docs/SEO.md:318`. Until then the absence is correct: do not copy the Figshare licence onto files it was not stated for.
4. **Optional:** `keywords` and `spatialCoverage` built from the same manifest the description reads; `citation` for the published slowdown method (`lib/tools/splits.ts:12`, `SLOWDOWN_CITATION`).
5. Move the three URLs at `components/methods/MethodsDownloads.tsx:22-29` to a shared module so the markup and the visible rows cannot drift.

**Effort / risk.** S for item 1, S to M for item 2. Low. The duplicate `courses.json` entry in the same node is P0-3.

**Status.** Verified by me (the node parsed from the saved page; phrase counts; code and document lines read). **Fix type.** Owner decision (the citation wording, what the node describes, which identifier, the licence). Item 5 is a safe mechanical code change.

### P1-9 Headings state findings, never questions: 1 question in 513 headings

**What.** Of 513 H1, H2 and H3 headings on the 182 pages, one ends with a question mark ("Which course ran this shape?", an H2 on `/stories/courses`). The questions exist in the code and are not shown on their pages: each story has a question as its `dek`, and each analysis has a question as its `title`. The recorded reason is that "the question lives in the page's title and description", but none of the 20 story and analysis pages has a question in either.

**Evidence.**

```
node $D/scripts/headings.cjs $D
  pages: 182
  headings: 513 {"h1":182,"h2":255,"h3":76}
  question headings: 1
    /stories/courses <h2> Which course ran this shape?
```

- `lib/stories.ts:121`, `143`, `155`, `168`, `195` (and `179`, `208`, `223`, `238`): for example `dek: 'Does everyone pace a marathon the same way?'`, `dek: 'Do round numbers change when runners finish?'`, `dek: 'How much can still change after 30K?'`.
- `lib/ten-analyses.ts:12-21`, ten analyses: for example `title: 'How do runners near my time pace the race?'`, `title: 'What happens after a very fast start?'`, `title: 'Where is a target time won or lost?'`. The eleventh page, `/analyses/downhill-start`, is added at the route (`app/analyses/[slug]/page.tsx:105`) with no such definition; a question for it is stored at `lib/personalized-catalog.ts:9` ("What follows a fast opening on a downhill-start profile?").
- `components/story/StoryPage.tsx:93-98` records why they are not shown: "No question dek: the finding comes first, and the question lives in the page's title and description."
- In `crawl.tsv`, a question mark occurs in 1 of 182 titles (`/charts/11`) and 1 of 182 descriptions (`/finish-times`); in 0 of the 20 story and analysis pages' titles or descriptions.
- `node $D/scripts/phrase.cjs $D "What happens after a very fast start" "Does everyone pace a marathon the same way" "Where is a target time won or lost"` finds the first two on no page and the third once, on `/methodology`.

**Why it matters.** The finding-first H1 is a strength: the answer is the first thing a reader or a machine meets. What is missing is the question it answers. People type questions into answer engines, and an engine matches a passage most easily when the question and its answer sit together. The titles and descriptions carry topic words and findings, so today the question is in none of the three places.

**Proposed change.** Render the existing question as a short line above the H1 (a kicker), on stories and analyses, keeping the H1 as the finding. On a story that is the `dek` already passed to `StoryHero` (`components/story/StoryPage.tsx:99`); on ten of the analyses it is `definition.title`, and the eleventh would take the stored question named above.

Constraints checked against the rules:

- A question states no reading, so it may show when a guard fails (rule 13); the fallback rule is untouched.
- None of the stored questions uses a phrase the site-wide check bans (`scripts/verify-seo.cjs:69`: "the wall", "arithmetic", "your chance"). Two analysis questions say "target" ("Where is a target time won or lost?", "How does my target compare with the field?"). The goal-word list in `scripts/lib/words.cjs` applies to chart and half copy, not to these pages, and both questions speak of the visitor's own target, not a runner's inferred goal (rule 12). The owner should still read them before they become visible.
- A cheaper form that changes no design: put the question in the description, where the code comment says it already lives. `/finish-times` does this today ("What is the average marathon time? The median finish …"). On the analyses the description is the finding followed by a short tail (`app/analyses/[slug]/page.tsx:49-66`, a deliberate finding-first choice), and several are short (`/analyses/hills-and-pacing` 92 characters, `/analyses/finish-time-context` 96, `/analyses/checkpoint` 99), so the question fits after the finding on those without passing 155.
- Do not add `FAQPage` markup: `scripts/verify-seo.cjs:488` warns on it by policy, and since 2023 Google has shown FAQ results only for well-known government and health sites.

**Effort / risk.** S to M. It reverses a recorded design choice and changes the top of 20 pages, so it needs captures at phone and desktop widths in light and dark.

**Status.** Verified by me (headings counted in the saved pages; question marks counted in the crawl table; code lines read). That a visible question improves how often engines quote a page: inferred from how they are known to match passages, not measured. **Fix type.** The kicker: owner decision (design). The question in the description: safe mechanical code change in the stories' `description` fields (`lib/stories.ts`) and the `TAIL` strings (`app/analyses/[slug]/page.tsx:54-66`), where the result stays within 155 characters (`scripts/verify-seo.cjs:458` warns above that).

### P1-10 AI crawlers are allowed, which is right; it is written down nowhere, and Bing is still not set up

**What.** The site lets every crawler in. `robots.txt` has one group, for `*`, that blocks only the two folders of recorded runner names. No page restricts snippets. Requests that name the main AI crawlers get the same 200 as any other. That is the right setting for a site that wants to be quoted, and I recommend keeping it. Two gaps:

- The choice is recorded nowhere. `docs/SEO.md` has no section on AI crawlers or answer engines, and the robots check would not catch the likeliest mistake (below).
- Bing Webmaster Tools is still an open owner item (`docs/SEO.md:308`). ChatGPT's search and Microsoft Copilot are widely reported to draw on Bing's index, so for answer engines this is the single step with the most reach. I did not verify that dependency in this audit.

**Evidence.**

```
curl -sS https://splithappens.run/robots.txt
  User-Agent: *
  Allow: /
  Disallow: /data/runners/index/
  Disallow: /data/runners/profiles/
  Sitemap: https://splithappens.run/sitemap.xml
for w in nosnippet max-snippet noai noimageai data-nosnippet noarchive; do printf '%s %s\n' "$w" "$(grep -l -- "$w" $D/raw/pages/*.html | wc -l)"; done
  0 pages for each of the six
curl -sS -o /dev/null -A "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)" -w '%{http_code} %{size_download}\n' https://splithappens.run/finish-times
  200 149329
```

- The same request with the user-agent strings of OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, CCBot, bingbot and Googlebot, and with curl's own, each answered 200 with 149,329 bytes (2026-11-09 21:28 UTC; `$D/raw/step8/ua.txt`). The requests came from this session's network, not from the crawlers' own addresses, so they show only that nothing refuses these names.
- `node $D/scripts/recount.cjs $D/crawl.tsv`: the robots meta is `index, follow, max-image-preview:large` on all 182 pages.
- `app/robots.ts:11`: `rules: [{ userAgent: '*', allow: '/', disallow: [...ROBOTS_DISALLOW] }]`.
- `scripts/verify-seo.cjs:914-916`: the check that the runner folders are blocked runs only for a group whose agents include `*`.

**Why it matters.** Under the robots standard a crawler obeys the most specific group that names it and ignores the `*` group. If someone later adds a group for one AI crawler (to allow it by name, or copied from a template), that crawler stops being bound by the two `Disallow` lines for the runner folders, and the check passes.

**Proposed change.**

1. **Keep one wildcard group.** Add no named groups.
2. **Close the gap in the check** (`scripts/verify-seo.cjs:914`): drop the `if (group.agents.includes('*'))` condition so every group must block the `ROBOTS_DISALLOW` folders. This strengthens a check; it weakens none.
3. **Record the policy** in `docs/SEO.md`: all crawlers, AI crawlers included, are allowed; no named groups; no snippet limits; the date and who decided.
4. **Owner steps.** Finish Search Console, then import the site into Bing Webmaster Tools and submit the sitemap (`docs/SEO.md:306-308`). Optional afterwards: IndexNow, which Bing documents for telling it about changed URLs after a deploy; it needs a key file at the site root and one request per deploy, so it is a small workflow step, not a page change.
5. **Owner check in Vercel.** The project's firewall has a setting that blocks AI bots. My requests suggest it is off; the owner can confirm in the dashboard. [One sentence about the reviewer's own tools is not copied.]

**Effort / risk.** S for items 2 and 3. None.

**Status.** Verified by me (curl against production; phrase counts in the saved pages; code lines read). The Bing dependency of answer engines: not verified. **Fix type.** Item 2: safe mechanical code change. Item 3: documentation. Items 4 and 5: owner steps.

### P1-11 No `llms.txt` (optional, cheap, unproven)

**What.** `https://splithappens.run/llms.txt` answers 404. So do `/llms-full.txt` and `/.well-known/llms.txt`.

**Evidence.**

```
curl -sS -o /dev/null -w '%{http_code} %{size_download} %{content_type}\n' https://splithappens.run/llms.txt
  404 35509 text/html; charset=utf-8
```

- Saved responses for the three paths: `$D/raw/step2/special.txt` (each 404, 35,509 bytes, the site's own not-found page).
- `vercel.json:27-30` adds `X-Robots-Tag: noindex` to every `.txt` file except `robots.txt`, so an `llms.txt` would be served with that header. That is the right behaviour for such a file: it is meant to be fetched, not to rank.

**Why it matters.** `llms.txt` is a proposed convention: a short Markdown file at the site root that tells a language model what the site is and which pages matter. I know of no major answer engine that has said it reads the file, so I would not count on any effect. The reason to consider it here is that the site's best pages are data pages with heavy HTML (`/methodology` is 886,462 bytes decoded), and a plain index of the pages with one line each is cheap to generate from data the site already has.

**Proposed change.** If the owner wants it: a static route `app/llms.txt/route.ts` with `export const dynamic = 'force-static'` (as `app/robots.ts:4` has), which writes:

- one paragraph saying what Pace Notes is, taken from the home description (`homeDescription()`, used at `app/(home)/page.tsx:74-77`);
- a list of the hub pages and the 20 story and analysis pages, each with its title and description from the same functions that build the page metadata, in the order of `sitemapEntries()` (`lib/seo-routes.ts`);
- a link to `/methodology` for definitions, sources and downloads.

Every line must come from the existing metadata functions, so that each number in it is already guarded and recounted (rule 13) and no method text is repeated outside `/methodology` beyond what titles and descriptions already say (rule 15). A typed file in `public/` would go stale and could state a reading whose guard has since failed; do not do that. `verify-seo` reads built pages, so a new check would be needed for the banned words (rule 17) in this file.

**Effort / risk.** M, mostly the check. Low. Whether a route named `llms.txt` exports cleanly in this build is untested.

**Status.** The 404: verified by me (curl). Any benefit: unverified. **Fix type.** Owner decision (optional).

### P1-12 A page date that machines can read is on the nine stories and `/methodology`; the other 172 pages state it only in the sitemap

**What.** A page's freshness is stated in three machine-readable places on the nine stories (the sitemap, the Open Graph tags and the `Article` markup), in two on `/methodology` (the sitemap and the `dateModified` of its Dataset markup) and in one, the sitemap, on the other 172 pages. Seven of those, the qualifying pages, also carry a `<time>` element; it dates the check of the official standards ("Checked October 8, 2026" on `/tools/qualifying/boston`), not the page.

**Evidence.**

```
node $D/scripts/headings.cjs $D
  articleModifiedMeta: 9 pages -> the nine /stories/* pages
  jsonLdDateModified: 10 pages -> /methodology and the nine stories
  jsonLdDatePublished: 9 pages -> the nine stories
  timeElement: 7 pages -> /tools/qualifying and the six race pages
node $D/scripts/recount.cjs $D/crawl.tsv
  sitemap_lastmod {"2026-11-05":171,"2026-10-19":2,"2026-10-31":1,"2026-10-08":8}
```

- The sitemap's dates are honest: they differ by page and follow the data and the copy (`lib/seo-routes.ts:150-160`, `CONTENT_DATES`, and `dataDate()`).
- On the stories the sources agree. For example `/stories/race-morning`: modified 2026-11-05 in the sitemap, the Open Graph tag and the `Article` markup; published 2026-10-17 in the tag and the markup (a sitemap carries no published date). Columns `article_published`, `article_modified` and `sitemap_lastmod` of `crawl.tsv`.
- `lib/seo.tsx:59`: `const article = type === 'article' ? { ...(publishedTime ? { publishedTime } : {}), ...(modifiedTime ? { modifiedTime } : {}) } : {};`. The Open Graph dates are written only for a page whose type is `article`; line 65 puts the same `type` in `og:type`.

**Why it matters.** Answer engines prefer sources they can date, and a sitemap date is the weakest of the signals because it is not on the page. The analyses, `/finish-times`, `/half`, `/slowdown`, the course pages and the charts all change with each data release and say so only in the sitemap.

**Proposed change.**

1. The `Article` nodes proposed in P1-6 (analyses, `/finish-times`, `/half`) carry `dateModified` from the function the sitemap uses for the same path, with `modifiedTime` passed to `pageMetadata` so the Open Graph tag agrees. One source for all three, so they cannot disagree.
2. `/slowdown`: the same, with the breadcrumbs proposed in P1-4.
3. Course pages and chart pages: leave them on the sitemap date. The 27 course pages may carry only breadcrumb markup (`verify-courses --html`), and passing `modifiedTime` alone to `pageMetadata` writes nothing (`lib/seo.tsx:59`, quoted above). A date there would mean passing `type: 'article'`, which also changes `og:type` on those pages. That is an owner or lead call, and I do not recommend it for a page that is a reference page, not an article.
4. **No visible "Updated" line.** Rule 17 bars a release's date in visible copy, and for a data page the modified date is the release's date. A visible date would need the owner to read the rule as allowing it. The machine-readable date is already the site's practice on the stories.

**Effort / risk.** S once P1-6 is done. Low.

**Status.** Verified by me (counts from the saved pages and the crawl table; `lib/seo.tsx:52-72` read). **Fix type.** Items 1 and 2: safe mechanical code change, part of P1-6 and P1-4. Items 3 and 4: no change proposed.

### P1-13 `/half` states the median half marathon time and its title does not ask for the query

**What.** `/finish-times` is titled for its query: "Average Marathon Time: Median and Distribution | Pace Notes". The half page shows the same kind of answer (the median half finish, with recorded women's and men's) and is titled "Half Marathon Finish Times: What the Field Ran | Pace Notes". No page on the site contains "average half".

**Evidence.**

```
node $D/scripts/phrase.cjs $D "average half"
  main: 0   headings: 0   title: 0   description: 0
node $D/scripts/in-main.cjs $D /half "average half marathon" "median half finish" "1:57" "2:08"
  "average half marathon"  in-main=0
  "median half finish"     in-main=1
  "1:57"                   in-main=1
  "2:08"                   in-main=1
```

- `crawl.tsv`, row `/half`: title (59 characters) as above; H1 "Just over half of half marathon finishes came in under 2:00."; 500 words in `<main>`; breadcrumbs only.
- The page's hero reads "1:57 1 hour 57 minutes the median half finish; recorded women's 2:08, men's 1:52".
- `app/half/page.tsx:6`: `const TITLE = 'Half Marathon Finish Times: What the Field Ran | Pace Notes';`.

**Why it matters.** "Average half marathon time" is the half's counterpart of the marathon query the site already targets, and the page already holds the answer in server-rendered text. Only the words of the query are missing.

**Proposed change.** `app/half/page.tsx:6`, one of (lengths counted, limit 60):

- `'Average Half Marathon Time and Finish Times | Pace Notes'` (56), which keeps "finish times";
- `'Average Half Marathon Time: What the Field Ran | Pace Notes'` (59).

As on `/finish-times`, the title says "average" and the page reports a median and never claims a mean. If the owner accepts the visible line proposed in P1-3 for the marathon, the half takes the same form from its own nuggets, under their guards. `verify-half` checks this page's words (`HALF_BANNED` in `scripts/lib/words.cjs:20`); `grep -n -i "average" $R/scripts/lib/words.cjs` prints nothing, so the word is not on its lists, but I did not run the verifier.

**Effort / risk.** S. Low. The title is visible text, so the page's sitemap date moves.

**Status.** Verified by me (phrase counts; the crawl row; the code line; title lengths counted). **Fix type.** Safe mechanical code change of one string; the choice of wording is the owner's.

### P1-14 Five goal pages for a data range of 2:30 to 6:30

**What.** Goal pages exist for 3:00, 3:30, 4:00, 4:30 and 5:00. The pace chart covers every goal from 2:30 to 6:30. The limit is deliberate and recorded.

**Evidence.**

- `lib/tools/pace-chart.ts:88-89`: "The five round goals with their own page. More would risk mass-produced near-duplicate pages." `GOAL_PAGE_MINUTES = [180, 210, 240, 270, 300]`.
- `docs/SEO.md:77`: "Five goal pages only, on purpose: one page per minute would be mass-produced near-duplicates."
- A goal page is not thin: `/tools/marathon-pace/4-00` has 537 words, four H2s and a figure from the data in its description ("207,577 recorded finishes just under 4:00", built at `app/tools/marathon-pace/[goal]/page.tsx:180` from the pace-band group for that goal).
- The data a goal page reads exists for other round goals too (release `master-20261103b`, input dated 2026-11-03, as in the checkout). `observedFor` (from line 44) reads the group for the goal from `public/data/insights/tools/pace-band/all/all.json`, which holds one group per minute from 2:30 to 6:30. `bunchingFor` (from line 77) reads the goal's mark from `public/data/insights/finish-times.json` and shows the bunching section only when the mark exists and the lower bound of its interval is above 1 (line 82):

```
node $D/scripts/goals.cjs $R/public/data/insights/tools/pace-band/all/all.json $R/public/data/insights/finish-times.json
  goal  all_n   editions  mark_ratio  ci95             bunching_section
  2:30  6225    193       1.4244      [1.3314,1.517]   shows
  2:45  21210   201       0.9616      [0.93,0.9925]    guard fails
  3:00  73401   201       1.7467      [1.6983,1.8072]  shows        (has a page)
  3:15  81513   201       1.1087      [1.0884,1.1281]  shows
  3:30  137563  201       1.3643      [1.3365,1.3991]  shows        (has a page)
  3:45  146555  201       0.9592      [0.9445,0.9735]  guard fails
  4:00  207577  201       1.2941      [1.275,1.3167]   shows        (has a page)
  4:15  148990  201       -           -                no mark
  4:30  145464  201       1.1072      [1.0919,1.1258]  shows        (has a page)
  4:45  117090  201       -           -                no mark
  5:00  104413  201       1.0703      [1.0493,1.0865]  shows        (has a page)
  5:30  55838   197       1.055       [1.0283,1.0758]  shows
  6:00  32056   183       1.0868      [1.0526,1.1156]  shows
```

  (The script prints two more columns and the rows for 5:15, 5:45, 6:15 and 6:30, which have no mark.)
- A web search for "3:30 marathon pace per mile" returned marathonhandbook.com, advnture.com, rundreamachieve.com and coachtherun.com, each with a page for that one goal (indicative only).

**Why it matters.** The recorded reason argues against one page per minute, and it is right. It does not argue against a handful more round goals. Runners search by their own goal ("3:45 marathon pace"), and each existing page pairs the pace table with what recorded finishes near that time ran, which the competing pages do not have.

**Proposed change.** Owner decision: extend `GOAL_PAGE_MINUTES` (`lib/tools/pace-chart.ts:89`) by a few round goals. By the table above:

- **3:15, 5:30 and 6:00** (195, 330, 360) would show everything the existing five show: the group holds tens of thousands of finishes and the mark's guard passes. 2:30 (150) qualifies as well, with 6,225 finishes.
- **3:45 and 2:45** (225, 165) have the pace data, but the bunching guard fails (fewer finishes just under the mark than the curve expects), so the page would leave that section out, as rule 13 requires. They are still useful pages; the owner should see one before deciding.
- **4:15 and 4:45** have no mark, so they would never show a bunching section.

I checked the two files a goal page reads, not the half-marathon panel (`HalfBefore`, imported at line 12) or the page's other guards, so build one candidate and read it before adding the rest. Each new page gets its share card from `scripts/build-og-images.cjs` (one per goal in `GOAL_PAGE_MINUTES`), and the lists on `/tools` (`app/tools/page.tsx:67`), on the pace chart (`app/tools/marathon-pace-chart/page.tsx:30`) and in the sitemap (`lib/seo-pages/pace.ts:19`) are built from the same constant. `docs/SEO.md:77` and the comment at `lib/tools/pace-chart.ts:88` say "five" and need the new count. I did not check whether a verifier pins the number five (`scripts/verify-analytics.cjs:70` asserts at least five).

**Effort / risk.** S per goal: one number in the constant, then the share cards and the two documents. The risk is the one the comment names; keep to round goals and stop well short of one page per minute.

**Status.** Verified by me (code and document lines read; the crawl row; the two data files read with the script above). Demand for other goals: indicative, from one web search. **Fix type.** Owner decision; the code change is one array.

## P2: polish

### P2-1 `/methodology` is 39,758 words; the limits and the licence start at 94% and 97% of it

**What.** Rule 15 puts every method, definition, source and limit on this one page, so it is the page an answer engine has to read to describe the site correctly. Its served text is 39,758 words in 886,462 bytes of HTML. The order is In short (119 words), The data, Definitions, Calculations (about 31,560 words, 79% of the page), Limits (about 900 words), Downloads (about 1,320 words). The detail of "What these numbers cannot show" begins at word 37,538. The licence name, the DOI and the download links begin at word 38,436.

**Evidence.**

```
node $D/scripts/anchor-offsets.cjs $D/raw/pages/splithappens.run_methodology.html data definitions sustained-slowdown evidence calculations limits downloads
  raw html 883153 chars; <main> without scripts 350952 chars, 39758 words
  id                  words_before  share_of_main
  data                145           0%
  definitions         3457          9%
  sustained-slowdown  3469          9%
  evidence            4254          11%
  calculations        5976          15%
  limits              37538         94%
  downloads           38436         97%
grep -n "<MethodsData\|<MethodsDefinitions\|<Part id\|<MethodsDownloads" $R/app/methodology/page.tsx
  113: <MethodsData />    114: <MethodsDefinitions />    115: <Part id="calculations" n={3} ...
  123: <Part id="limits" n={4} ...    151: <MethodsDownloads />
sort -t$'\t' -k5,5nr $D/crawl.tsv | awk -F'\t' 'NR<=4 {print $5, $34, $1}'
  886462 39638 https://splithappens.run/methodology
  635831 2751 https://splithappens.run/analyses/race-day-weather
  603964 4132 https://splithappens.run/stories/race-morning
  563279 220 https://splithappens.run/analyses/finish-time-context
```

The two word counts above differ by method, not by page: the crawl table (39,638, the second number of the last command) joins text across inline tags and decodes entities, while `anchor-offsets.cjs` (39,758) puts a space at every tag and entity. The difference is 120 words, 0.3%. This report quotes 39,758 throughout.

What the first 15% holds is good, and should stay there: the four-fact short version (it already says "an association, not a forecast" and "Every file is public, with no account or key", `app/methodology/page.tsx:98-108`), coverage, every definition (sustained slowdown at word 3,469, with its DOI) and the evidence badges.

**Why it matters (inferred).** Assistants that fetch a page on demand commonly read only the first part of a long one. I could not check where any engine stops. One that stops before word 37,538 has the one-line caveat from the short version, but not the limits in detail, the licence name (CC BY 4.0) or the DOI, which are what it needs to qualify and attribute a claim. For Google the size is not a risk today: a 2022 Google post gives 15 MB as the HTML Googlebot reads, and a trade report says the documentation now gives 2 MB (https://ppc.land/google-slashes-web-crawl-limit-by-86-7-as-cost-pressures-mount/; I did not read Google's own page). The page is at about 0.89 MB and grows with every analysis and chart.

**Proposed change.** `app/methodology/page.tsx`: move the Limits part (lines 123 to 149) and `<MethodsDownloads />` (line 151) up to follow `<MethodsDefinitions />` (line 114), so Calculations comes last. Reorder `PARTS` (line 27, which drives the jump list at line 110) and renumber the `n` props (`app/methodology/page.tsx:115,123`, `components/methods/MethodsDownloads.tsx:69`). No id changes, so the 824 links to `/methodology` and its ids and the `methods-anchors` check are unaffected. Splitting Calculations onto a second URL would shorten the page far more, but rule 15 says methods live only on `/methodology`; I do not propose it.

**Effort / risk.** S. A grep of `scripts/*.cjs` found no verifier that names the part order or the part numbers; the rail (`RailBeats`, line 90) and `MethodsHash` (line 153) need a look in a browser.

**Status.** Sizes and positions: verified by me (counted in the saved page; file lines read). The effect on answer engines: inferred. **Fix type.** Owner decision (design); the code change is moving two blocks and renumbering.

### P2-2 Breadcrumb markup names a parent the page does not show, on 23 pages; two hubs have one inbound page

**What.** On the 11 analyses and on the 12 tool pages that sit in a chapter, the visible crumb is the chapter ("Chapter 03 · The shape of a race", linked to `/research#chapter-03`) while the `BreadcrumbList` says "Pace Notes > Analyses > …" or "Pace Notes > Runner tools > …". Stories and course pages agree with their markup. The analyses do not link to `/analyses` at all, and the stories do not link to `/stories`: each hub has one inbound page, `/research`.

**Evidence.**

```
node $D/scripts/crumbs.cjs $D /analyses/pacing-pattern /tools/marathon-pace/4-00 /courses/boston
  11   analyses | markup parent: Analyses | visible: Chapter NN
  12   tools | markup parent: Runner tools | visible: Chapter NN
  10   tools | markup parent: Runner tools | visible: (no chapter crumb)
  28   courses | markup parent: Chapter NN | visible: Chapter NN
  9    stories | markup parent: Chapter NN | visible: Chapter NN
  /analyses/pacing-pattern   Pace Notes > Analyses > Your pacing pattern
  /tools/marathon-pace/4-00  Pace Notes > Runner tools > Marathon pace chart > 4:00 marathon pace
  /courses/boston            Pace Notes > Chapter 08 · Where you run > Courses > Boston Marathon
node $D/scripts/inbound-of.cjs $D /analyses /stories
  each: 1 source page, /research
```

The 12 tool pages are the five goal pages, `/tools/plan`, `/tools/pace-band`, `/tools/course-chooser`, `/tools/predictor`, `/tools/weather-match`, `/tools/projector` and `/tools/split-check`. Sources: `app/analyses/[slug]/page.tsx:128` and `components/tools/ToolShell.tsx:49` build the markup from the section; `components/analysis/Shell.tsx:97` and `components/tools/ToolShell.tsx:37` show `<ChapterCrumbs>`.

**Why it matters.** Small. Google asks that structured data describe what the page shows, and a breadcrumb trail is what it may print in place of the URL. The larger gain is the missing link up: a hub that 11 children name as their parent in markup but none link to. For the goal pages this is the same gap as P1-5 (no link to the pace chart).

**Proposed change.** Use the course pages' pattern on both. Course pages show "Chapter 08 · Where you run · Courses" by passing `place` (`components/course/CourseHero.tsx:89`) and build markup with `pageCrumbs(path, name, { parents: [['Courses', '/courses']] })` (`app/courses/[city]/page.tsx:53`).

1. Analyses: `components/analysis/Shell.tsx:97`, pass `place={<Link href="/analyses">Analyses</Link>}` to `ChapterCrumbs`; `app/analyses/[slug]/page.tsx:128`, `pageCrumbs(path, seo.crumb ?? seo.title, { parents: [['Analyses', '/analyses']] })`.
2. Tools in a chapter: `components/tools/ToolShell.tsx:37`, pass the trail's parents as `place` (for a goal page, "Marathon pace chart"); line 49, `pageCrumbs(path, name, { parents: [['Runner tools', '/tools'], ...parent] })`.
3. Stories: the same `place`, "Stories", if the owner wants `/stories` linked from its nine pages.

`ChapterCrumbs` shows `place` from 600 px (`components/ui/ChapterHeader.tsx:13`), so on a phone the link is in the HTML but not displayed.

**Effort / risk.** S to M. Not checked: whether `verify-chapters` or a browser scenario pins the crumb line on these pages.

**Status.** Verified by me (markup and visible crumb compared on all 182 saved pages; code lines read). **Fix type.** Owner decision (design) for the visible crumb; the markup change alone is a safe mechanical code change but adds no link.

### P2-3 Two descriptions exceed the verifier's own 155 characters; one quotes a number the served page does not show

**What.** Two tool descriptions are 169 characters; `verify-seo` warns over 155 (`scripts/verify-seo.cjs:458`), and a search result cuts them mid-sentence. One story description quotes "1,500 sampled finishes", which is not in the page's served text.

**Evidence.**

```
awk -F'\t' 'NR>1 && $11>155 {print $11, $1}' $D/crawl.tsv
  169 https://splithappens.run/tools/pace-band
  169 https://splithappens.run/tools/plan
node $D/scripts/ssr-numbers.cjs $D
  pages 182; with numbers in title/description 141; every number found in server-rendered <main> text 136
  /finish-times missing: 4.2 | /slowdown missing: 30.8% | /stories missing: 4.2 | /stories/race-replay missing: 1,500 | /stories/round-numbers missing: 4.2
```

- Sources: `app/tools/plan/page.tsx:15`, `app/tools/pace-band/page.tsx:12`.
- Of the five misses, `/slowdown` is P1-4. "4.2 million" is the coverage figure, which rule 15 keeps off these pages; it is in the served text of `/`, `/about` and `/methodology`, so it can be corroborated. That leaves `/stories/race-replay` (`lib/stories.ts:162`, from `replayFields()` at lines 66 to 75).
- Lengths otherwise: 151 of 182 descriptions are 100 to 155 characters; 29 are under 100 (26 chart pages, covered by P1-1, and three analyses at 92 to 99, which read well as they are).

**Why it matters.** Small. A cut description loses its last promise ("a pace band to print"). A number in a description that the page never shows cannot be confirmed by a reader or an engine that does not run JavaScript.

**Proposed change.**

1. Shorten the two to 155 or fewer. Candidates, which keep the owner's words and drop one clause: "Plan a marathon goal on your course: splits for every mat, with its climbs and bridges where the route is checked, and a pace band to print." (140) and "Print a free marathon wristband for any goal time, with your course’s climbs and bridges or at even pace, by mile, km or 5 km mat." (130).
2. `/stories/race-replay`: show the sample size in the server-rendered caption of the replay, from `replayFields()`, or leave it; the number is true.

**Effort / risk.** S. Not checked: whether a verifier pins either description string.

**Status.** Verified by me (lengths counted from the crawl; candidates counted with node). **Fix type.** Safe mechanical code change (the two strings); the wording is the owner's.

### P2-4 Fonts are revalidated on every page view

**What.** The two preloaded fonts (67,304 and 48,256 bytes) are served with `cache-control: public, max-age=0, must-revalidate`, so a returning browser asks the server about each one on every page before it can use its cached copy. The hashed `_next/static` files are cached for a year.

**Evidence (production, 2026-11-09 21:45 UTC).**

```
curl -sSI https://splithappens.run/fonts/inter-latin-wght-normal.woff2 | grep -i -E '^(cache-control|etag|content-length)'
  cache-control: public, max-age=0, must-revalidate
  etag: "260c81a4759baf163c025001c4f27872"
  content-length: 48256
awk -F'\t' '$7 ~ /fonts|css/ {print $2, $5, $7}' $D/raw/step6/asset-sizes.tsv
  67304 public, max-age=0, must-revalidate https://splithappens.run/fonts/fraunces-latin-opsz-normal.woff2
  48256 public, max-age=0, must-revalidate https://splithappens.run/fonts/inter-latin-wght-normal.woff2
  14130 public,max-age=31536000,immutable https://splithappens.run/_next/static/css/443cefe6e82749d2.css
grep -n '"source"' $R/vercel.json   (header rules, lines 24 to 43: "/(.*)", the .txt rule, "/data/:path*", "/version.json", "/runners"; none for /fonts)
```

The faces are declared with `font-display: swap` and unhashed names (`app/styles/fonts.css:8-20`), with metric-matched fallbacks (line 23), so the visible cost is a late swap, not a layout shift.

**Why it matters.** Small, and only for repeat views; 78% of visits are on phones. It is not a ranking matter by itself.

**Proposed change.** `vercel.json`, a header rule: `{ "source": "/fonts/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=2592000" }] }`. Thirty days and not `immutable`, because the names carry no hash and `scripts/fonts/copy-fonts.cjs` regenerates the files from the font packages. A year with `immutable` is safe only with hashed names (`next/font/local` would give them; M).

**Effort / risk.** S. A font update under the same name would take up to 30 days to reach returning visitors.

**Status.** Verified by me (curl; saved asset table; `vercel.json` read). The size of the benefit: not measured (no browser). **Fix type.** Safe mechanical code change.

### P2-5 No page embeds an image, so nothing can appear in image search

**What.** None of the 182 pages has an `<img>` element; charts are inline SVG. The 100 chart cards exist as PNG files (`/charts/cards/N.png`, 1080 by 1350) but are offered only as downloads, so a search engine has no image to associate with a page beyond its share image.

**Evidence.**

```
awk -F'\t' 'NR>1 {s+=$38; n++} END {print "pages:", n, "img_tags total:", s}' $D/crawl.tsv
  pages: 182 img_tags total: 0
grep -n "type SitemapFile" -A 12 $R/node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts
  fields: url, lastModified, changeFrequency, priority, alternates (no images field at Next 14.2.5)
```

**Why it matters.** Chart-shaped queries ("marathon finish time distribution") often show an image row. This is an opportunity, not a defect.

**Proposed change.** None now. If P1-1's per-chart share cards are built, each chart page could show its card with `<img width height alt loading="lazy">`, the alt text from `words.title`. Image entries in the sitemap are not available through `app/sitemap.ts` at this Next version.

**Effort / risk.** M, with P1-1. Page weight on phones.

**Status.** The counts: verified by me. The benefit: inferred. **Fix type.** Owner decision (design).

### P2-6 `docs/SEO.md` says `/privacy` has no `lastmod`; it has one. The contract says nothing about answer engines

**What.** Two gaps in the SEO contract document, which rule 19 makes the place where this behaviour is recorded.

1. `docs/SEO.md:61` gives `/privacy` as the example of a page whose `lastmod` is left out. The code and production give it a date, and no sitemap entry is without one.
2. The document covers search engines only. It has no line on AI crawlers, answer engines, `llms.txt`, `sameAs` or IndexNow, and names Bing on two lines, both in the owner checklist.

**Evidence.**

```
sed -n '61p' $R/docs/SEO.md
  ... Pages that are mostly written text use the hand-kept `CONTENT_DATES` map. When neither applies, `lastmod` is left out (`/privacy`, for example). ...
sed -n '157p' $R/lib/seo-routes.ts
  '/privacy': '2026-10-19',
grep -A1 'splithappens.run/privacy<' $D/raw/sitemap.xml
  <loc>https://splithappens.run/privacy</loc>
  <lastmod>2026-10-19</lastmod>
awk -F'\t' 'NR>1 && $41 == "" {n++} END {print n+0}' $D/crawl.tsv
  0        (sitemap entries with no lastmod, of 182)
for w in GPTBot ClaudeBot PerplexityBot OAI-SearchBot llms.txt sameAs "answer engine" "AI crawler" IndexNow Bing; do printf '%s: %s\n' "$w" "$(grep -c -i -- "$w" $R/docs/SEO.md)"; done
  0 lines for each of the first nine; Bing: 2 (lines 308 and 319)
```

**Why it matters.** The next agent reads the document, not the code. A wrong example of the `lastmod` rule invites a wrong change, and an unrecorded crawler policy is the gap behind P1-10 (a named robots group would slip the runner-folder disallows and pass the check).

**Proposed change.** `docs/SEO.md`:

1. Line 61: replace the `/privacy` example. As far as the 182 live entries show, "left out" no longer happens; say so, or name a page it does apply to if one exists in the code path (`dataDate()` in `lib/seo-routes.ts`).
2. Add a short section, "Answer engines", once the owner has decided P1-10 and P1-11: all crawlers allowed under one wildcard group; no snippet limits; whether `llms.txt` exists and what generates it; the `sameAs` and Dataset decisions from P1-7 and P1-8; each with its date.

**Effort / risk.** S. Under rule 19 the superseded sentence moves verbatim to the document's History section.

**Status.** Verified by me (document and code lines read; the saved sitemap; grep counts). **Fix type.** Safe mechanical change (documentation); item 2 waits on owner decisions.

### P2-7 Special files: nothing broken; the not-found page carries two robots tags, and there is no feed

**What.** A sweep of the well-known paths found nothing that needs fixing. Recorded so the lead need not repeat it.

**Evidence.**

```
curl -sS -o $D/raw/final/notfound.html -w '%{http_code} %{size_download} %{content_type}\n' https://splithappens.run/no-such-page-audit-check
  404 35509 text/html; charset=utf-8
grep -o '<meta name="robots"[^>]*>' $D/raw/final/notfound.html
  <meta name="robots" content="noindex"/>
  <meta name="robots" content="noindex, follow"/>
grep -n "robots" $R/app/not-found.tsx
  3: export const metadata = { title: 'Page Not Found | Pace Notes', ..., robots: { index: false, follow: true } };
```

- The first tag is the framework's own for a not-found page; the second is the page's. Both say noindex, and `verify-seo` exempts the 404 from its one-tag rule (`scripts/verify-seo.cjs:366`). No change.
- `$D/raw/step2/special.txt` (status, size, type and headers of each):
  - 200: `/robots.txt` (135 bytes), `/sitemap.xml` (16,965 bytes, `application/xml`), `/manifest.webmanifest` (493), `/favicon.ico`, `/icon.svg`, `/icons/icon-192.png`, `/version.json` (`no-store`, noindex);
  - 200 with `x-robots-tag: noindex`: `/index.txt` (45,323 bytes) and `/tools.txt` (26,251), the framework's page payloads, kept out of the index by `vercel.json:27-30`;
  - 404: `/llms.txt`, `/llms-full.txt`, `/.well-known/llms.txt` (P1-11), `/humans.txt`, `/security.txt`, `/.well-known/security.txt`, `/ads.txt`, `/feed.xml`, `/rss.xml`, `/apple-touch-icon.png`.
- The last 404 is harmless: every page declares its own icon, `<link rel="apple-touch-icon" href="/apple-icon.png?d110fff287b6ba91" type="image/png" sizes="180x180"/>`.

**Why it matters.** It does not, today. A feed is the one optional item: some readers and aggregators discover new stories through one. With nine stories and no publishing rhythm I would not build it.

**Proposed change.** None.

**Status.** Verified by me (curl; saved responses). **Fix type.** No change proposed.

### P2-8 Response headers: sound for search; four hardening headers are absent (not a ranking matter)

**What.** The document headers are what a static site on this host sends by default, plus the site's `Referrer-Policy`. Nothing here affects ranking or quoting. Listed because the owner asked for a full review.

**Evidence.**

```
cat $D/raw/step7/apex-root.headers        (GET https://splithappens.run/, Mon, 09 Nov 2026 20:08:19 GMT)
  HTTP/2 200
  access-control-allow-origin: *
  age: 344471
  cache-control: public, max-age=0, must-revalidate
  content-type: text/html; charset=utf-8
  last-modified: Thu, 05 Nov 2026 20:27:07 GMT
  referrer-policy: strict-origin
  strict-transport-security: max-age=63072000
  x-vercel-cache: HIT
  content-length: 90373
```

- Present and right: HTTPS with HSTS for two years; `Referrer-Policy: strict-origin` (`vercel.json:24-25`), which keeps page paths out of referrers; HTML revalidated on each visit, so a deploy shows at once; `last-modified` and `etag`, so crawlers can make conditional requests.
- Absent: `X-Content-Type-Options`, `Content-Security-Policy`, `X-Frame-Options` (or `frame-ancestors`) and `Permissions-Policy`, on this response and on all 182 saved page responses (`grep -l -i '^x-content-type-options:' $D/raw/pages/*.headers | wc -l` prints 0, and the same for the other three). HSTS has no `includeSubDomains`.
- In the head of every page: `<meta name="viewport" content="width=device-width, initial-scale=1"/>` and a `theme-color` for light and dark.

**Why it matters.** Not for search. `X-Content-Type-Options: nosniff` is the only one I would add without a test plan. A content security policy on a site with inline scripts and an analytics host needs care and a browser, which this audit did not use.

**Proposed change.** Optional: `vercel.json:25`, add `{ "key": "X-Content-Type-Options", "value": "nosniff" }` to the `/(.*)` rule. Leave the rest to a separate security review.

**Effort / risk.** S. Low: every content type I saw was correct (`text/html`, `application/xml`, `text/plain`, `application/json`, `application/manifest+json`, `font/woff2`, `image/png`, `image/svg+xml`), but I did not fetch every file type under `/data/`.

**Status.** Verified by me (saved response headers). **Fix type.** Safe mechanical code change (the one header), at the lead's discretion; the others are an owner decision outside SEO.

### P2-9 Words runners search with that the site never uses; compliant forms only

**What.** Some common query words do not occur on the site, because the site's own vocabulary is more exact. Most of them should stay absent. One has a compliant form.

**Evidence.**

```
node $D/scripts/phrase.cjs $D "negative split" "positive split" "pacing strategy" "good marathon time" "first marathon" "beginner"
  "negative split"      main: 1 [/methodology]   headings: 0   title: 0   description: 0
  "positive split"      main: 0
  "pacing strategy"     main: 1 [/methodology]   headings: 0   title: 0   description: 0
  "good marathon time"  main: 0
  "first marathon"      main: 0
  "beginner"            main: 0
```

- The one use of "negative split" is in a quoted research question on `/methodology` ("8. Is a negative split always associated with a better performance?").
- The site's own term is the comparison of two 20 km blocks: `/charts/3` "Few finishes ran the second 20K quicker", `/charts/34` "Even pace is rare, and rarer in slower finishes".
- The definition is already on `/methodology`, under `#baselines` (`components/methods/MethodsDefinitions.tsx:144`): "**Equal-distance blocks** compare 20–40K with 0–20K. Positive means the second 20K was slower. The final 2.195 km is separate. This is not a half-marathon split: 20K is the 20 km mat, before halfway (21.0975 km), and no halfway time is recorded."

**Why it matters.** A runner who asks an answer engine "how many marathoners run a negative split" is asking the question `/charts/3` answers, and nothing on the site connects the two phrases.

**Proposed change.**

1. **"Negative split": one sentence in the existing definition** (`components/methods/MethodsDefinitions.tsx:144`; rule 15 puts definitions on `/methodology`), naming the runners' term beside the site's. For example: "Runners call a quicker second half a negative split; the nearest recorded measure here is a quicker second 20K." The sentence that follows it already says no halfway time is recorded, which is what rule 12 needs. The wording is the owner's, and it must not say that the site measures negative splits. No page titled for the phrase.
2. **"Good marathon time": no page.** A judgement of "good" is not in the data. The compliant answer is the median with recorded women's and men's on `/finish-times` (P1-3).
3. **"First marathon", "beginner", "pacing strategy": nothing.** The records do not say who is running a first marathon (rule 12), and advice pages would have no data behind them.

**Effort / risk.** S for item 1. The risk is wording that implies a measured halfway split; a reviewer should read it against rule 12.

**Status.** The counts: verified by me. That these phrases are searched: inferred, not measured (no search volumes; see the unchecked list). **Fix type.** Owner decision (wording), item 1 only.

### P2-10 Small notes

Each is verified by me from the saved pages and the code unless it says otherwise. Notes 1 to 5 need no action without the owner; note 6 is a documentation fix.

1. **The Boston cut-off history has no heading.** `/tools/qualifying/boston` opens with every published cut-off since 2012, and its description promises them, but the section is labelled by a paragraph (`components/tools/QualifyingRace.tsx:210-213`, `aria-labelledby="qrace-cutoffs-title"` on a `<p>`). The page's headings are "Boston Marathon qualifying times for 2028", "Qualifying standards" and "Meeting the standard is not entry by itself". "Cut-off" is in a heading on `/tools/qualifying` and `/tools/qualifying/nyc`, not here (`node $D/scripts/phrase.cjs $D "cut-off"`: main 5 pages, headings 2). The code comment records a design round ("one badge per screen, round 6"), so a visible `<h2>` such as "Boston Marathon cut-off times since 2012", built from the same `first` year the sentence uses, is an owner decision (design). S.
2. **`/stories/half-to-full` has the one H1 that states no finding.** Title "From the Half to the Marathon | Pace Notes", H1 "From the half to the marathon"; the finding is in the description ("After the same half, recorded women's marathons had far fewer sustained slowdowns…"). I did not check whether the H1 is a fallback under rule 13, in which case it is correct as it is. If its guard passes, the H1 could state the finding as the other stories do.
3. **"Washington Marathon"** is an open owner item already (`docs/SEO.md:317`): the course data's name for what may be the Marine Corps Marathon. It decides which query `/courses/washington` can answer. Nothing to add.
4. **Googlebot's size limit.** Reported, not read on Google's own page: Google's documentation is said to give 2 MB of uncompressed HTML as what Googlebot reads for Search (https://ppc.land/google-slashes-web-crawl-limit-by-86-7-as-cost-pressures-mount/); a 2022 Google post gave 15 MB. The largest page, `/methodology`, is 886,462 bytes, and the next five are 346,933 to 635,831 bytes (P2-1). Inline script, which is the page's own data payload, is 59% of `/methodology` and 84 to 94% of each of the other five (script blocks measured in the saved pages with a short node command). No page is near either figure; `/methodology` is the one to watch.
5. **Anchor text to `/methodology`** is varied and descriptive: 824 links from 182 pages, of which 380 read "How we know", 182 "Open data", 157 "How these were measured" and 52 "sustained slowdown" (`$D/raw/links.json`). Keep.
6. **The access document the site links to says production uses an older release** (outside SEO proper; found while checking P1-8). `/methodology#downloads` links the words "how to open them" to `analysis/ACCESS.md` on the repository's `main` (`components/methods/MethodsDownloads.tsx:31` and `76`). In the frozen checkout, line 3 of that document says `master-20261103b` is "the release every page uses on the branch `feat/half-v4` (draft PR #89; not merged: production still uses `private-export-20261021-1050`", and that "this top section is rewritten at every adoption". On the same commit `analysis/release.json` and `public/data/live.json` name `master-20261103b`, and production serves that file: `/data/live.json` answered with 283 bytes and etag `54c410074b7de4018938441cf3adc0b8` (`$D/raw/step2/special.txt:61-66`, 2026-11-09 between 19:38 and 19:39 UTC), which are the size and the `md5sum` of `$R/public/data/live.json`. A reader or an engine that follows the site's own link is told the pages use another release. Fix: rewrite that sentence in `analysis/ACCESS.md:3` to state the adoption (rules 19 and 20). Safe mechanical change (documentation). I did not open GitHub, so whether its `main` still reads this way is unverified.

**Status.** Verified by me (saved pages, saved responses and code lines read), except the size limit in note 4 (reported by a trade source, not read on Google's page), the guard in note 2 (not checked) and the GitHub copy in note 6 (not opened). **Fix type.** Note 1: owner decision (design). Note 2: owner decision, after its guard is checked. Notes 3 to 5: no change. Note 6: safe mechanical change (documentation), the sentence at `analysis/ACCESS.md:3`.

## Page proposals

Ten proposals, most value first. Each rests on data or copy the repository already holds, so no number is typed (rule 13), and each names the rule that shapes it. The detail and the evidence are in the finding named at the end of each. None was built or tested.

1. **`/finish-times`: one visible answer line for "average marathon time".**
   - Data: `getFinishTimeSummary()`, the values `app/finish-times/page.tsx:11-26` already puts in the description (median 4:11, recorded women 4:32, recorded men 4:00, at the adopted release in the checkout).
   - Change: one sentence under the H1 that carries the phrase and the three medians.
   - Rules: no mean claimed; no coverage text (rule 15); shown only under the summary's guard (rule 13). Owner decision (design). Finding P1-3.

2. **`/half`: the same for "average half marathon time".**
   - Data: the half nuggets behind the hero (median 1:57, recorded women's 2:08, men's 1:52), under the half pin and its policy (rule 4).
   - Change: the title at `app/half/page.tsx:6` (two candidates of 56 and 59 characters in the finding), and the same answer line if the owner takes proposal 1.
   - Rules: `verify-half` word lists; aggregates only. Finding P1-13.

3. **`/slowdown`: show the number its description promises, and mark the page up.**
   - Data: `getNugget('slowdown.onset')` (`rate`) and `getStudyEvidence()` (`app/slowdown/page.tsx:20-21,53`).
   - Change: the exact share beside "About 3 in 10" (line 65); the description reads the same value as the page (line 21); breadcrumbs with `pageCrumbs(PATH, 'Sustained slowdown')`; a share card of its own.
   - Rules: the definition stays on `/methodology#sustained-slowdown` (rule 14). The page is a chapter opener and short on purpose (its comment at lines 33 to 38), so I propose no new sections. Finding P1-4.

4. **The charts section: name the subject, describe each chart, list the hub, link it in.**
   - Data: `lib/charts/catalog.json` (themes), each chart's values file, `words.title` and `words.takeaway` in `lib/charts/text/*.ts`.
   - Change: "Top 100 marathon charts" in the crumb (`components/charts/ChartPage.tsx:37`, `app/charts/[n]/page.tsx:27`); a `description(v)` per chart built from its values; an `ItemList` on `/charts` (`app/charts/page.tsx:18`); a theme-to-page map used both ways; a 1200 by 630 card per chart (`scripts/build-og-images.cjs`, `lib/og-paths.ts:27`).
   - Rules: a description states a reading only under the takeaway's guard (rule 13); `verify-charts` limits (155 characters, unique, no banned word or release label). Finding P1-1.

5. **Qualifying race pages: linked from `/tools`, and both ways with their course pages.**
   - Data: `STANDARDS` (`lib/tools/qualifying.ts:111-194`), `QUALIFYING_PAGES` (`lib/seo-pages/qualifying.ts:10`), the six matching course pages.
   - Change: a row of six links on `/tools` (`app/tools/page.tsx`, after line 69); a plain link between each race page and its course page; each goal page links up to the pace chart.
   - Rules: a link only, so official standards and Pace Notes data are never combined (rule 16). Findings P1-5 and P2-2.

6. **The analyses, `/finish-times` and `/half` as dated articles that show their question.**
   - Data: `lib/ten-analyses.ts:12-21` (the question of ten analyses; the eleventh, `downhill-start`, has one stored at `lib/personalized-catalog.ts:9`), `lib/stories.ts` (`dek`), the date function the sitemap uses (`lib/seo-routes.ts`).
   - Change: an `Article` node with a name-only author and `dateModified` (`app/analyses/[slug]/page.tsx:128`); the story `headline` taken from the search title (`app/stories/[slug]/page.tsx:64`); the stored question as a line above the H1, or, with no design change, in the description.
   - Rules: `Person` by name only, no `#` or `?` in site URLs, no `FAQPage` (`scripts/verify-seo.cjs:461-504`); a question states no reading, so rule 13 is untouched; no visible "Updated" date (rule 17). Findings P1-6, P1-9 and P1-12.

7. **`/analyses/race-day-weather`: all three findings in the served HTML.**
   - Data: the warming and wind tab headings (`getNugget('weather.warming')` and `getNugget('weather.wind')`, `components/analysis/pages/RaceDayWeather.tsx:60`, rendered at line 70) and the sentence under each (line 63, shown under the guard at line 69). All four are built today and sit only in the script payload.
   - Change: `components/analysis/TabTitle.client.tsx:31` renders every tab's title and hides the unselected ones, as the panels already do.
   - Rules: no `#warming` or `#wind` ids (left out on purpose); no separate URLs (the owner merged them). Owner decision (design). Finding P1-2.

8. **`/methodology`: how to cite, what the Dataset is, and the limits before the calculations.**
   - Data: the DOI and repository URLs at `components/methods/MethodsDownloads.tsx:22-29`; the licence the page already states for the Figshare exports (line 72); the existing definition at `components/methods/MethodsDefinitions.tsx:144`.
   - Change: a "How to cite" line in Downloads; `identifier` or `isBasedOn` on the Dataset node, or a second node for the race records; Limits and Downloads moved ahead of Calculations (ids unchanged); one sentence naming "negative split" beside the equal-distance definition.
   - Rules: all of it belongs on this page by rule 15; no release tag or date in the citation line (rule 17); no licence on the aggregate files until the owner chooses one (`docs/SEO.md:318`); no measured halfway split implied (rule 12). The DOI on the page has no version and the access document records none for the adopted release, so the owner names the identifier before it goes into the markup (P1-8). Findings P1-8, P2-1 and P2-9.

9. **More goal pages: 3:15, 5:30, 6:00, and 2:30.**
   - Data: `public/data/insights/tools/pace-band/all/all.json` (one group per minute from 2:30 to 6:30) and `public/data/insights/finish-times.json` (the marks); these four pass both checks a goal page reads (release `master-20261103b`, as in the checkout).
   - Change: `GOAL_PAGE_MINUTES` at `lib/tools/pace-chart.ts:89`; the lists, share cards and sitemap follow from the constant.
   - Rules: the recorded limit is against mass-produced pages (`docs/SEO.md:77`), so a few round goals, never one per minute. 3:45 and 2:45 would drop their bunching section (rule 13). Owner decision. Finding P1-14.

10. **`llms.txt`, generated (optional).**
    - Data: `sitemapEntries()` and the metadata functions each page already uses.
    - Change: a static route that lists the hub, story and analysis pages with their titles and descriptions and points to `/methodology`.
    - Rules: generated, never typed, so every number keeps its guard (rule 13); a new banned-word check for the file (rule 17). No engine is known to me to read it. Finding P1-11.

### Considered and not proposed

- **A page for "average marathon time by age" or "by country".** `/finish-times` has no such table in served text and I found no file behind one; ages are bands at best and rule 12 bars inferring exact ages. Not checked further.
- **Pages titled for "negative split", "good marathon time", "first marathon" or beginners.** No measured halfway split, no judgement of "good" and no first-timer flag exist in the data (rule 12). The compliant forms are proposals 1 and 8.
- **`FAQPage`, `HowTo` or `SoftwareApplication` markup.** A policy warning in `scripts/verify-seo.cjs:488`, and Google shows FAQ results only for a narrow set of sites.
- **Separate URLs for warming and wind.** The owner merged them into tabs; proposal 7 serves the text without undoing that.
- **Named robots groups for AI crawlers.** A named group stops obeying the `*` group, so the runner-folder disallows would no longer bind that crawler (P1-10).
- **A second methods URL** to shorten `/methodology`. Rule 15 keeps methods on one page.
- **A visible "Updated" date** on data pages. For a data page it is the release's date, which rule 17 keeps out of visible copy.
- **Coverage figures in page copy** ("4.2 million finishes") for authority. Rule 15 keeps them on `/methodology`; titles and descriptions already carry the one figure the owner allows there.
- **A feed.** Nine stories and no publishing rhythm.
- **Chart PNGs as share images.** They are 1080 by 1350, portrait (`scripts/build-chart-cards.cjs:23`); a share card needs its own 1200 by 630 render (proposal 4).
- **Indexing `/runners` or pages for single runners.** They are held `noindex, follow` as personal pages by design (`lib/seo-routes.ts:35-38`), and the policy check fails `ProfilePage` markup (`scripts/verify-seo.cjs:487`). Not examined further.

## Already good, keep

Each line was recounted from the saved crawl on 2026-11-09 unless it says otherwise. The command is `node $D/scripts/recount.cjs $D/crawl.tsv` where none is given.

- **Every sitemap URL is indexable and unambiguous.** All 182 answer 200 with a self-canonical and `index, follow, max-image-preview:large`. Each has one title, one description and one H1, and all 182 of each are distinct.
- **Titles fit.** 32 to 60 characters, median 55, none over 60. Descriptions: median 128 (the two over 155 are P2-3).
- **Language, viewport and share markup on every page.** `lang="en"`, one viewport tag and `summary_large_image` on all 182, with 182 distinct `og:image:alt` texts. 64 pages have a share card of their own.
- **Hosts and paths resolve one way.** http to https, `www` to the apex and a trailing slash each answer 308; an unknown path, an upper-case path and a `.html` path answer a real 404 whose page carries noindex; every path redirect in `vercel.json` answers 308 (`$D/raw/step2/hosts.txt`, `$D/raw/step2/redirects.txt`). The one exception is P0-1.
- **Query strings do not create duplicates.** Four tool URLs with visitor values in the query canonicalise to the bare path (`$D/raw/step5/query/`), and `/runners?q=x` carries `x-robots-tag: noindex, nofollow` (`$D/raw/step2/special.txt:90-98`).
- **Personal and form pages stay out of the index by design.** `/runners`, `/your-race`, `/request-analysis` and `/report` carry `noindex, follow`, declare no canonical and are not in the sitemap (`lib/seo-routes.ts:38`; `$D/raw/step2/pages/`).
- **Sitemap dates are not the build clock.** All 182 entries have a `lastmod`; 171 carry 2026-11-05, 8 carry 2026-10-08, 2 carry 2026-10-19 and 1 carries 2026-10-31. On the nine stories the Open Graph modified time equals the sitemap date, and the published dates differ by story (2026-10-07, 10-17, 10-30).
- **Numbers in metadata are on the page.** 141 pages quote a number in the title or description; on 136 every such number is in served `<main>` text (`node $D/scripts/ssr-numbers.cjs $D`). Three of the five exceptions are the "4.2 million" coverage figure, which rule 15 keeps off those pages on purpose; the other two are P1-4 and P2-3.
- **The definition engines need is early and in served text.** `/methodology` opens on the short version, and the sustained-slowdown definition, with its DOI citation as a link, starts at word 3,469 of 39,758 (`node $D/scripts/anchor-offsets.cjs $D/raw/pages/splithappens.run_methodology.html sustained-slowdown`). 52 links to the page use "sustained slowdown" as their anchor text.
- **Findings as H1s.** Stories and analyses state their finding in the H1, which is the sentence an engine quotes (one exception, P2-10 note 2).
- **Internal links are clean.** No broken link, no orphan, no `nofollow`; every page is within three clicks (`node $D/scripts/depth.cjs $D`: depth 0, 1 page; 1, 19; 2, 56; 3, 106; unreached 0). 21 URLs are linked from at least 170 pages.
- **Crawlers are let in, and the right files are kept out.** `robots.txt` is one wildcard group that disallows only the two runner data folders and names the sitemap. Nine user agents, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, CCBot, bingbot and Googlebot among them, each got 200 and the same 149,329 bytes on `/finish-times` (`$D/raw/step8/ua.txt`). No page sets a snippet limit. `/data/*`, the `.txt` page payloads and `/version.json` carry `x-robots-tag: noindex`.
- **Caching and weight.** Hashed assets are `public,max-age=31536000,immutable`; HTML revalidates, so a deploy shows at once. The home page loads 129,382 bytes of JavaScript in 13 files and 30,253 bytes of CSS in 3 files, as compressed on the wire (`$D/raw/step6/assets_.tsv` joined with `$D/raw/step6/asset-sizes.tsv`); a further 32,681-byte script is marked `nomodule`, for old browsers only. Fonts are the exception to the caching (P2-4).
- **Headers.** `Referrer-Policy: strict-origin`, HSTS, `etag` and `last-modified` on all 182 pages (`grep -l -i '^referrer-policy' $D/raw/pages/*.headers | wc -l`, and the same for the other three).
- **A verifier already enforces most of this.** `scripts/verify-seo.cjs` checks canonicals, robots tags, banned words, the JSON-LD policy, breadcrumbs and methods anchors. Extend it for the fixes in this report; do not add a parallel check.

## What I did not check

**Search engines and answer engines**

- Whether Google or Bing has indexed any page, and for which queries. No Search Console or Bing Webmaster access; the web search tool is neither engine.
- Whether any answer engine quotes the site today, and how.
- Whether engines read text in hidden tab panels, text inside the inline script payload, or `llms.txt`.
- Where any engine stops reading a long page. Google's own page on the HTML size limit was not read (P2-10 note 4).
- Whether ChatGPT search and Copilot depend on Bing's index. Reported in trade sources, not confirmed.
- Search volumes. Demand statements rest on 10 web searches and are marked "inferred".

**Rendering and validation**

- Anything that needs a browser: rendered layout, Core Web Vitals, Lighthouse, whether the visible page matches the served HTML after hydration.
- Google's Rich Results Test and the schema.org validator. JSON-LD was parsed and read, not validated by a third party.
- How the share cards look in each network's preview. One card was opened (`$D/raw/final/analyses-card-live.png`).

**Proposals**

- No proposal was built. Each "safe mechanical change" is safe as a judgement from reading the code, not from a passing build.
- Whether the explicit `/` redirect in P0-1 works on Vercel as written, and whether the old `.vercel.app` host can instead be redirected in Vercel's domain settings.
- Whether a route named `llms.txt` exports under the static export (P1-11).
- Whether `onset.values.rate` and `study.rate` are the same number in the same unit (P1-4).
- Which verifier recounts `/finish-times`, and whether an added sentence there needs a new recount (P1-3).
- Whether an added link on a course page trips `verify-courses --html` (P1-5).
- What `verify-analytics`, `verify-chapters` and `scripts/e2e/browser.cjs` assert about crumbs and structured data (P1-6, P2-2).
- Whether a verifier pins the tool descriptions, the number of goal pages or the order of `/methodology`'s parts, beyond the greps reported in those findings.
- The half panel and the other guards on the four candidate goal pages; I checked the two data conditions `goals.cjs` reads (P1-14).
- The H1 source of five stories, and whether the H1 of `/stories/half-to-full` is a rule-13 fallback (P2-10 note 2).

**Outside the two hosts**

- The Instagram account: its handle, and whether its profile links to the site (P1-7).
- The Figshare record and what `doi.org` resolves to (P1-8). Neither host was contacted.
- GitHub: the repository's About link (`docs/SEO.md:309`), and whether `analysis/ACCESS.md` on its `main` still reads as in the frozen checkout (P2-10 note 6).
- Vercel's firewall and bot settings. My requests came from this session's network, not from crawler addresses, so a rule keyed on address would not show.

**Coverage**

- Only the 182 sitemap URLs were parsed. The 205 other site URLs they link to (101 chart images, 102 data files, `/runners` and `/request-analysis`) were status-checked, all 200 (`$D/raw/step5/nonsitemap-status.tsv`), not read.
- Not every file type under `/data/` was fetched.
- Scenario specs S1 and S6 were read only as far as the footer comment.

## Appendix: files and commands

```
D=/tmp/scratchpad/review/seo
```

- `$D/REPORT.md`: this report. `$D/parts/`: its ten source parts.
- `$D/crawl.tsv`: one row per sitemap URL, 45 columns (status, canonical, title, description, Open Graph, headings, JSON-LD types, word counts, sitemap date, cache headers).
- `$D/raw/pages/`: the body, response headers and curl error file of each of the 182 pages, fetched 19:33:05 to 19:33:25 UTC. The home page is `splithappens.run.html`; others are `splithappens.run_<path with underscores>.html`.
- `$D/raw/robots.txt`, `sitemap.xml`, `urls.txt`, `fetch-log.tsv`; parsed: `jsonld.json`, `links.json`, `text.json`, `inbound.json`, `hashlinks.json`, `charts-meta.txt`.
- `$D/raw/step2/` hosts, redirects, special files; `step5/` links outside the sitemap and query-string pages; `step6/` asset sizes; `step7/` response headers of both hosts; `step8/ua.txt` the user-agent test; `final/` the 404 page, three HEAD responses, one share card, `script-share.tsv` and `refs.txt` (the output of `refs.cjs` for this report).
- `$D/raw/summary-*`, `segment-*`, `tx-index*` and `scripts/tx.cjs` are my working notes, not evidence.

Outputs quoted under commands in this report are abridged. Scripts in `$D/scripts/` read saved files only, unless marked "network":

| Script | Usage |
| --- | --- |
| `fetch.sh` (network) | `fetch.sh URL OUTDIR` |
| `probe.sh`, `head.sh`, `asset-size.sh` (network) | `probe.sh URL [curl args]`; `head.sh URL`; `asset-size.sh URL OUTDIR` |
| `parse.cjs` | `node parse.cjs $D` builds `crawl.tsv`, `links.json`, `jsonld.json` |
| `recount.cjs` | `node recount.cjs $D/crawl.tsv` |
| `phrase.cjs` | `node phrase.cjs $D <phrase> [...]` counts pages by main text, headings, title, description |
| `in-main.cjs` | `node in-main.cjs $D <url-path> <phrase>...` |
| `outside-script.cjs` | `node outside-script.cjs <html-file> <phrase>...` |
| `context.cjs` | `node context.cjs <html-file> <chars> <phrase>...` |
| `ssr-numbers.cjs` | `node ssr-numbers.cjs $D` |
| `script-share.cjs` | `node script-share.cjs <html-file> [...]` |
| `anchor-offsets.cjs` | `node anchor-offsets.cjs <html-file> [<id> ...]` |
| `headings.cjs` | `node headings.cjs $D` |
| `crumbs.cjs` | `node crumbs.cjs $D [<url-path> ...]` |
| `dataset.cjs` | `node dataset.cjs <html-file>` |
| `aeo.cjs` | `node aeo.cjs $D <words> <url> [...]` |
| `links.cjs`, `links2.cjs` | internal link graph from the saved pages |
| `depth.cjs`, `sitewide.cjs`, `inbound-of.cjs` | `node depth.cjs $D`; `node sitewide.cjs $D <min>`; `node inbound-of.cjs $D <path-or-regex>...` |
| `assets.cjs` | `node assets.cjs $D <path>` |
| `chart-words.cjs` | `node chart-words.cjs $D <word>...` |
| `course-elev.cjs`, `course-promises.cjs`, `course-sections.cjs`, `course-words.cjs` | `node <script> $D [<word>...]` |
| `goals.cjs` | `node goals.cjs $R/public/data/insights/tools/pace-band/all/all.json $R/public/data/insights/finish-times.json` |
| `lines.cjs` | `node lines.cjs $R '<relpath>:<from>-<to>' ...` |
| `refs.cjs` | `node refs.cjs $D/REPORT.md $R [width]` prints the checkout line or lines behind every backticked file-and-line reference in this report |
