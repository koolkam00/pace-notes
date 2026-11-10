> **Copy of a reviewer's report.** This file is the code, data architecture and engineering reviewer's report on the repository behind https://splithappens.run, written on November 9, 2026 against commit `068b6c370`. It is a reviewer's claim, not a measured record of this repository: its claims were not all tested, and [REVIEW.md](REVIEW.md) says which were and what the second read found. Where the report says "verified", that is the reviewer's word for its own tests.
>
> Paths beginning `/home/user/pace-notes-review/` mean this repository at that commit. Paths under `/tmp/` were the review's working folder (screenshots, crawl output, scripts); it is not kept.
>
> The copy was made by a script and was not retyped (1,273 lines, 210,727 bytes in the source). The script strips trailing spaces, shortens the working folder's path to `/tmp/scratchpad` (2 places), and writes a Markdown link whose target does not resolve from this folder as a code span with a space between its two parts (one in this file). A dummy analytics key name is not copied (a note in brackets marks the place), and in one search command of the appendix three key prefixes are written with one letter in brackets, which matches the same strings.

---

# Pace Notes: code, data architecture and engineering health

Independent review of the repository behind https://splithappens.run, written for the lead agent.

- **Reviewed copy:** `/home/user/pace-notes-review` at `068b6c3700f7201b78d13698c1838c515b21a32c` (`main`, #91). Nothing in it or in `/home/user/pace-notes` was edited.
- **Production at review time** (read 2026-11-09 20:15 UTC): `https://splithappens.run/version.json` gave `sha 068b6c37…`, `ref main`, `builtAt 2026-11-05T20:24:05.684Z`; `/data/live.json` gave `release_tag master-20261103b`, `as_of 2026-11-05T16:39:47Z`, `n_records 5388605`, `eligible_finishes 4222246`. The reviewed commit is the deployed one.
- **Method:** read-only. `npx tsc --noEmit`, `npx eslint` (with a scratch config, because the repository has none), `npm audit --omit=dev` and `npm outdated` were each run once. `curl` was used against `splithappens.run` for headers and transfer sizes. No build, no `verify:*`, no Playwright, no Python that reads downloaded data, no GitHub API.
- **Two counts in the brief differ from the checkout:** there are 13 workflow files, 11 of them outside the autopilot (`ls .github/workflows | grep -v '^autopilot' | wc -l` gives 11), not 15 and 13.

## How to read a finding

Each finding carries the same fields.

- **Status** is *Verified by me* (with the command or the lines I read) or *Inferred* (reasoned from what I read, not measured).
- **Fix type** is one of three, because some fixes are neither of the two the brief names:
  - *Mechanical*: a safe code or document change; the file and the exact change are named.
  - *Engineering, needs a rebuild*: no owner decision is needed and no published number or floor changes, but the fix changes a data contract or the toolchain, so the pipeline (or at least a build and the verifiers) must run before it merges.
  - *Owner decision*: it changes what visitors see, what the project promises, or a check that the handoff says the owner approves (owner item 12, `docs/PROJECT_HANDOFF.md:37`).
- **Effort:** S is under an hour, M is a day or less, L is more.
- **Units.** Folder and Git-object sizes (section 1, P1-4, P1-5) are binary, as `du` and Git print them: 1 MB is 1,048,576 bytes. Sizes of single files and of transfers, and every figure in KB (P0-1, P0-2, P1-10 and the P2 findings), are decimal: 1 MB is 1,000,000 bytes and 1 KB is 1,000 bytes, except where "MiB" is written. The byte count is given wherever a decision depends on a size.

Every scratch script and raw output named below is in `/tmp/scratchpad/review/arch/`.

## Contents

1. Architecture as it is (one page)
2. P0: broken or risky now (3 findings)
3. P1: high value (10 findings)
4. P2: polish (18 findings)
5. What is good: keep
6. Quick wins (each under an hour)
7. What I did not check
8. Appendix: commands to re-run

---

## 1. Architecture as it is

```
 OWNER'S PUBLIC RELEASES (GitHub Release assets, each pinned by sha256)
   marathon results   master-20261103b        pin: analysis/release.json (tag, layout: master, digests, overlays, baseline)
   weather and routes dataset-20261103-0706   pin: analysis/weather-release.json
   half marathons     snapshot + person IDs v4  pin: analysis/half-release.json + analysis/half-policy-*.json
        |
        |  analysis/download_release.py, download_half.py: verify every digest, reject unsafe members, write provenance.json
        v
   analysis/adapt_master.py   master layout -> the canonical raw/feature tables the builders read
        |
        v
 PYTHON PIPELINE  analysis/  (114 .py: 87 top-level with 24,407 lines; duckdb 1.4.4, pandas 3.0.5, numpy 2.5.3)
   builders   build_* (16)  charts_* (14)  insights_* (13)  half_* (10)    source_quality.py = the reviewed edition policy
   importers  import_packs, import_personalized, import_runner_context, import_public_explorer
   tests      18 files, 256 test methods, synthetic data only
        |
        v
 COMMITTED GENERATED DATA  public/   808.1 MB, 8,971 files
   public/data/runners              474.0 MB  name index 3,790 gz shards (140.2 MB), profiles 4,096 gz shards (332.9 MB), manifest.json
   public/data/packs                259.9 MB  34 ext_* packs; ext_personalized_guide alone is 259.1 MB in 58 files
   public/data/insights              19.2 MB  per-page and per-tool JSON (315 files)
   public/data/runner-context        18.8 MB  one gz shard per edition, plus manifest (300 files)
   public/data/all-finisher-context  14.2 MB  one file, evidence.json
   public/data/fast-start, half, charts, study, weather, live.json: about 3 MB together
   public/charts 15.1 MB (card PNGs)   public/og 3.4 MB   public/fonts 0.5 MB (13 woff2)
        |                                              |
        | BUILD TIME                                   | RUN TIME (browser)
        | 20 server modules read these files with fs;  | lib/data-fetch.ts dataFetch(): 9 call sites in 7 modules; every URL
        | the pins are imported as JSON                | carries ?v=<sha256 or release>; large files are checked for byte
        v                                              v length and sha256 before they are parsed
 NEXT.JS 14.2.5 APP ROUTER, output: 'export'  (static files only: no Next server, middleware, API routes or image optimizer)
   app/         39 page.tsx, 24 layout.tsx, 7 dynamic segments, 57 CSS files (6,324 lines); error.tsx and global-error.tsx at the root only
   components/  215 files; 81 'use client' files across app, components and lib; the seven tool components are 541 to 949 lines each
   lib/         127 files: data readers, nuggets (numbers for copy), tools (calculators), seo, analytics and replay policy
   Pattern: the server renders the default answer from the data file; the client fetches the table only when the visitor's
   selection moves away from that default.
        |
        v
 VERCEL (Git integration; vercel.json holds trailingSlash, redirects and five header rules)  ->  splithappens.run
   HTML: max-age=0, must-revalidate.  /_next/static/*: one year, immutable.  /data/* and /fonts/*: max-age=0, must-revalidate.

 CHECKS
   scripts/verify-*.cjs  32 scripts, 14,279 lines; npm run verify:data chains 28 of them. They recount published numbers from the
                         committed files with independent Node code (scripts/charts 3,648 lines; scripts/half, scripts/nuggets and
                         scripts/lib 3,609 lines) and render real components to HTML.
   scripts/e2e           Playwright scenarios: privacy (s2), runner journey (s3), visit signals (s6), first-load budget (s8 + budget.json)
   GitHub Actions        site-validation (every pull request, every push to main): verify:data, verify:analytics, verify:compat,
                         verify:autopilot, build (Next's own type check runs inside it), verify:seo, plus a privacy end-to-end job.
                         half (pull request and push, path-filtered). Nine data workflows (pull request and manual, path-filtered;
                         pacing-analysis also on a published release) rebuild one family and compare it with the committed
                         output: six download a release bundle first; charts, fast-start and all-finisher-context (and the
                         stories in insights) rebuild from the committed lookup shards, which are a second-stage input.
   In no job             eslint (no config file exists, so the build skips it too), the Python suite on main, og:check, the
                         verify:css self-test, the font checks, the --html modes of two verifiers (P1-3).
```

**Three ways a page gets data, used consistently.** (1) `fs` reads at build time in 20 server modules; (2) JSON imports of the pins (`analysis/release.json` is imported at `lib/extension-data.ts:2`, among others); (3) runtime `fetch` through one wrapper, `lib/data-fetch.ts` (19 lines), which reports failures to analytics. `git grep -n -E "[^a-zA-Z_.]fetch\(" -- app components lib | grep -v -E "dataFetch\(|lib/data-fetch.ts"` prints nothing: no component fetches data on its own. The weak points are not the pattern but two things inside it: the size of some runtime files (P0-1, P0-2) and the naming of the server modules (P2-10).

**Where the weight is.** 98% of `public/` is generated data (`.gz` 491.9 MB in 8,185 files, `.json` 297.0 MB in 557 files, `.png` 18.5 MB in 173). The Git object store is 3.12 GiB for 99 refs and 787 commits; `main` alone (108 commits) reaches 2,828.4 MB of blobs, of which `public/data/runners` is 2,609.5 MB, or 92% (P1-4).

**Client and server.** 81 of 409 TypeScript files under `app/`, `components/` and `lib/` start with `'use client'`. First load is in good shape: the shared shell is 145,100 gzip bytes on a stub page and the heaviest page (`/analyses/pacing-pattern`) is 196,356 (`scripts/e2e/budget.json`); recharts is in no shipped page (P1-6), PostHog and its recorder load lazily (`lib/analytics.ts:139-162`), and the tool libraries reach client components as props from server pages.

---

## 2. P0: broken or risky now

None of the three is an outage. The first two are classed P0 because an ordinary action by a visitor (searching a common first name; changing one control on an analysis page) downloads and parses far more than a phone on mobile data can be expected to handle. The third is classed P0 because this repository is run by agents that read its documents as the state of record, and at least 31 lines in those documents are false at the commit production serves.

### P0-1. Runner search downloads a 3.4 MB to 6.6 MB compressed index shard for the most common name prefixes

- **What.** A search loads one index shard, chosen from the first three characters of the *longest* word typed (`lib/runner-search.ts:122-124`). Shards are buckets of a hash of that three-character prefix, so their size follows how common the prefix is. Most are small, but the common prefixes are very large, and the builder also indexes the nationality code at the end of each recorded name as if it were a word (`analysis/build_runner_lookup.py:131` splits the whole normalized name into tokens), which creates the largest shards of all.
- **Evidence.**
  - Sizes of the 3,790 index shards, from `public/data/runners/manifest.json` (`shards[path].bytes`): minimum 102 B, median 4,615 B, 90th percentile 88,871 B, 99th percentile 526,299 B, maximum 6,591,800 B (quantiles by lower rank; the command is in the appendix). Ten shards are over 1,000,000 B, eight of them over 1,048,576 B.

    | Shard | Prefix | Compressed bytes | Raw JSON bytes | Rows |
    | --- | --- | --- | --- | --- |
    | `index/5fc` | `usa` | 6,591,800 | 29,917,199 | 524,342 |
    | `index/516` | `mar` | 3,438,714 | 14,144,118 | 253,447 |
    | `index/214` | `gbr` | 2,620,561 | | |
    | `index/f59` | `ger` | 2,563,092 | | |
    | `index/aca` | `fra` | 1,206,254 | | |
    | `index/2b2` | `car` | 1,163,989 | | |
    | `index/620` | `and` | 1,080,404 | | |
    | `index/41c` | `ste` | 1,072,251 | | |
    | `index/943` | `chr` | 1,041,847 | | |
    | `index/224` | `mic` | 1,001,340 | | |

  - The live site serves `index/5fc.json.gz` as `application/gzip` with `content-length: 6591800` (it is already compressed, so the CDN cannot shrink it further).
  - In Node 22.23.4 on this machine, the `mar` shard takes about 50 ms to gunzip and 170 to 200 ms to parse; the parsed rows hold 45 MB of V8 heap, 73 MB while the 14,144,118 B of text is still held (three runs of `parse-cost.cjs`, scratch folder; the command is in the appendix). After that the client normalizes every row's name to test it (`lib/runner-search.ts:129-134` calls `runnerNameMatches` for each of the 253,447 rows).
  - `index-codes.cjs` (scratch folder) recounted the index: 1,372,593 of 10,701,950 rows (12.8%) exist only because of a trailing country code (`usa` 524,161, `gbr` 226,683, `ger` 182,882), about 18,385,784 B of the index's 147,017,212 B (12.5%; an estimate made by compressing each shard again without those rows). Without them `5fc` would be 3,140 B, `214` 206 B and `f59` 303,046 B; six shards would stay over 1,000,000 B and `516` (`mar`) would stay at 3,342,007 B.
  - A related cost on the same page: `/runners` loads `public/data/runners/manifest.json` when it opens (`components/RunnerSearch.tsx:232-242`). The file is 926,144 B, of which 892,432 B is the map of 7,886 shard digests, and it is 341,278 B on the wire with brotli (`curl -H 'accept-encoding: br'` on the live URL). That is about twice the page's own initial JavaScript (177,760 gzip bytes in `scripts/e2e/budget.json`).
- **Status.** Verified by me (sizes read from the manifest and from `stat`; the live `content-length` by `curl -sI`; Node timings and heap by `parse-cost.cjs`; the recount by `index-codes.cjs`). Timing and memory on a phone are **not** verified. How often visitors search these prefixes is unknown by design: typed search text never reaches analytics (AGENTS.md rule 18).
- **Why it matters.** "Maria", "Mark", "Martin", "Marie", "Marco" and every other name starting with `mar` cost 3.4 MB of transfer and a 14 MB parse before the first result. On mobile data that is many seconds, and the shard cache holds three parsed shards (`lib/runner-search.ts:115`). Runner search is one of the two entry points the home page offers.
- **Proposed change, in three tiers.**
  1. **Client only, no data change (Mechanical, S).** In `lib/runner-search.ts:122-124`, instead of the longest token, compute the shard path of every token of three or more characters, keep those listed in `manifest.shards`, and load the one with the fewest `bytes`; if none is listed, fall back to the present rule. The result is identical: line 131 of the builder puts a name in the shard of the first three characters of each of its words, and `runnerNameMatches` (lines 64-69) requires every typed token of three or more characters to start a word of the name, so every match is in the shard of each such token. The bytes are already in the manifest the client holds. Measured on real shards (MiB of compressed transfer, before to after): "martin smith" 3.28 to 0.15; "mark lee" 3.28 to 0.17; "anna maria rossi" 3.28 to 0.38; "david martin" 3.28 to 0.72; "stephen king" 1.02 to 0.09; "christian mueller" 0.99 to 0.10; "michael johnson" 0.95 to 0.60. Single-word searches are unchanged ("maria" still 3.28, "usa" 6.29).
     - The existing verifier keeps passing if shards missing from the manifest are skipped rather than treated as "no result": `scripts/verify-runner-search.cjs:242` searches `'jos smi'` against a test manifest that lists only the `jos` shard. Add one assertion that a two-token query requests the smaller of two listed shards (a strengthening, allowed by rule 23). `analysis/README.md:191` ("A query loads one bucket and requires every query token to match") stays true; no document states the longest-token rule.
     - By the same reading, tokens of one or two characters are valid candidates too (line 68 requires an exact word, whose three-character prefix is itself). I did not measure that variant; treat it as inferred.
  2. **Stop indexing the trailing nationality code (Owner decision).** It removes 12.8% of the index rows and the three largest shards. It also changes behaviour: a search for only "usa" would no longer list that country's runners. `index_rows` in the manifest changes, so rules 19 and 21 apply, and the lookup must be rebuilt with the public-explorer workflow.
  3. **Sub-shard the heavy buckets (Engineering, needs a rebuild; M).** Bucket on the first four characters where a three-character bucket exceeds a size limit, declared in the manifest so the client knows which to ask for. Builder (`analysis/build_runner_lookup.py:128-134`), client, `scripts/verify-runner-search.cjs`, `scripts/verify-public-explorer.cjs` and `analysis/README.md` change together. In the same rebuild, split the manifest's digest map (for example one small file per first hex character, each named with its own digest in the head) so opening `/runners` no longer costs 341 KB; the per-shard sha256 check must stay exactly as strong.
- **Fix type.** Tier 1 Mechanical; tier 2 Owner decision; tier 3 Engineering, needs a rebuild.
- **Effort and risk.** Tier 1: S, low risk (one function, results provably the same, verifier covers it). Tier 3: M, medium risk (a data contract with three verifiers).

### P0-2. Analysis pages parse 12 MB to 55 MB JSON tables in the browser after one change of a control

- **What.** The explorers render their default answer on the server and fetch a whole table when the visitor changes the selection. Three of those tables are far too large for that.
- **Evidence.**
  - **Checkpoint tables.** `public/data/packs/ext_personalized_guide/tables/checkpoint_00.json` (All courses) is 54,847,498 B; its brotli transfer from the live site is 2,984,748 B; in Node 22.23.4 on this machine `JSON.parse` takes 0.21 to 0.27 s, and the parsed table holds 116 MB of V8 heap, 170 MB while the text is still held (three runs of `parse-cost.cjs`, scratch folder; the command is in the appendix). The 28 checkpoint tables total 226.7 MB (median 3.66 MB; 8 over 5 MB: this one, New York `checkpoint_17` 44.8 MB, Washington `_27` 23.5, Berlin `_05` 21.7, Paris `_19` 12.6, Chicago `_07` 7.9, Frankfurt `_11` 7.0, London `_15` 5.1).
    - Trigger: `components/CheckpointExplorer.tsx:56-57` defines `isInitial`, and the effect at lines 72-80 skips the fetch only while it holds. The default profile is All courses with a 4:00 goal (`lib/analysis-profile.ts:5`), so on `/analyses/checkpoint` the first change of goal, checkpoint or elapsed time downloads and parses the 54.8 MB file. The loader keeps three parsed tables (`lib/analysis-aggregates.ts:19`).
    - Shape (measured): top-level keys `city, rows`; 21,426 rows with keys `age, cdf, cdf_min, checkpoint, editions, elapsed, finish, gender, late, n, pace, retention, trend`. The `cdf` arrays (631 integers each) are 50,292,576 B, **91.7% of the file**. Of their 13,519,806 entries, 3,672,522 are zero and only 1,114,069 (8.2%) are change points: the first entry of each of the 21,426 arrays plus the 1,092,643 entries that differ from the entry before them. The client reads one entry per row: `row.cdf[target - (row.cdf_min ?? 150)]` (`lib/personalized.ts:33-35`).
  - **City tables.** 28 files, 44.7 MB; `city_00.json` is 12,167,171 B (in Node: parse about 0.1 s; the parsed table holds 22 MB of heap, 34 MB with the text). Trigger: `components/AnalysisExplorer.tsx:231-239`, on six pages (`components/analysis/pages/FindingImprovement.tsx`, `PacingPattern.tsx`, `AgePacing.tsx`, `FinishContext.tsx`, `WhereTime.tsx`, `HillsPacing.tsx`).
  - **All-finisher evidence.** `public/data/all-finisher-context/evidence.json` is one file of 14,868,380 B (brotli transfer 3,277,433 B; in Node: parse about 0.1 s; the parsed value holds 21 MB of heap, 50 MB with the text). `lib/all-finisher-context.ts:103-114` reads it whole, hashes it and parses it; `components/AllFinisherAnalysis.tsx:255-260` loads it when the selection leaves the default, on three pages (`components/analysis/pages/CourseComparison.tsx:32`, `DownhillStart.tsx:82`, `RaceDayWeather.tsx:47`). Its 1,362 rows each carry four blocks; by bytes `editions` is 9.36 MB (63%), `downhill` 2.41, `weather` 1.12, `courses` 1.04. Each page uses one kind and downloads all four.
- **Status.** Verified by me (sizes by `stat`; transfer sizes by `curl -H 'accept-encoding: br'`; the shape, the redundancy and the re-encoded sizes by Node one-liners over the committed file, given in the appendix; the triggers by reading the lines cited). Behaviour on a phone (time, memory, whether the tab is discarded) is **not** verified; the Node figures are a floor, not a measurement of a browser.
- **Why it matters.** A 3 MB download followed by a 55 MB parse and well over 100 MB of heap is the kind of load that makes a mobile browser stall or reload the tab, and it happens on the first interaction with the page's main control. The transfer is small only because the JSON is extremely repetitive, which is itself the signal that the encoding is wrong.
- **Proposed change.** All lossless; no published number, floor or guard changes.
  1. **Split the checkpoint table by checkpoint** (the `checkpoint` field has three values): one file per course and checkpoint. The client already knows the checkpoint before it fetches. This alone cuts each download and parse to about a third.
  2. **Store each `cdf` as change points** (pairs of index and value, or pairs of value and run length) and read the entry in `lib/personalized.ts:33-35` with a short scan or a binary search (an array has 52 change points on average). Measured by re-encoding the committed All-courses file in memory (command in the appendix): the `cdf` payload goes from 50,292,576 B to 8,901,257 B as index and value pairs (5.7 times smaller) or to 6,854,847 B as value and run-length pairs (7.3 times smaller). Together with the split, the All-courses request drops from 54.8 MB to between 3.4 and 4.0 MB of JSON, depending on the checkpoint, with run lengths (3.9 to 4.8 MB with index pairs). These are sizes of a re-encoding, not of a built file.
  3. **Split `evidence.json` by kind** (`courses`, `weather`, `downhill`), with `editions` in its own file or per group, each named with its own sha256 in the manifest so the present digest check stays.
  4. Files: builder `analysis/build_personalized.py:24,49-77,238-240`; importer `analysis/import_personalized.py:27-34,66,105,123`; client `lib/analysis-aggregates.ts`, `lib/personalized.ts`, `lib/personalized-types.ts`; verifier `scripts/verify-personalized.cjs:14` (add an assertion that the decoded value equals the builder's dense array for sampled rows, so the check gets stronger, not weaker); for the all-finisher file `analysis/build_all_finisher_context.py`, `lib/all-finisher-context.ts`, `scripts/verify-all-finisher-context.cjs` and its client verifier; contract documents `docs/TOP_TEN_ANALYSES.md` and `docs/ALL_FINISHER_ANALYSES.md` (rule 19).
- **Fix type.** Engineering, needs a rebuild. Not an owner decision: the numbers shown do not change. It needs the personalized and all-finisher builders to run on the adopted release, so it cannot be done by editing the committed files.
- **Effort and risk.** M to L. Risk medium: three verifiers and two workflows bind these files, which is also what makes the change safe to prove.
- **Interim measure (Mechanical, S), if the rebuild has to wait:** none that I would recommend. Lowering what is loaded by changing what the page shows would be a product change, and warning text before a download is copy the owner has not asked for.

### P0-3. Contract documents state, as current, a repository and production state that is no longer true

- **What.** #89 (adopting `master-20261103b`), #90 (the distance label) and #91 (identity on `person_id`) are merged and deployed. At least thirty-one lines in fifteen documents, all outside `docs/history` and outside the documents' own archived sections, still say the adopted release is on an unmerged branch, that `main` or production uses `private-export-20261021-1050`, that the 1050 refresh record, outputs, cohort or edition policy are the current ones, or that a merged change is "not merged" or "not deployed"; two of them list the releases a code constant holds and leave the adopted one out. The pattern is structural: each branch wrote its own state into the contracts ("on `feat/x`, not merged"), which became false by the act of merging, and rule 19 defers the correction to "the next pull request" only for the handoff's Current state block.
- **Evidence.** Against all of them: `analysis/release.json:3` and `analysis/weather-release.json:3` name `master-20261103b`; `analysis/half-release.json` has `schema_version: 3`; `git merge-base --is-ancestor b35789b8a HEAD` succeeds; `components/tools/DistanceTag.tsx` (added by #90) is on `main`; production serves `068b6c37` (read 2026-11-09 20:15 UTC).

  | File:line | What it says | Why it is false at `068b6c37` |
  | --- | --- | --- |
  | `analysis/README.md:15` | "On the branch `feat/half-v4` (draft PR #89, not merged; November 5, 2026) both pins name `master-20261103b`" | #89 is `b35789b8a` on `main` |
  | `analysis/ACCESS.md:3` | "draft PR #89; not merged: production still uses `private-export-20261021-1050`" | production data is `master-20261103b` |
  | `analysis/ACCESS.md:46` | the schema 3 half pin is "the pin of the branch `feat/half-v4` ... not merged; `main` and production still read the first pin" | `main` pins schema 3 |
  | `docs/ALL_FINISHER_ANALYSES.md:31` | "On `feat/half-v4` (draft PR #89, not merged; November 5, 2026) the source is `master-20261103b`" | merged |
  | `docs/FAST_START_ANALYSIS.md:17` | "On `feat/half-v4` (draft PR #89) both were rebuilt ... (`runner_manifest_sha256` `8f593e05…`" | merged; and #91 rebuilt the lookup, so the digest quoted is the superseded one |
  | `docs/RUNNER_CONTEXT_AND_PEERS.md:5` | "On `feat/half-v4` (draft PR #89, November 4, 2026): `master-20261103b`." | merged |
  | `docs/OPERATIONS.md:244` | "On `main` that is `private-export-20261021-1050`" | `main` names `master-20261103b` |
  | `docs/WEATHER_ANALYSES.md:3` | "On `feat/half-v4` (draft PR #89, not merged)" | merged |
  | `docs/DATA_ARCHITECTURE.md:5` | "Branch `feat/half-v4` (draft PR #89, not merged; November 5, 2026): `master-20261103b`" | merged |
  | `docs/DATA_ARCHITECTURE.md:22` | "On the branch `feat/half-v4` (October 31, 2026, not merged); `main` still pins schema 2" | `main` pins schema 3 |
  | `docs/DATA_ARCHITECTURE.md:133` | "Adopted on `feat/half-v4` (draft PR #89), not merged" | merged |
  | `docs/KNOWN_ISSUES.md:7` | "The source on `main` and in production is `private-export-20261021-1050`" | both are `master-20261103b` |
  | `docs/KNOWN_ISSUES.md:39` | "branch `feat/half-v4`, not merged" | merged |
  | `docs/ANALYSIS_CATALOG.md:7` | "`private-export-20261021-1050` on `main` since October 22, 2026" | superseded on `main` |
  | `docs/HALF_MARATHON.md:12` | "The distance label ... is on `feat/cross-distance-label`, not merged." | #90 is `3bc2b26ef` on `main` |
  | `docs/HALF_MARATHON.md:13` | "The distance label is not deployed." | production is a descendant of #90 |
  | `docs/OWNER_DECISIONS.md:35` | status cell: "on `feat/half-v4` (not merged)" | merged |
  | `README.md:26` | "its counts are in the current refresh record, REFRESH_20261021_1050.md" | the current record is `docs/REFRESH_20261103b.md` |
  | `docs/PROJECT_HANDOFF.md:102` | "the current [1050 refresh]" | same |
  | `docs/DATA_ARCHITECTURE.md:3` | "The current refresh record is [REFRESH_20261021_1050.md]" | the current record is `docs/REFRESH_20261103b.md` |
  | `docs/DATA_ARCHITECTURE.md:42` | heading: "## Verified input (current: private-export-20261021-1050)" | the adopted input is `master-20261103b`; the heading's anchor is the target of a link at `docs/WEATHER_ANALYSES.md:25` |
  | `docs/DATA_ARCHITECTURE.md:79` | "`CANONICAL_ID_RELEASES` in `analysis/build_extended.py`: 1107, 0934, 1652 and 1050" | `analysis/build_extended.py:26-28` also holds `master-20261103b`, as AGENTS.md rule 9 says |
  | `docs/DATA_ARCHITECTURE.md:132` | release table, status of 1050: "Adopted (PR #78, merged October 22); current on `main`" | superseded on `main` by #89 (the next row, `:133`, is above) |
  | `docs/ANALYSIS_CATALOG.md:20` | "The runtime canonical join is enabled for the audited September 11 (1107), September 12 (0934), October 16 (1652) and October 21 (1050) releases" | the same constant: the adopted release is missing from the list |
  | `docs/ANALYSIS_CATALOG.md:26` | "(`RULES_1050` for the adopted release)" | `analysis/source_quality.py:219-224` maps `master-20261103b` to `RULES_MASTER_20261103B` (the document's own line 7 names it) |
  | `docs/ANALYSIS_CATALOG.md:837` | "The current calculation evidence is in [the 1050 refresh record]" | the current record is `docs/REFRESH_20261103b.md` |
  | `docs/FAST_START_ANALYSIS.md:3` | "The current ones bind `private-export-20261021-1050` (`[current outputs] (#current-outputs-1050)`)" | `public/data/fast-start/evidence.json` has `release_tag` `master-20261103b` (`as_of` 2026-11-05T16:51:36Z) |
  | `docs/FAST_START_ANALYSIS.md:15` | heading: "## Current outputs (1050)" | same; its anchor is linked at `docs/FAST_START_ANALYSIS.md:3` and `:131` |
  | `docs/TOP_TEN_ANALYSES.md:13` | under "## Current source and defaults": "Under `private-export-20261021-1050` (the engine calculated 2026-10-21T16:04:43Z) the engine holds 4,108,749 eligible finishes" | `public/data/packs/ext_personalized_guide/pack_meta.json` has `input_export_id` `master-20261103b` (`as_of` 2026-11-05T16:33:50Z); `grep -c master-20261103b docs/TOP_TEN_ANALYSES.md` is 0 |
  | `analysis/README.md:117` | "The adopted cohort on `main` (1050, from `cohort` and `source_quality` in `public/data/runners/manifest.json`, the same in every pack): raw 5,327,504 in 298 editions" | that file has `release_tag` `master-20261103b` and `cohort.raw` 5,388,605 |
  | `analysis/README.md:170` | the first half pin "is what `main` and production serve until that branch merges" | the branch merged as #89; `analysis/half-release.json` on `main` has `schema_version: 3` |

  How the rows were found, because it bounds what the table can claim. The first nineteen rows and `docs/DATA_ARCHITECTURE.md:3` contain one of ten phrases (`draft PR #89`, `not merged`, `not deployed`, `production still uses`, `current refresh record` and five more; the pattern is in the appendix). The other eleven contain none of them: they present the superseded release, or the superseded half pin, as current or adopted in other words, or leave the adopted release out of a list. They were found by two searches that follow headings and skip archived sections, and by reading the sections those searches pointed to. Two more lines of the first kind are in `docs/SEO.md:121` and `:126` (out of this review's scope; noted because the phrase search finds them).
  - **The repository's own sweep was not finished.** Release intake step 9 (`docs/OPERATIONS.md:164`) reads: "Sweep the documents for the previous release. Use `git grep -n -E "<previous tag>|<its headline counts>" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'`, then update each hit or label it with its release." Run today for 1050 (`private-export-20261021-1050|4,108,749|5,327,504`) that command prints 83 lines in 23 files, 73 of them outside archived sections. Most are labelled with their release ("under 1050") and need no change; the 31 above are the ones that present 1050, or a merged branch, as the present state.
  - **Three sections headed for the current release hold only the superseded release's measurements.** They are labelled with their release, so they are unswept rather than false, and only the third is in the table (for its present-tense sentence): `docs/ALL_FINISHER_ANALYSES.md:86-90` ("## Measured output for the adopted source" holds 1050's file, "14,448,969 bytes, SHA-256 `19060f63…`"; the committed `public/data/all-finisher-context/evidence.json` is 14,868,380 bytes, SHA-256 `1660e107bb046bb0…`, `release_tag` `master-20261103b`); `docs/WEATHER_ANALYSES.md:65-69` ("## Current calculation evidence": the newest entry is "October 22, 2026 (1050)", while the committed `public/data/weather/evidence.json` has `as_of` 2026-11-05T16:13:24Z); and `docs/TOP_TEN_ANALYSES.md:5-13`. The adopted release's measurements are only in `docs/REFRESH_20261103b.md`.
  - **Ten more lines name a merged branch as the place where a state lives, without a false statement about `main`** (not counted; the same sweep should re-word them): `analysis/README.md:116` (the adopted cohort's numbers under the label "The cohort on `feat/half-v4`", directly above the stale `:117`), `docs/OWNER_DECISIONS.md:63-69` (seven status cells: "every analysis and page, on `feat/half-v4`"), `docs/PROJECT_HANDOFF.md:92` ("on `feat/person-id-identity`") and `:95` ("on `feat/half-v4`"). Dated measurements that give the branch as provenance (`docs/HALF_MARATHON.md:10,148,228`, `docs/KNOWN_ISSUES.md:25,40,42,44`) are not stale and should stay as they are.
  - **Five of those lines also quote counts or digests that the committed data no longer has, and one exact-age count pairs two different measures.** #91 rebuilt the lookup and everything bound to it on the `person_id` identity; the handoff and the refresh record carry the new numbers, the contracts still carry the old ones (AGENTS.md rule 21: "every adoption sweeps them").

    | Document | It says | The committed data says |
    | --- | --- | --- |
    | `docs/FAST_START_ANALYSIS.md:17` | `runner_manifest_sha256` `8f593e05…`; "4,257,513 candidate profiles; 662,539 have the earlier benchmark and 3,559,707 do not" | `public/data/fast-start/evidence.json`: `runner_manifest_sha256` `f1caea128421…`, `history_n` 986,580, `eligible_without_prior_n` 3,235,666; `public/data/runners/manifest.json`: `profiles` 3,631,904 |
    | `docs/RUNNER_CONTEXT_AND_PEERS.md:5` | the context manifest has SHA-256 `9033b64d…` (`as_of` `2026-11-04T14:40:17Z`), bound to runner manifest `8f593e05…` | `sha256sum public/data/runner-context/manifest.json` starts `3bff3a89c40c5920`; its `as_of` is `2026-11-05T16:48:25Z` and its `runner_manifest_sha256` starts `f1caea128421` (the totals in the same line, 1,950 groups, 15,625 pace cells and 6,061,071 distribution cells, still match) |
    | `docs/ANALYSIS_CATALOG.md:7` | "662,539 with a recent prior benchmark" | 986,580 (`history_n` above) |
    | `docs/TOP_TEN_ANALYSES.md:13` | the engine "holds 4,108,749 eligible finishes, 1,288,687 of them with an exact age (31.4%) and 648,914 with a recent earlier-year benchmark" (labelled 1050, under "Current source and defaults") | `public/data/packs/ext_personalized_guide/summary.json`: `n` 4,222,246, `age_n` 1,386,298, `history_n` 986,580. The six cell counts in the same line were not recounted |
    | `analysis/README.md:117` | "raw 5,327,504 in 298 editions and 34 cities; ... timing-eligible 4,407,710; source-excluded 298,961 in 41 editions (`RULES_1050`" for "the adopted cohort on `main`" | `public/data/runners/manifest.json` `cohort`: `raw` 5,388,605, `timing_eligible` 4,483,806, `source_quality_excluded` 261,560, `eligible` 4,222,246 (the numbers line 116 gives for "the cohort on `feat/half-v4`") |
    | `docs/ANALYSIS_CATALOG.md:7` and `docs/REFRESH_20261103b.md:72` | "1,381,218 with exact age"; the refresh record sets it beside 1050's "(1,288,687)" | two measures. 1,381,218 is the age pack's `n` (`public/data/packs/ext_age_pacing/pack_meta.json`; 1,283,674 under 1050, read at `39f305713`), while 1,288,687 was the engine's `age_n` under 1050. The engine's `age_n` under `master-20261103b` is 1,386,298 at #89, #90 and #91 (`summary.json` above; `cohort.exact_age` in `public/data/insights/manifest.json`), a number no document names (`git grep -c -F "1,386,298" -- '*.md'` prints nothing) |

    `git grep -c -F f1caea12 -- '*.md'` finds no document that names the digest the committed files bind.
  - **The handoff's Current state** (`docs/PROJECT_HANDOFF.md:7-18`) is one merge behind: "Checked 2026-11-05, 19:00 UTC, after #90 merged"; `main` and Production `3bc2b26e`; data `as_of` 2026-11-04T14:30:12Z; "the marathon still keyed by the v1 `runner_id`"; the identity work "on `feat/person-id-identity`, not merged". Rule 19 lets this wait for the next pull request, so it is pending rather than a breach, but four days have passed and it is the block every agent is told to read first.
  - **26 broken relative links**, all in two files moved into `docs/history` without re-pointing their links: `docs/history/handoff-2026-11-05-current-state-before-89.md` (16) and `docs/history/handoff-2026-11-05-current-state-before-person-id.md` (10). `docs/history/README.md:8` asks for exactly that re-pointing and nothing else. Reproduce with `linkcheck.py` (appendix); every other Markdown link in the repository resolves.
  - `docs/history/handoff-2026-11-05-current-state-before-person-id.md` is not in the table in `docs/history/README.md` (the sibling file is at line 35).
- **Status.** Verified by me (the searches in the appendix: a phrase search, the release-intake sweep command, and two searches that follow headings and skip archived sections; each line read in its section; the pins, the two code constants and the committed data files read; ancestry tested with `git merge-base`; production read from `/version.json` and `/data/live.json`). The table is a floor, not a census: every wider search I ran added lines, and a stale sentence worded unlike all of them is not in it.
- **Why it matters.** AGENTS.md rules 20 to 22 exist because an agent that trusts a stale state line quotes counts under the wrong release, re-does an adoption, or writes "live" about the wrong build. Here the stale lines sit at the top of the contract documents that "Start here" sends an agent to.
- **Proposed change.**
  1. **Now (Mechanical, S to M, documents only).** For each line in the table, move the superseded sentence word for word to the file's dated History section (or `docs/history`), as rule 19 requires, and leave one sentence that names the adopted release from `analysis/release.json` and points to the handoff's Current state for what is merged and live. Two of the lines are headings whose anchors are link targets (`docs/DATA_ARCHITECTURE.md:42`, linked from `docs/WEATHER_ANALYSES.md:25`; `docs/FAST_START_ANALYSIS.md:15`, linked from lines 3 and 131 of the same file): re-point those links in the same change. The two lists of canonical-join releases (`docs/DATA_ARCHITECTURE.md:79`, `docs/ANALYSIS_CATALOG.md:20`) are better replaced by a pointer to the constant than extended, so the next adoption has nothing to sweep there. `docs/REFRESH_20261103b.md:72` is a dated record: add a dated note under it that names both exact-age measures instead of changing its sentence. Start the worklist from the release-intake command above (83 lines), not from this table. Replace the handoff's Current state block from a fresh read of `git ls-remote`, `/version.json` and `/data/live.json`, moving the old block to `docs/history` with its links re-pointed. Re-point the 26 links (prefix `../` for targets in `docs/`, `../../` for targets at the repository root, and drop the `history/` prefix for siblings) and add the missing row to `docs/history/README.md`.
  2. **So it does not recur (Owner decision: it adds a check; handoff owner item 12 already offers "a documentation link and command checker in CI").** A small document check in `site-validation.yml`: every relative Markdown link resolves; and outside `docs/history` and headed History sections no line matches `draft PR #`, `not merged` or `production still uses`. Because it would also fail on the branch that writes such a sentence, it moves branch state out of the contracts and into the one place designed for it, the handoff's Current state. Two limits to design for. First, those three phrases match only 16 of the 31 lines in the table (18 with `not deployed` and `until that branch merges` added). Eleven of the rest call the superseded release current or adopted without any such phrase, so the check also needs a form that reads the pin: outside archived sections, a line that says "current" or "adopted" (or sits under a heading that does) and names a marathon release tag or a `REFRESH_*.md` file must name the tag in `analysis/release.json`. The last two are lists that omit the adopted release, which no text pattern finds; the pointer in step 1 removes them. Second, run over today's tree the three phrases match 20 lines outside archived sections: the 16, the two in `docs/SEO.md`, and two that the check must let through, the handoff's Current state itself (`docs/PROJECT_HANDOFF.md:18`) and a sentence about another pull request (`docs/OPERATIONS.md:215`, "draft PR #49"; whether #49 is still a draft is unverified, because the GitHub API was not called). And a filter that skips every heading containing the word "history" would skip the live status table under `## Release history` (`docs/DATA_ARCHITECTURE.md:119`), where two of the 31 lines sit; my own first search made that mistake. The check therefore needs an exemption for the Current state block, an explicit list of archived headings, and a way to mark a single line as an exception.
- **Fix type.** Step 1 Mechanical (document edits under rule 19); step 2 Owner decision.
- **Effort and risk.** Step 1: M for thirty-one lines done properly (each needs its superseded text archived, and two are headings with linked anchors). Risk low; the only way to get it wrong is to rewrite instead of move.


---

## 3. P1: high value

Nothing in this section is broken for a visitor today. Each item either removes a standing cost (clone size, CI minutes, a red audit, a check nobody runs) or closes a gap that will bite at the next data adoption or dependency change.

### P1-1. `npm audit` reports two critical and two high packages; the patched 14.2 release closes 12 of 37 Next advisories and no 14.2.x closes the rest

- **What.** `next` is pinned at 14.2.5 (`package.json:37`). `npm audit --omit=dev` flags four packages: `next` (critical), `dompurify` (critical, through `posthog-js`), `postcss` (high, through `next`) and `source-map-js` (high, through `postcss`). The newest 14.2 release, 14.2.35, closes 12 of the 37 Next advisories. The other 25, three of them critical, have their first fix in 15.x, so no 14.2.x release closes them. None of the 37 reaches a visitor of this site: it is a static export with no Next server in production.
- **Evidence.**
  - `npm audit --omit=dev --json` (run once, saved as `npm-audit-prod.json`): `"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":2,"critical":2,"total":4}`; dependencies `prod 76, dev 339, optional 39, total 424`.
  - `next`: range `0.9.9 - 16.3.0-preview.10`, `fixAvailable {"name":"next","version":"14.2.35","isSemVerMajor":false}`. Its `via` list has 38 entries, one of them the string `postcss`, so 37 advisories. Testing each advisory range with `semver.satisfies('14.2.35', range)` (appendix): **12 closed** (1 critical, 4 high, 5 moderate, 2 low) and **25 still open** (3 critical, 9 high, 11 moderate, 2 low).
  - The three critical advisories that stay open on 14.2.35: `GHSA-p293-qw3h-jr36` (remote code execution on Windows-hosted servers, `>=13.4.0 <15.5.24`), `GHSA-2xp9-vwfh-vxw4` (Image Optimization API with AVIF, `>=10.0.0 <15.5.24`), `GHSA-2464-fhr4-w9xw` (Image Optimization API with SVG, `>=10.0.0 <=15.5.27`). The nine high ones concern Server Components and Server Actions denial of service, server-side request forgery in WebSocket upgrades, Server Actions and rewrites, and a middleware bypass (`GHSA-h25m-26qc-wcjf`, `q4gf-8mx6-v5v3`, `8h8q-6873-q5fj`, `c4j6-fc7j-m34r`, `36qx-fr4f-26g5`, `m99w-x7hq-7vfj`, `89xv-2m56-2m9x`, `p9j2-gv94-2wf4`, `p3m5-59mp-jv5r`).
  - Closed by 14.2.35: the critical `GHSA-f82v-jwr5-mffw` (authorization bypass in middleware, `<14.2.25`) and the high `GHSA-gp8f-8m3g-qvj9` (cache poisoning), `7gfc-8cq8-jh5f`, `mwv6-3258-q52c` and `5j59-xgg2-r9c4`.
  - `postcss`: range `<=8.5.22`, locked at 8.4.31, four advisories (two high: `GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849`, both about source-map loading at build time). npm names `next@14.2.35` as the fix, but `npm view next@14.2.35 dependencies` still lists `postcss: '8.4.31'`, so **`postcss` stays flagged after the upgrade**.
  - `dompurify`: range `<=3.4.16`, locked at 3.4.15 (asked for as `^3.4.13` by `posthog-js@1.433.10`), five advisories (one critical, `GHSA-cg2g-xh64-v4q7`, a `SAFE_FOR_TEMPLATES` bypass; one high). `fixAvailable: true`, so a lockfile update is enough.
  - `source-map-js`: range `1.0.0 - 1.2.1`, locked at 1.2.1, one high advisory (`GHSA-68fv-2mgg-jv7q`); fixed in 1.2.2 by a lockfile update.
  - The affected server features are not used: `next.config.mjs` sets `output: 'export'` and `images: { unoptimized: true }`; greps of `app`, `components` and `lib` for `next/image`, `next/script`, `beforeInteractive` and `'use server'` return nothing, and no `middleware.*` or `route.ts` file is tracked.
  - `npm outdated` (run once, saved as `npm-outdated.json`; the 13 packages it lists are pinned exactly, so "wanted" equals "current"; the four `@fontsource-variable/*` packages use `^5.3.0`, are locked at 5.3.0 and are not listed): `next` 14.2.5, latest 16.4.5; `eslint-config-next` 14.2.5, latest 16.4.5; `react` and `react-dom` 18.3.1, latest 19.3.1; `posthog-js` 1.433.10, latest 1.447.5; `recharts` 2.12.7, latest 3.10.1 (remove it instead, P1-6); `eslint` 8.57.0, latest 10.14.0; `typescript` 5.5.4, latest 7.0.2; `playwright` 1.56.1, latest 1.65.0; `@types/node` 20.14.10, latest 26.6.6; `web-vitals` 6.2.2, latest 6.2.3.
- **Status.** Verified by me (the audit and `outdated` runs; the advisory ranges tested with `semver`; `npm view` for the dependencies of 14.2.35; the greps). Not verified: that 14.2.35 builds with the custom webpack configuration, and whether `dompurify` sits in the lazily loaded PostHog chunk or is reached by any code path PostHog runs here.
- **Why it matters.** The exposure of visitors is low, and the report should not overstate it: with a static export there is no image optimizer, middleware, Server Action or rewrite for an attacker to reach. What remains is real but smaller: the development server and the build toolchain on agents' machines and in CI; `dompurify` shipped inside the analytics bundle; and an audit that is permanently red, which hides the next advisory that does matter. The audit also shows that the 14.2 line no longer receives fixes: 25 advisories were patched only in 15.x.
- **Proposed change.**
  1. **One pull request, patch level.** Set `next` and `eslint-config-next` to `14.2.35` (`package.json:37` and `:49`), run `npm install`, then `npm update dompurify source-map-js` so the lockfile takes the patched transitive versions. Run `npm run build`, `npm run verify:compat -- --build`, `npm run verify:data`, `npm run autopilot:privacy` (its scenario S8 is the first-load budget, `scripts/e2e/scenarios/s8-budget.cjs`). Expected audit afterwards: two packages (`next`, `postcss`) instead of four.
  2. **Record why the rest does not apply.** In `docs/OPERATIONS.md`, one short dated paragraph: the open advisories concern server features, the site is a static export, and the greps above prove the features are unused. An agent can then re-run the greps instead of re-deriving the argument (rule 19 covers the document change).
  3. **The move to 15.x or 16.x with React 19 is a separate decision.** It is the only way to a clean audit. Its costs: the React 19 migration; the `shell` cache group and the `RootLayoutReferencesLast` plugin in `next.config.mjs:8-47` depend on webpack and on Next's chunk order and must be re-proved; the first-load budget must be re-measured (rule 23 allows that only for an intended change, with a dated reason); the old-Safari approach checked by `verify:compat` must be re-read against the new build output.
- **Fix type.** Step 1: Engineering, needs a rebuild (a dependency change, not a mechanical edit). Step 2: Mechanical (`docs/OPERATIONS.md`). Step 3: Owner decision.
- **Effort and risk.** Step 1: S to M; risk low to medium (thirty patch releases apart, and the custom plugin reads Next internals). Step 3: L.

### P1-2. Production sends no `X-Content-Type-Options`, frame protection, `Permissions-Policy` or Content-Security-Policy

- **What.** `vercel.json` has five header rules; the only security header among them is `Referrer-Policy`. Production therefore answers with Vercel's default HSTS and nothing else. Three of the missing headers can be added today without touching a page. A Content-Security-Policy is feasible but needs a staged approach, because a static export has no per-request nonce.
- **Evidence.**
  - `curl -sS -I -H 'accept-encoding: br' https://splithappens.run/` (2026-11-09): `cache-control: public, max-age=0, must-revalidate`, `referrer-policy: strict-origin`, `strict-transport-security: max-age=63072000` (no `includeSubDomains`, no `preload`), `access-control-allow-origin: *`, `content-encoding: br`. No `content-security-policy`, `x-content-type-options`, `x-frame-options` or `permissions-policy` line.
  - `vercel.json:22-47`: rule 1 (`/(.*)`, lines 23-26) sets `Referrer-Policy: strict-origin`; rules 2 to 5 set `X-Robots-Tag` and, for `/version.json`, `Cache-Control: no-store`.
  - Adding headers breaks no check: only `scripts/verify-seo.cjs` (214-231, 767-788) and `scripts/verify-seo-live.cjs` (64-66, 87) read `vercel.json`, and they read its redirects.
  - What a policy has to allow, measured in the source and on the live home page:
    - Inline scripts: the home page has 9 (7 plain scripts, 1 module, 1 JSON-LD block). `dangerouslySetInnerHTML` appears at 5 sites (`app/layout.tsx`, `lib/seo.tsx`, `components/LegacyAnalysisLink.tsx`, `components/Experiment.tsx` twice). Next's own flight-data scripts differ on every page.
    - Inline styles: 118 `style=` attributes on the home page.
    - Images: `data:` SVG masks (`app/styles/components/menu.css:33-34`) and `blob:` URLs (`components/report/ReportActions.tsx:77,93`, `lib/report-image.ts:170`).
    - Connections: same origin, plus `https://us.i.posthog.com` (events; `lib/analytics.ts:30` also admits the EU host) and `https://us-assets.i.posthog.com` (remote configuration, `docs/ANALYTICS.md:84`). A grep of `app`, `components` and `lib` for a `fetch(` call with an absolute `http` or `https` URL returns nothing: no other host is fetched.
    - Forms: `components/AnalysisRequest.tsx:39` posts to a `mailto:` address, so `form-action` must list `mailto:`.
    - Framing: no `iframe` or `embed` in `app`, `components` or `lib`; `lib/replay-policy.ts:149` (`capture_heatmaps: false`) and `:164` (`advanced_disable_toolbar_metrics: true`) mean PostHog does not need to frame the site.
    - Browser features in use: `navigator.clipboard.writeText` (`components/AnalysisRequest.tsx:31`, `components/report/ReportActions.tsx:122`, `components/tools/ui.tsx:204`), `navigator.share` (`lib/report-image.ts:188,194`) and `navigator.vibrate` (`components/viz/Scrubber.client.tsx:152`). No camera, microphone, geolocation, sensor, payment, worker or service worker use.
- **Status.** Verified by me (live headers read with `curl`; `vercel.json` read; the greps above). Not verified: what the PostHog recorder needs under a policy (for example `worker-src blob:`), because no browser run was allowed.
- **Why it matters.** The site has no login and no private data, so the practical risks are narrow: another site framing the tools (clickjacking is harmless here, but a framed copy can pass as its own), MIME sniffing of the public JSON and text files, and, the real one, an injected or compromised script reading what a visitor types. Rule 18 promises that typed values stay private; today that promise rests on code review of `lib/analytics-policy.ts` alone, and a `connect-src` allow-list would enforce it in the browser as well.
- **Proposed change.**
  1. **Today (Mechanical, `vercel.json:25`).** Replace the header list of the first rule with:
     ```json
     "headers": [
       { "key": "Referrer-Policy", "value": "strict-origin" },
       { "key": "X-Content-Type-Options", "value": "nosniff" },
       { "key": "X-Frame-Options", "value": "DENY" },
       { "key": "Permissions-Policy", "value": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()" }
     ]
     ```
     Do not list `clipboard-write` or `web-share`: the site uses both, and their default (`self`) is what it needs. Check after deployment that `/data/*.json`, the `.gz` shards and the fonts still load (with `nosniff`, a script or stylesheet with the wrong MIME type is refused; data fetched with `fetch` is not affected).
  2. **Next (Engineering).** Ship a policy as `Content-Security-Policy-Report-Only` first, read the browser console in the existing Playwright scenarios, then enforce it. A starting point that matches the evidence above: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:; object-src 'none'`. Even with `'unsafe-inline'` for scripts, `connect-src`, `frame-ancestors`, `base-uri` and `object-src` are real gains.
  3. **Later (Engineering, optional).** Remove `'unsafe-inline'` from `script-src` with a post-build step that hashes each exported page's inline scripts and writes a per-page `<meta http-equiv="Content-Security-Policy">`. A header cannot do this for a static export (the hashes differ per page), and a meta policy cannot carry `frame-ancestors`, so the header from step 2 stays.
  4. **Owner decision.** Whether to send `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`. It binds every subdomain of `splithappens.run` to HTTPS for two years and preloading is slow to undo.
- **Fix type.** Step 1 Mechanical (`vercel.json`). Steps 2 and 3 Engineering. Step 4 Owner decision.
- **Effort and risk.** Step 1: S, risk low (the three headers change no page behaviour the greps can find; `X-Frame-Options: DENY` would break a PostHog heatmap or toolbar view if those are ever switched on, so note it next to `lib/replay-policy.ts:149`). Step 2: M. Step 3: M.

### P1-3. ESLint is installed but never runs, five documented checks run in no job, and the list of those gaps is wrong about the type check

- **What.** Four separate facts about which checks actually run:
  1. **ESLint never runs, anywhere.** `eslint` 8.57.0 and `eslint-config-next` 14.2.5 are installed (`package.json:48-49`), but the repository tracks no ESLint configuration and has no `lint` script, so `next build` skips linting and no workflow calls it.
  2. **Five checks that `docs/OPERATIONS.md:35-39` asks agents to run by hand run in no workflow:** `npm run og:check`; the `--self-test` of `verify-css.cjs` and `copy-fonts.cjs --check` (both inside `npm run verify:css`); `node scripts/font-fallbacks.cjs --check`; the `--html` modes of `verify-chapters.cjs` and `verify-half.cjs`; `npm run design:lint` and `design:shoot`.
  3. **The same list is wrong about types.** `docs/OPERATIONS.md:40` lists `npx tsc --noEmit -p .` as a check no CI job runs. The `verify` job's `npm run build` type-checks the whole project, so types are checked on every pull request and every push to `main`.
  4. **The full Python suite never runs on `main`.** It runs only in four path-filtered pull-request workflows. The one push-triggered data workflow, `half.yml`, runs `test_half.py` alone (85 of 256 test methods).
- **Evidence.**
  - No configuration: `git ls-files | grep -i -E '\.eslintrc|eslint\.config'` prints nothing, and `package.json` has neither an `eslintConfig` key nor a `lint` script (scripts at lines 7-30). Next's behaviour: `node_modules/next/dist/lib/eslint/runLintCheck.js:272-276` logs "No ESLint configuration detected. Run next lint to begin setup" and returns without linting.
  - My one run with a scratch configuration that extends `next/core-web-vitals` (`eslintrc.review.json`, output in `eslint.review.json`): 410 files, **0 errors, 5 warnings**, 8.1 s. The warnings: `components/QuestionViz.tsx:62` (a file nothing imports, P1-6), `components/report/ReportActions.tsx:143` (`no-img-element`), `components/story/ArchetypeStory.tsx:37` (`exhaustive-deps`, looks intended), `components/tools/RacePlan.tsx:280` twice (P2-7).
  - The build type-checks: `node_modules/next/dist/server/config-shared.js:37` (`ignoreBuildErrors: false`) and `:34` (`ignoreDuringBuilds: false`); `node_modules/next/dist/build/type-check.js:98-113` ("Checking validity of types"); `next.config.mjs` (52 lines) overrides neither. My one `npx tsc --noEmit -p . --incremental false`: exit 0 in 12.9 s.
  - What CI runs: `.github/workflows/site-validation.yml` job `verify` (lines 25-37): `verify:data`, `verify:analytics`, `verify:compat`, `verify:autopilot`, `npm run build`, `verify:compat -- --build`, `verify:seo`; job `privacy-e2e` (56-63): Chromium, a build with a dummy key, `verify:replay-e2e`. `grep -rn -E "og:check|verify:css|font-fallbacks|--html|design:lint|eslint|next lint" .github/workflows` prints nothing (the only `--html` mode CI reaches is `verify-courses.cjs --html`, inside the `verify:seo` script at `package.json:19`).
  - What each local-only check needs: `og:check` needs Playwright Chromium (`scripts/build-og-images.cjs:28,378-386,444`); the `--html` modes need `out/` (`scripts/verify-chapters.cjs:39,218`, `scripts/verify-half.cjs:40`); `font-fallbacks.cjs --check` needs a build and the Liberation fonts (its lines 14-20); `verify-css.cjs --self-test` and `copy-fonts.cjs --check` need nothing beyond `npm ci`.
  - Python: `python -m unittest discover -s analysis -p 'test_*.py'` appears in `pacing-analysis.yml:41`, `public-explorer.yml:43`, `runner-context.yml:47` and `weather-analysis.yml:40`, all `pull_request` or `workflow_dispatch` (pacing also on `release`). `half.yml:55-56` is the only `push: branches: [main]` trigger among the data workflows, and its test step (line 112) runs `-p 'test_half.py'`. In `pacing-analysis.yml` the suite (line 41) runs before the download (line 47), so it needs no data.
  - The owner has already been offered most of this: `docs/PROJECT_HANDOFF.md:37` (owner item 12) lists "a documentation link and command checker in CI; `npm run og:check` in CI (it runs only locally); a `typecheck` script; removing the `export` and `start` scripts ...; fixing `public-explorer.yml` ...".
- **Status.** Verified by me (workflow files and Next's source read; `tsc` and `eslint` each run once). Not verified: how long the Python suite takes, and whether `og:check` renders identically on a CI runner.
- **Why it matters.** Rule 23 says "never weaken a check"; a check that exists only as a line in a document is the weakest form there is. The costs are concrete: a regression in a share image, a font file or the built HTML of a chapter page reaches production unless the agent remembered a manual step; a hooks mistake (the two `RacePlan.tsx` warnings) is caught by nothing; and the wrong line about `tsc` makes agents spend a manual step on the one thing CI does cover.
- **Proposed change.**
  1. **Mechanical, document only (`docs/OPERATIONS.md:40`).** Move the line word for word to the file's dated History section (rule 19) and write in its place: types are checked by `next build` in the `verify` job; `npx tsc --noEmit -p .` gives the same answer locally in about 13 seconds without a build.
  2. **Owner decision (handoff item 12: each adds a check).** In order of value for cost:
     - Add `.eslintrc.json` containing `{ "extends": "next/core-web-vitals" }`. `next build` then lints `app`, `components` and `lib` in CI and on Vercel with no workflow change. Today that is 0 errors, so nothing fails; fix or annotate the 5 warnings first.
     - Add `node scripts/verify-css.cjs --self-test` and `node scripts/fonts/copy-fonts.cjs --check` to the `verify` job (seconds; no new dependency).
     - Add `node scripts/verify-chapters.cjs --html`, `node scripts/verify-half.cjs --html` and `npm run og:check` to the `privacy-e2e` job after its build: it already has `out/` and Chromium. Try them in a draft pull request first, since that build uses the dummy analytics key and image rendering can differ between machines.
     - Add a small job that runs the full Python suite on pull requests that touch `analysis/**/*.py` and on pushes to `main`. It needs `pip install` and no download.
  3. **Then (Mechanical, document only).** Shorten `docs/OPERATIONS.md:33-42` to what is still local-only, moving the old lines to History.
- **Fix type.** Step 1 and step 3: Mechanical. Step 2: Owner decision.
- **Effort and risk.** Step 1: S, no risk. Step 2: S each; the risk is a flaky image comparison, which is why `og:check` goes last and into a draft first.

### P1-4. Each data adoption adds about 0.5 GB to Git history; 92% of `main`'s history is runner lookup shards

- **What.** The runner lookup is committed as 7,887 files (474 MB) under `public/data/runners`. Every adoption rewrites almost all of them, and a gzip file does not delta against its previous version, so each adoption stores about 0.5 GB of new objects. Four adoptions account for about 2.0 GB of the 3.12 GiB object store.
- **Evidence.**
  - `git count-objects -vH`: `size-pack: 3.12 GiB`, `in-pack: 71824`. The pack holds 99 refs and 787 commits (`git rev-list --count --all`); `main` alone is 108 commits (`git rev-list --count HEAD`).
  - Blob bytes on disk by path, for everything reachable from `HEAD` (`git rev-list --objects HEAD | git cat-file --batch-check='%(objecttype) %(objectsize:disk) %(rest)'`, summed per folder): total 2,828.4 MB in 54,371 blobs, of which `public/data/runners` **2,609.5 MB in 47,049 blobs (92%)**; `public/data/runner-context` 85.0 MB; `public/data/packs` 68.9 MB; `public/charts/cards` 29.0 MB; `public/data/insights` 17.0 MB. For all refs: total 3,172.4 MB, `public/data/runners` 2,914.3 MB.
  - Per adoption commit (`git diff-tree -r --no-renames --diff-filter=AM "$c^" "$c"`, new blobs summed):

    | Commit | Pull request | Date | Files added or changed | Raw MB | MB on disk |
    | --- | --- | --- | --- | --- | --- |
    | `77356bf08` | #70 | 2026-10-17 | 8,748 | 722.8 | 473.7 |
    | `39f305713` | #78 | 2026-10-22 | 8,722 | 677.7 | 515.4 |
    | `b35789b8a` | #89 | 2026-11-05 | 8,944 | 683.4 | 511.5 |
    | `068b6c370` | #91 | 2026-11-05 | 8,563 | 569.4 | 501.1 |

    Sum 2,001.7 MB on disk; the last two landed on the same day.
  - Why nothing is shared between adoptions, from four sampled shards read at each of the four commits (`git show <commit>:<path> | gunzip`): the gzip output is deterministic (header time bytes `00000000`), but **every shard starts with `"release_tag"`** (`analysis/build_runner_lookup.py:106,125,142,147`), so a new tag changes every file. At #89 the rows of `index/a10` were identical to the previous adoption (119 of 119) and those of `index/5fc` nearly so (552,967 of 552,968), yet both files were stored again (6,506,228 B and 6,506,240 B for `5fc`). Profile shards `063` and `a7f` kept 65% of their bytes at #89 and 69% to 71% at #91, but 1% to 2% at #78; the index rows kept 0% at #91 (the move to `person_id`).
  - Tracked `public/` today: 808.1 MB in 8,971 files; `public/data` 789.1 MB (runners 474.0 MB in 7,887 files: index 140.2 MB in 3,790, profiles 332.9 MB in 4,096, manifest 926,144 B; `packs` 259.9 MB in 170 files, of which `ext_personalized_guide` 259.1 MB in 58; `insights` 19.2 MB; `runner-context` 18.8 MB; `all-finisher-context` 14.2 MB). By type: `.gz` 491.9 MB in 8,185 files, `.json` 297.0 MB in 557, `.png` 18.5 MB in 173.
  - The repository already keeps other large generated files out: `.gitignore:19-23` ignores `*.parquet`, `*.tar.gz` and `analysis/private/` "to keep clones small". There is no `.vercelignore`, so the whole of `public/` is deployed.
- **Status.** Verified by me (the Git commands above; the shard sample with `git show`). Inferred: that a clone with `--filter=blob:none` is about 0.5 GB (from the size of the current tree's blobs, not from a timed clone). Not verified: whether the lookup shards also exist as release assets, and Vercel's limits (the GitHub API and the Vercel dashboard were out of bounds).
- **Why it matters.** Every agent session and every full-history CI job pays for this (P1-5 shows one job that fetches all of it to run one `git diff`). At the measured rate the object store passes 5 GiB in about four more adoptions. Rule 5 already says historical numbers are preserved "in Git history and immutable releases"; for generated shards the release is the better of the two homes.
- **Proposed change.**
  1. **Now (Mechanical).** Add `filter: blob:none` to the one full-history checkout (`.github/workflows/half.yml:125`, P1-5), and add one line to `docs/OPERATIONS.md` recommending `git clone --filter=blob:none` for new worktrees.
  2. **Small engineering step, with a rebuild.** Take `release_tag` out of the shard bodies and keep it in `manifest.json`, which already binds every shard by sha256 and byte length (`lib/runner-search.ts:100` builds the cache key from the manifest's tag and digest). Shards whose rows did not change then keep their bytes and cost nothing in Git. `lib/runner-search.ts:112` compares the shard's tag with the manifest's and would go; the digest check is the stronger binding, but this removes a check from a contract, so it needs the contract document updated and the owner's agreement (rules 19 and 23). The gain is limited to shards with no changed row.
  3. **The durable fix (Owner decision, L).** Stop committing regenerated shards. Publish each adoption's lookup as one sha256-pinned public release asset and fetch it in the build, the way `analysis/download_release.py` fetches inputs. This keeps rules 1 to 3 (public, anonymous, checksummed; rule 2 already prefers release assets for large files) and rule 5 (a pin, no fallback). What must change with it: the Node recounts that read the committed shards (`scripts/verify-charts.cjs:3-4`, `scripts/verify-duplicate-editions.cjs:11`); the builders for which the committed lookup is the input, not only an output: `analysis/insights_data.py:90` (the stories and the charts: `charts.yml:55-56`, `insights.yml:58`), `build_fast_start.py:364`, `build_fast_start_all.py:261`, `build_all_finisher_context.py:277` (`all-finisher-context.yml:38` builds without a download), `build_runner_context.py`, `build_half.py` and `half_marathon.py`; `verify:data` in CI; and the Vercel build, which would download about 474 MB.
  4. **Not recommended without the owner.** Rewriting history to drop the old shards would shrink the store to well under 1 GB but changes every commit id on 99 refs.
- **Fix type.** Step 1 Mechanical. Step 2 Engineering, needs a rebuild, plus an owner agreement. Steps 3 and 4 Owner decision.
- **Effort and risk.** Step 1: S, no risk. Step 2: M. Step 3: L; risk medium (build time and a new network dependency in the build).

### P1-5. CI spends its time on repeats: one job fetches the whole 3 GiB history for a single `git diff`, one shared file starts four FULL downloads, and ten workflows never cancel a superseded run

- **What.** The eleven non-autopilot workflows are careful about permissions and timeouts (see section 5), but they repeat expensive work, and two documents describe a CI that differs from the files.
- **Evidence.** All line numbers are in `.github/workflows/`.
  - **Full-history fetch for one diff.** `half.yml:122-125` checks out with `fetch-depth: 0` and no `filter`, so the `source` job downloads every blob of every commit (the 3.12 GiB object store of P1-4). It needs the history only for `git diff --name-only "$BASE" "$HEAD"` (`half.yml:135`), which reads commits and trees, never blobs. The fetch happens before the scope test, so a run that then prints "skipped: this change touches no half pin…" (`half.yml:138`) has already paid for it. The trigger includes `push` to `main` (`half.yml:54-55`).
  - **One file, four full runs.** `analysis/source_quality.py` is in the path filter of `public-explorer.yml:10`, `runner-context.yml:13` and `weather-analysis.yml:14`, and `pacing-analysis.yml:6` (`'analysis/**'`) covers it too. Each of the four runs the whole Python suite (`python -m unittest discover -s analysis -p 'test_*.py'` at `pacing-analysis.yml:41`, `public-explorer.yml:43`, `runner-context.yml:47`, `weather-analysis.yml:40`) and each downloads the FULL bundle (`pacing-analysis.yml:47`, `public-explorer.yml:48`, `runner-context.yml:51`, `weather-analysis.yml:56`). `analysis/build_pacing.py` (`public-explorer.yml:8`, `runner-context.yml:11`, `weather-analysis.yml:13`) and `analysis/download_release.py` (`inspect-full-export.yml:6`, `public-explorer.yml:15`, `runner-context.yml:16`) start four each the same way. For scale: the previous adoption's FULL was 790,000,000 B + 780,523,364 B (`analysis/ACCESS.md:171`, tag `private-export-20261021-1050`); the size of `master-20261103b`'s bundle was not read.
  - **No cancellation.** `grep -L "^concurrency:" .github/workflows/*.yml | grep -v autopilot` lists ten files; only `half.yml:90-92` has a group (its comment at line 89 gives the reason: "the source job downloads 1.3 GB"). A second push to a pull request leaves the first run's 60-minute (`pacing-analysis`, `insights`) and 90-minute (`public-explorer`, `runner-context`) jobs running to the end.
  - **A documentation edit starts the longest calculation.** `pacing-analysis.yml:5-7` filters on `'analysis/**'`, and `analysis/` holds five Markdown files (`analysis/ACCESS.md`, `analysis/README.md` and three under `analysis/course_terrain/`). `docs/OPERATIONS.md:24` admits it: "so a documentation edit under `analysis/` starts it too". No step of the workflow reads those files (`grep -n -E "ACCESS\.md|README\.md" analysis/*.py` finds only names of files inside the release bundles).
  - **No pip cache and no browser cache.** `grep -n -E "cache: *pip|cache-dependency-path|actions/cache" .github/workflows/*.yml` prints nothing. Ten workflows run `pip install -r analysis/requirements.txt` (duckdb 1.4.4, numpy 2.5.3, pandas 3.0.5) from the network on every run, and `site-validation.yml:56` runs `npx playwright install --with-deps chromium` on every run. `npm` is cached wherever `npm ci` runs (charts, half, runner-context, site-validation); the four workflows that set up Node 22 without a cache run no `npm ci`, so nothing is lost there.
  - **Two Pythons, two Nodes, and documents that say one.** Python 3.12 in four workflows (`all-finisher-context.yml:30`, `charts.yml:42`, `fast-start.yml:31`, `half.yml:104,144`) and 3.13.16 in six (`insights.yml:41`, `inspect-full-export.yml:36`, `pacing-analysis.yml:37`, `public-explorer.yml:36`, `runner-context.yml:39`, `weather-analysis.yml:37`); Node 20 in `site-validation.yml:21,52` and `runner-context.yml:42`, Node 22 in the other six that use Node. `docs/OPERATIONS.md:211` says "The data workflows use Python 3.12", and `README.md:45`, `analysis/README.md:35` and `docs/OPERATIONS.md:24,254` say "Python 3.12 (as in CI)". The Node sentence on the same line 211 is correct.
  - **The reason given for the exact pin no longer holds.** The comment at `pacing-analysis.yml:34-36` says the adapter "records the interpreter version in the adapted MANIFEST.json, whose digest every output binds, so another Python gives another digest". `docs/REFRESH_20261103b.md:152` records the opposite since November 5: "the adapted `MANIFEST.json` records `dependencies.duckdb` only, so the interpreter no longer enters the digest every output binds. The rebuild workflows still pin Python 3.13.16; unpinning them is optional", and `analysis/adapt_master.py:60` has `ADAPTER_VERSION = 2`.
  - **A path filter names a file that does not exist.** `public-explorer.yml:12` lists `analysis/test_runner_lookup.py`; `git ls-files analysis/test_runner_lookup.py` prints nothing. (The handoff's owner item 12 already lists this one.)
  - **Actions are pinned by major tag, not by commit.** `grep -h -o -E "uses: [A-Za-z0-9_./-]+@[A-Za-z0-9_.-]+" .github/workflows/*.yml | sort | uniq -c`: `actions/checkout@v4` 19, `actions/setup-node@v4` 16, `actions/upload-artifact@v4` 16, `actions/setup-python@v5` 11, `actions/download-artifact@v4` 5. All five are GitHub's own actions; there is no third-party action. There is no Dependabot or Renovate file to move them (P2-14).
- **Status.** Verified by me (the workflow files and the greps above). Inferred: the saving from a blobless fetch (about 2.6 GB of lookup blobs not downloaded, from the object sizes in P1-4, not from a timed run). Not verified: run durations and how often runs were superseded (the GitHub API was out of bounds), and whether branch protection requires any of these checks by name.
- **Why it matters.** The data workflows are the slow path of every analysis change, and the agents who maintain this repository wait on them. Most of the cost above is repetition that changes no result. The two wrong statements about Python are the kind of drift P0-3 describes: an agent that follows "Python 3.12 (as in CI)" to reproduce a 3.13.16 job is following the document, not the file.
- **Proposed change.**
  1. `half.yml`: add `filter: blob:none` under `with:` after line 125, and `--no-renames` to the `git diff` at line 135 (so the diff never has to fetch blobs to detect renames). All commits and trees still arrive, so the `git cat-file -e "$BASE^{commit}"` test at line 134 behaves as before, and the later steps read only the checked-out tree.
  2. Add to each of the ten workflows without one: `concurrency:` with `group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` and `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. The expression keeps every `push` to `main`, every `release` and every manual run alive and cancels only a superseded pull-request run. Record the behavior in `docs/OPERATIONS.md` in the same pull request (rule 19).
  3. `pacing-analysis.yml`: add `- '!analysis/**/*.md'` after line 6 and replace the sentence at `docs/OPERATIONS.md:24` (rule 19: move the old sentence to the file's History section verbatim). The exclusion must stay after the include, because the last matching pattern wins.
  4. Add `cache: pip` and `cache-dependency-path: analysis/requirements.txt` to the eleven `actions/setup-python@v5` steps (ten workflows; `half.yml` has two) that are followed by the `pip install`. Optional: cache `~/.cache/ms-playwright` keyed on the lockfile in `site-validation.yml`.
  5. Correct the comment at `pacing-analysis.yml:34-36` to say why 3.13.16 is still pinned (it is the interpreter of the recorded local run, and the pin is now optional), and correct the Python sentences at `docs/OPERATIONS.md:24,211,254`, `README.md:45` and `analysis/README.md:35` to name both versions, or move all workflows to one version. Moving the six 3.13.16 jobs is safe only after one rebuild shows the outputs still match byte for byte; that is why it is not listed as mechanical.
  6. **Owner decisions.** (a) Run the full Python suite once per pull request in one job and let the four rebuild workflows run only their own tests; this removes three of the four suite runs but changes what each workflow proves by itself. (b) Share one FULL download between the rebuild jobs (one workflow with a download job and an artifact, or an `actions/cache` entry keyed on the pinned sha256). (c) Pin actions by commit sha with Dependabot to move them. None of these weakens a check (rule 23): every test and every rebuild still runs, once.
- **Fix type.** Steps 1 to 5 Mechanical (workflow and document lines only; no check is removed). Step 6 Owner decision.
- **Effort and risk.** Steps 1 to 4: S each, low risk; the one thing to watch in step 2 is a required check that a cancelled run leaves "cancelled" instead of "passed" until the newer run finishes. Step 5: S. Step 6: M.

### P1-6. Six files that no page reaches keep recharts and 33 more packages installed, and three verifiers still spend assertions on them

- **What.** The pre-redesign chart stack (`ResearchQuestion` → `QuestionViz` → `QuestionLineChart` → recharts, with `StudyFigure`, `AnalysisChart` and `lib/chart-selection.ts`) is imported by no page, layout or component that a page uses. It survives because three verifiers render it. The cost is a charting library in the dependency tree, checks that prove things about HTML no visitor receives, and a second way to draw a chart that a new agent can mistake for the current one.
- **Evidence.**
  - Import graph from every Next entry file under `app/` (page, layout, error, global-error, not-found, sitemap, robots, manifest and the like), following `import … from`, `import()` and `require()` (`node reach.cjs /home/user/pace-notes-review`, script in the scratch folder): `files 409 entries 69 reachable 403 unreachable 6`. The six: `components/AnalysisChart.tsx` (36 lines), `components/QuestionLineChart.tsx` (39), `components/QuestionViz.tsx` (181), `components/ResearchQuestion.tsx` (24), `components/StudyFigure.tsx` (26), `lib/chart-selection.ts` (17); 323 lines by `wc -l`.
  - The only import of recharts in the repository: `components/QuestionLineChart.tsx:6` (`git grep -n -E "from ['\"]recharts" -- . ':!package-lock.json'` prints that one line). Declared at `package.json:41` (`"recharts": "2.12.7"`).
  - Lockfile closure with and without it (a walk over `package-lock.json` from the root's dependencies): 424 packages with, 390 without. The 34 that exist only for recharts include `lodash`, `@babel/runtime`, `victory-vendor`, eleven `d3-*` packages and nine `@types/d3-*`, `react-smooth` and `react-transition-group`.
  - The repository already says so: `docs/WEBSITE_ARCHITECTURE.md:178`, "reachable from no page: `StudyFigure`, `ResearchQuestion` and `AnalysisChart`, the only components that render it, have no importers (dead code since the redesign; a code task, not a contract)".
  - Verifiers that still render them: `scripts/verify-ten-analyses.cjs:24-25` (requires `QuestionViz` and `AnalysisChart`; assertions at 61-97), `scripts/verify-research.cjs:27,234-235` (requires `lib/chart-selection.ts`, `ResearchQuestion`, `StudyFigure`; assertions at 238-246, 258 and 282), `scripts/verify-units.cjs:276-277,314,321,356-357`, and `scripts/verify-analytics.cjs:625`, which expects two `trackFailure` calls in `components/QuestionViz.tsx`.
  - One of those is a rule 15 check on unshipped HTML: `scripts/verify-research.cjs:238-244` renders `ResearchQuestion` for every question and asserts "method copy belongs on /methodology" and "no source or download links on a result page". The component is on no result page, so those assertions pass whatever the shipped pages say. (Rule 15 has other enforcement on built pages, `verify-seo` among them; this part of it is the part that proves nothing.)
  - Second-order: `forPage`, `PageAnswer`, `displayChart` and `insightAnswer` (`lib/research-display.ts:144-174`) are used by `ResearchQuestion` and the verifier only, and `getSlowdownFigures` (`lib/study-figures.ts:24`) by the verifier only (`git grep` over `app`, `components`, `lib`). `splitAnswer` and `getStudyFigures` are live (`components/methods/MethodsAnalyses.tsx:31`, `components/methods/MethodsDefinitions.tsx:53`).
- **Status.** Verified by me (the import graph, the greps and the lockfile walk above). Not verified in a build: no build was run, so "recharts is in no shipped chunk" rests on the import graph and on the repository's own statement.
- **Why it matters.** Dead code that is tested looks alive. An agent asked to change how a chart reads finds `QuestionViz`, finds verifiers that exercise it, and edits the wrong thing; a verifier section that renders an unshipped component reports a pass that means nothing. The 34 packages are also most of what `npm outdated` and future audits will keep raising for no shipped benefit (recharts' latest major is 3; P1-1).
- **Proposed change.** One pull request, in this order.
  1. Delete the six files and `recharts` from `package.json:41`; run `npm install` to rewrite the lockfile.
  2. In the three verifiers, for each assertion that renders a deleted component: if the property is one a shipped page must have (the rule 15 assertions at `scripts/verify-research.cjs:238-244` are), re-point it at the component or built page that shows the answer today; otherwise delete it with a dated comment naming the deleted component. Remove the `['components/QuestionViz.tsx', 2]` entry from `scripts/verify-analytics.cjs:625` the same way. Keep every assertion that reads data (`splitAnswer`, the chart rows, `getStudyFigures`).
  3. Then decide `forPage`, `displayChart`, `insightAnswer` and `getSlowdownFigures`: delete them with their assertions, or keep them if a page is about to use them.
  4. Record it in `docs/WEBSITE_ARCHITECTURE.md` (move line 178 to that file's History section verbatim, rule 19) and in the handoff.
- **Rule 23.** Removing an assertion about a deleted, unshipped component does not weaken a check on the site, but the pull request should list every removed assertion so a reviewer can see that none of them covered a shipped page. The compliant form is "re-point where a shipped page needs the property, delete only where the subject no longer exists".
- **Fix type.** Engineering: needs `npm run verify:data`, the Python-free site checks and a build with the S8 budget (the budget should not move, since no shipped chunk changes; if it moves, something was reachable after all).
- **Effort and risk.** M. Risk low for the site (nothing shipped changes), medium for the checks (step 2 needs care, one assertion at a time).

### P1-7. A failing check shows one problem at a time: `verify:data` stops at the first of 28 commands, the 26 verifiers that use `assert` stop at their first failure, and half of their assertions carry no message

- **What.** The verifier family is the project's test suite (there is no unit-test runner; `package.json:7-30` has no `test` script) and it is the reason numbers on the site can be trusted. Its weak side is the failure experience. A run reports the first failure only, and for 1,790 of 3,518 assertions that report is Node's default text with no word about which rule, file or release is involved or what to do next.
- **Evidence.**
  - The family: 32 scripts, 14,279 lines (`ls scripts/verify-*.cjs | wc -l`; `wc -l scripts/verify-*.cjs`). Largest: `verify-tools.cjs` 1,735, `verify-insights.cjs` 1,472, `verify-analytics.cjs` 1,221, `verify-half.cjs` 1,080, `verify-seo.cjs` 946, `verify-courses.cjs` 873.
  - `npm run verify:data` (`package.json:11`) chains 28 commands with `&&` (26 verifiers and two `build-chart-cards.cjs --check` runs). The first non-zero exit ends the chain, so a data adoption that breaks five verifiers needs five runs to show them.
  - Census of `assert.*` calls (`node assertmsgs.cjs /home/user/pace-notes-review`, script in the scratch folder; a text heuristic that counts arguments): `TOTAL without message 1790 with message 1728`. Without and with a message, per file: `verify-tools.cjs` 416 and 386; `verify-analytics.cjs` 155 and 296; `verify-all-finisher-context.cjs` 110 and 22; `verify-runner-search.cjs` 101 and 73; `verify-units.cjs` 101 and 63; `verify-research.cjs` 83 and 49; `verify-chapters.cjs` 78 and 27; `verify-runner-context-client.cjs` 77 and 5; `verify-weather.cjs` 77 and 47; `verify-public-explorer.cjs` 73 and 64. `verify-insights.cjs` is the good example among the `assert` users: 56 and 275.
  - What a bare failure prints (Node 22, a two-line demonstration outside the repository): `assert.equal(rows.length, 2)` gives "Expected values to be strictly equal: 1 !== 2", and `assert.ok(rows.every(r => r.n >= 100))` gives "The expression evaluated to a falsy value" with the source expression. The stack names the file and line, so the assertion can be found; nothing says which data file or pin produced the number or which command rebuilds it. Example of a recount with no message: `scripts/verify-runner-context-client.cjs:46` (`assert.deepEqual(client.finishPlacement(data, 14400.125), { n: 201, other_n: 200, rank: 41, … })`).
  - The better pattern already exists in the six verifiers that do not use `assert`: `scripts/verify-half.cjs:55-57` (`const ok = (cond, message) => { checks++; if (!cond) problems.push(message); return !!cond; };`) with the report at lines 1074-1078 ("verify-half: N problems in M checks:", then the list). `verify-seo.cjs:88-91` collects failures per named check and page, `verify-css.cjs:82-84` per file and line, `verify-half-source.cjs:127-133` per rule, and `verify-replay-e2e.cjs:102` and `verify-seo-live.cjs:49-51` per named scenario; each of the six reports every problem of a run with a message.
  - Not every bare assertion needs a message. Lines such as `scripts/verify-all-finisher-context.cjs:78-81` (`assert.deepEqual([null, 17, 18, 24, …].map(ageBand), ['all', 'all', '18–24', …])`) are unit tests of a pure function, and the expression is the message.
  - Where each runs: `verify:data`, `verify:analytics`, `verify:compat` (source and build) and `verify:seo` in the `verify` job of `.github/workflows/site-validation.yml`; `verify:replay-e2e` in its `privacy-e2e` job; `verify-half-source.cjs` in the `source` job of `half.yml`; `verify-seo-live.cjs` only from the autopilot merge workflow. Self-tests exist for `verify-css.cjs`, `verify-duplicate-editions.cjs` and `verify-seo.cjs` (`grep -l -- "--self-test" scripts/*.cjs`).
  - How long it takes: no script prints a duration, and the only figures are dated one-off notes in the records: "passed (18 min)" on November 5, 2026 (`docs/REFRESH_20261103b.md:102`), 10 min 50 s to 11 min with 21 verifiers on October 16, 2026 (`docs/REFRESH_20261016_1652.md:108,135`), 9 min 13 s the same day on another branch (`docs/history/handoff-2026-10-14-to-17.md:132`), and "about 40 s" for `verify-half.cjs` alone (`docs/HALF_MARATHON.md:168`). At about 18 minutes a run, a chain that stops at its first failure costs up to 18 minutes for each problem it shows.
- **Status.** Verified by me (the counts above; the census is a heuristic and can be off by a few per file where a call spans unusual syntax). Not measured by me: durations (running verifiers was out of bounds); the times quoted are the documents' own.
- **Why it matters.** Agents maintain this repository, and after every data adoption some recounts legitimately move (rule 23: "if a number legitimately moved, change the expectation with a dated comment saying why"). To do that well the agent must see every moved number at once and be told where each comes from. One failure per run, with no pointer, is what makes the tempting wrong fix (edit the expectation until it passes) cheaper than the right one.
- **Proposed change.** None of this removes or loosens an assertion; all of it makes failures say more (rule 23 allows that).
  1. **A runner, S to M.** Add `scripts/verify-all.cjs`: run the 28 commands of `verify:data` in the same order, do not stop at the first failure, print one line per command with its exit code and seconds, and exit non-zero if any failed. Point `verify:data` at it. This gives every failure in one run and a duration per command (today only dated totals exist).
  2. **A shared helper, S.** Move the `verify-half.cjs:55-57` collector into `scripts/lib/check.cjs` (with the final report and exit code) so new verifiers start from it.
  3. **Messages where they pay, M.** Add a message to the bare assertions that compare a published or displayed number with a recount, starting with the five files that have the worst ratio (`verify-runner-context-client.cjs` 77 of 82 bare, `verify-all-finisher-context.cjs` 110 of 132, `verify-runner-context.cjs` 30 of 38, `verify-chapters.cjs` 78 of 105, `verify-personalized.cjs` 39 of 53). A useful message names the data file and the builder that writes it. Leave pure-function unit assertions as they are.
  4. **Later, L.** Convert the largest `assert` verifiers to the collector one section at a time.
- **Fix type.** Mechanical (scripts only; no expectation changes). Step 1 needs one full `npm run verify:data` to compare its result with the old chain.
- **Effort and risk.** Steps 1 and 2: S to M, low risk (the runner must keep the exit code, or CI would pass a failure: test it with a deliberately failing command). Step 3: M. Step 4: L.

### P1-8. The rules that drifted are the ones no check enforces: documents (19, 20, 21), credentials (3), merging (24) and the Python half of rule 23 on `main`

- **What.** `AGENTS.md:3` says of the standing rules that "each names the check that enforces it". Twelve of the 24 name none: 1, 2, 3, 9, 11, 12, 14, 19, 20, 21, 22 and 24. For five of them that is harmless: 9 and 11 are enforced at run time inside the Python builders, 14 has checks the rule does not name, and 12 and 22 are judgement. The other seven rest on an agent remembering them at the end of a long session, and every drift this review measured in documents falls under them.
- **Evidence.**

  | Rule | What enforces it today | Drift found |
  | --- | --- | --- |
  | 1, 2 Access and release assets | A person's dated ranged GET, written into `analysis/ACCESS.md:34` (November 5, 2026) and `:72` (October 31, 2026). The half `source` job downloads with no token (`.github/workflows/half.yml:152-158,172`), which proves the half assets whenever its scope step does not skip. The six marathon download steps carry `GH_TOKEN` (`insights.yml:52`, `inspect-full-export.yml:43`, `pacing-analysis.yml:45`, `public-explorer.yml:47`, `runner-context.yml:50`, `weather-analysis.yml:55`), so by the repository's own lesson ("prove nothing") they are not evidence of anonymous access | None found; the last proof is four days old |
  | 3 Credentials | Nothing. No workflow has a scanning step (`grep -n -i -E "gitleaks\|trufflehog\|secret-scan\|detect-secrets" .github/workflows/*.yml` prints nothing) | None: a pattern search of tracked text outside `public/data` and the lockfile finds no token-shaped string (command in the appendix); the only key in the repository is the dummy `[dummy key name not copied]` at `site-validation.yml:60` |
  | 14 Terms | `scripts/verify-charts.cjs:149`, `scripts/verify-courses.cjs:520-529,694`, `scripts/verify-fast-start-client.cjs:33`, `scripts/verify-all-finisher-context-client.cjs:90`. The rule names none of them | None found |
  | 19 Record what changed | Nothing. Only two verifiers read any document: `verify-analytics.cjs` (`docs/ANALYTICS.md`) and `verify-half.cjs` (`AGENTS.md`, `docs/HALF_MARATHON.md`, `docs/CHARTS_INSTAGRAM.md`). The link and anchor check is a here-document in `docs/OPERATIONS.md:56-` that "no script or CI job" runs | P0-3: at least 31 stale state lines in 15 documents; separately, 26 broken links in two files |
  | 20 Four facts | Nothing outside the autopilot: `version.json` is read only by `scripts/autopilot-merge.cjs` and `scripts/autopilot-smoke.cjs` | P0-3: four documents still make a claim about production that is no longer true (`analysis/ACCESS.md:3,46`, `analysis/README.md:170`, `docs/KNOWN_ISSUES.md:7`, `docs/HALF_MARATHON.md:13`) |
  | 21 Counts carry their release | Nothing ("every adoption sweeps them" is a manual sweep) | P0-3: five lines with counts or digests the committed data no longer has, and one exact-age count that pairs two measures. P1-10: one count repeated in ten documents |
  | 23 Checks | The site's CI set. Not covered: ESLint (P1-3) and the Python tests on `main`. Only two non-autopilot workflows have a `push` trigger: `half.yml:54-57` (paths under the half files; it runs `test_half.py`, 85 of the 256 test methods) and `site-validation.yml:5-6` (no Python). Every other Python test runs only on a pull request whose path filter matches | Not measured (no run history read) |
  | 24 Merging | Nothing in the repository: `git ls-files .github` lists only workflows, so there is no pull request template and no CODEOWNERS. Whether branch protection requires a review or a named check was not read (the GitHub API was out of bounds) | Not checked |

  - The full Python suite needs no data and no network: `pacing-analysis.yml:41` runs it before the download step at line 47, `analysis/test_download_release.py` patches `urlopen`, and the tests that need local files skip themselves (`analysis/test_half.py:950,1007,1667,1953,1975`).
- **Status.** Verified by me (AGENTS.md read rule by rule; the greps above; `git ls-files .github`). Inferred: that the seven rules are the cause of the drift rather than merely where it showed up.
- **Why it matters.** The rules with a verifier behind them are the ones this review found intact: it found no banned word, lowered floor or analytics leak in the source it read (the verifiers themselves were not run), and all of its document drift under rules that have no check. That is a strong argument for the repository's own method, and it says where the next checks pay. Each proposal below adds a check; none loosens one (rule 23).
- **Proposed change.** In order of value per hour:
  1. **Documents (rules 19 to 21), S to M.** Move the link and anchor here-document out of `docs/OPERATIONS.md` into a script (for example `scripts/check-doc-links.py`), run it in the `verify` job of `site-validation.yml` after the 26 links are re-pointed, and add the stale-state pattern of P0-3 step 2 to it. This is the item the handoff already offers the owner (`docs/PROJECT_HANDOFF.md:37`, item 12).
  2. **Repository facts from the data, not from memory (rules 20 and 21), M.** A script (for example `scripts/write-state.cjs`) that writes one generated file from the three pins and the manifests: the adopted tags, their dates, the eligible-finish count of `public/data/live.json`, and the manifest digests; a `--check` mode in CI fails when the file is stale. Contract documents then link to it for "what is adopted" and keep only what does not change with a release. It is right in the adoption pull request itself, which a hand-written sentence cannot be (rule 19 defers the handoff to the next pull request). Deployed state stays a dated reading of `/version.json`, as rule 20 requires.
  3. **Credentials (rule 3), S.** One step in the `verify` job: `git grep -n -I -E` for token shapes over tracked text outside `public/data`, failing on a match. Plain git, no third-party action. GitHub's own secret scanning with push protection is a repository setting for the owner (its state was not read).
  4. **Python on `main` (rule 23), S.** A job in `site-validation.yml` for pushes to `main`: `python -m pip install -r analysis/requirements.txt` then `python -m unittest discover -s analysis -p 'test_*.py'`, with `cache: pip`. Its duration is not known to me (the suite was not run).
  5. **Merging (rule 24), S.** `.github/pull_request_template.md` with three prompts: the owner's request to merge (quoted and dated), the contract documents updated (rule 19), the checks run (rule 23). A template does not enforce; it puts the rule where the action happens.
  6. **Access (rule 1), S to M.** A script that reads the pins, sends the credential-free ranged GET to each pinned asset and prints the dated table that `analysis/ACCESS.md` now holds by hand. Run it at each adoption; a weekly `schedule` is an owner decision (no non-autopilot workflow has a schedule today).
  7. **Wording.** Let rule 14 name its four checks, and let `AGENTS.md:3` say which rules are checked by a person. AGENTS.md is the owner's file.
- **Fix type.** Step 5 is Mechanical (one new file). Steps 1, 3, 4 and 6 are mechanical to write, but each adds a check, which the handoff reserves for the owner ("each adds or changes a check", item 12): Owner decision. Steps 2 and 7: Owner decision.
- **Effort and risk.** S each except step 2 (M). Risk: step 1 fails every pull request until the 26 links are fixed, so fix them in the same pull request; step 3 can match a test fixture, so give it an allow-list with one dated line per entry rather than a looser pattern.

### P1-9. The Python pipeline is reproducible from pinned inputs, but its order lives in prose and dated run scripts, a third of its test methods cover one family, and its README still says the downloader refuses the adopted release

- **What.** `analysis/` is one flat folder of 87 scripts with no packaging, lint or type check. Inputs are pinned by sha256 and downloaded without a credential, so a stranger can rebuild a figure, but only by following about 215 lines of prose in `docs/OPERATIONS.md` in the right order: there is no single ordered entry point. The pipeline has two stages (the second reads the committed lookup shards), which no document states in one place. Tests are concentrated on the half family, and one sentence of the README contradicts the downloader.
- **Evidence.**
  - Layout: `ls analysis/*.py | wc -l` gives 87 (24,407 lines); 18 of them are `test_*.py` (5,246 lines, 256 `def test_` methods). 27 more `.py` files sit under `analysis/course_terrain`. None of `analysis/__init__.py`, `pyproject.toml`, `setup.cfg`, `setup.py`, `ruff.toml`, `.flake8`, `mypy.ini`, `tox.ini`, `pytest.ini`, `analysis/conftest.py` exists, and 14 files put their own folder on `sys.path` (for example `analysis/adapt_master.py:55-56`, `analysis/build_half.py:32-33`). `analysis/requirements.txt` pins three packages exactly (duckdb 1.4.4, numpy 2.5.3, pandas 3.0.5), without hashes.
  - Pins: `analysis/release.json` (tag `master-20261103b`, `layout: master`, a digest per asset and of the checksum file), `analysis/half-release.json` (schema 3, `half-dataset-20261030-1904`), `analysis/weather-release.json` (the release tag plus the conditions asset `dataset-20261103-0706` with its digest). `analysis/download_release.py:1-8` needs no token.
  - Two stages. Stage A reads the downloaded release: `download_release.py` hands a `master-*` pin to `adapt_master.py` (`analysis/download_release.py:185-192`), then `build_pacing.py`, `build_extended.py`, `build_runner_lookup.py`, `build_weather.py`, `build_public_explorer.py` and the importers write `public/data`. Stage B reads the committed lookup under `public/data/runners` as its input: `analysis/insights_data.py:90` (stories and charts), `analysis/build_fast_start.py:364`, `analysis/build_fast_start_all.py:261`, `analysis/build_all_finisher_context.py:277`, `analysis/build_runner_context.py:138`, `analysis/build_insights.py:82`, `analysis/insights_courses.py:56`, `analysis/build_half.py:91,115`, `analysis/half_marathon.py:31`. Three workflows therefore rebuild with no download at all (`charts.yml:55-60`, `fast-start.yml:38-45`, `all-finisher-context.yml:37-40`) and compare bytes ("Rebuilt chart files must match the published bytes").
  - Order: the ordered command list is prose, `docs/OPERATIONS.md:252-465` (ten sections from "Reproduce and audit the current input" to "Half refresh"), and five dated run records with one machine's paths: `git ls-files 'docs/evidence/**/pipeline*.sh'` lists `2026-10-21/release-1050/pipeline.sh` (42 lines), `2026-10-22/chicago-2025-weather/pipeline.sh` (39), `2026-11-04/release-master-20261103b/pipeline-m2.sh` (61) and `pipeline.sh` (20), `2026-11-05/person-id/pipeline.sh` (62; its lines 5-6 say "Order as docs/OPERATIONS.md binds it. The weather evidence is copied before the Top 100 charts, which bind it by hash; verify-weather renders pages that read the all-finisher context and the stories, so it runs after them", and line 9 is `cd /home/user/wt/pid`). No `Makefile`, `justfile` or ordered script exists at the root or under `analysis/`.
  - Test shape, methods per file: `test_half.py` 85 (33%), `test_insights.py` 32, `test_course_terrain.py` 22, `test_runner_environment.py` 13, `test_all_finisher_context.py` 12, `test_adapt_master.py` 11, `test_weather.py` 11, `test_download_release.py` 10, `test_fast_start_all.py` 10, `test_runner_peers.py` 10, `test_charts.py` 9, `test_fast_start.py` 9, `test_source_quality.py` 7, `test_personalized.py` 4, `test_public_explorer.py` 4, `test_history.py` 3, `test_pacing.py` 2, `test_calculation_provenance.py` 2. `build_pacing.py` (29,770 B, the builder of the site's core metric) has 2 test methods; `build_extended.py` (68,393 B, 659 lines) has no test file of its own.
  - Modules that no test file names (loop in the appendix): 22 of 69 non-test modules: the twelve `charts_*_1/2.py` files and `charts_more.py` (13 files, 5,134 lines), `half_policy_lists.py` (777), `insights_replay.py` (183), `insights_demographics.py` (172), `write_findings.py` (144), `import_packs.py` (102), `inspect_export.py` (79), `audit_expanded.py` (62), `import_public_explorer.py` and `import_runner_context.py` (46 each). This is a name heuristic: the chart modules run through `build_charts.py` in `test_charts.py`, and every published chart is recounted in Node (`scripts/verify-charts.cjs`) and rebuilt and compared in CI, so "not named" is not "not covered". `half_policy_lists.py` (the frozen policy lists of rule 4) is the one I would look at first.
  - Self-skipping tests: `analysis/test_half.py:950,1007` (need the `zstd` command), `:1667` (`MATCHING_V4.md` on the machine), `:1953` (`platform_half.sqlite` and `PACE_HALF_SOURCE_TESTS=1`), `:1975` (`links-v4.sqlite`). The refresh record counts "254 run" of 256 on November 5, 2026 (`docs/REFRESH_20261103b.md:101`).
  - Contradiction: `analysis/README.md:21` says the downloader "accepts only `private-export-*` and `htw-db-*` tags", while `analysis/download_release.py:185-192` accepts the pinned `master-*` tag first, and the adopted pin is `master-20261103b`. The Python version sentence ("Python 3.12 (as in CI)", `analysis/README.md:35`) is in P1-5.
  - Logic written twice by design: `analysis/charts_*.py` and `build_charts.py` (5,457 lines) against `scripts/charts/*.cjs` (3,648); `scripts/half`, `scripts/nuggets` and `scripts/lib` (3,609 lines); the terrain model in four places (`analysis/terrain_model.py` 109 lines, `analysis/course_terrain/validation-2026-10-23/terrain_model.py` 80, `scripts/lib/terrain-model.cjs` 145, `lib/tools/terrain-band.ts` 242), held together by parity fixtures (`scripts/half/fixtures/parity.json`).
- **Status.** Verified by me (file counts, greps and reading the files named; the commands are above and in the appendix). Not run by me: the Python suite and any builder (out of bounds). Inferred: that the thirteen chart modules are exercised through `test_charts.py`.
- **Why it matters.** Rule 5 and rule 23 rest on the pipeline being repeatable by the next agent. Today the order is recovered by reading prose and the last agent's run script, and the two real ordering constraints (weather evidence before the charts that bind its hash; the lookup import before every stage B builder) are written as a comment in a dated evidence file. A wrong order does fail loudly (hashes are bound), so the cost is time, not wrong figures: each adoption has needed a new hand-written `pipeline.sh`. The duplicated logic is a strength (an independent recount) and should stay; its cost is that a method change is made twice, which the parity fixtures already catch.
- **Proposed change.**
  1. **Mechanical, S.** Correct `analysis/README.md:21`: say that the pinned `master-*` tag with `layout: master` is handed to `adapt_master.py` and that other tags must start `private-export-` or `htw-db-`. Move the superseded sentence verbatim to a dated History section at the end of that file (rule 19).
  2. **Mechanical, S.** Add a short "Two stages" paragraph to `analysis/README.md` listing the stage B readers above, so that an agent changing `build_runner_lookup.py` knows what must be rebuilt after it. P1-4 step 3 needs the same list.
  3. **Owner decision, M.** One ordered entry point checked into the repository, for example `analysis/pipeline.py` with a declared list of steps (name, command, inputs, outputs, the verifier that follows), `--from STEP`, `--list` and paths taken from arguments, written from the November 5 run record. `docs/OPERATIONS.md:252-465` then cites it instead of restating commands (superseded text archived verbatim). It replaces a sixth hand-written `pipeline.sh` at the next adoption. It does not run in CI and reads no new data, so it changes no check.
  4. **Engineering, M.** Unit tests on small synthetic frames for `build_pacing.py` (the sustained-slowdown rule of rule 14: at least 25% for at least 5 km after 20 km against the 5-20 km baseline, with boundary cases) and for `half_policy_lists.py`. These add tests, not gates; they run wherever the suite already runs.
  5. **Owner decision, S.** A Python lint (`ruff check analysis` with the default rule set) in the job that P1-8 step 4 proposes. It adds a check, so it is the owner's call; expect a first run to report unused imports and variables in a 24,000-line folder that has never been linted (not measured: ruff is not installed here and I did not install it).
- **Fix type.** Steps 1 and 2: Mechanical (`analysis/README.md`). Step 4: Engineering. Steps 3 and 5: Owner decision.
- **Effort and risk.** S for steps 1, 2 and 5; M for 3 and 4. Risk: low. Step 3 must not become a second source of truth: generate the operations text from it or delete the restated commands, never keep both.

### P1-10. The documents are too large to read each session and repeat their facts: 2.47 MB of Markdown, a 172 KB start-here set, one count in ten documents, paragraphs of up to 2,913 characters on one line

- **What.** An agent that follows `AGENTS.md` "Start here" and the handoff's "Read in order" opens about 172 KB before the contract document of the subsystem it changes, and the largest contracts are 88 KB to 157 KB each. The same release count is written in up to ten current documents, so every adoption needs a sweep (rule 21) and a missed line becomes a stale statement (P0-3). Long paragraphs sit on single lines, so a one-word change shows as a whole-paragraph diff.
- **Evidence.**
  - Totals: `git ls-files '*.md'` lists 67 files, 12,949 lines, 2,468,939 B. `docs/history` holds 23 of them with 1,006,015 B (41%).
  - The start-here set: `AGENTS.md` 20,117 B, `docs/PROJECT_HANDOFF.md` 23,923 B, `docs/OPERATIONS.md` 72,393 B, `analysis/README.md` 55,094 B: 171,527 B, roughly 43,000 tokens at four bytes a token (an estimate, not a measurement). The handoff's "Read in order" (`docs/PROJECT_HANDOFF.md:98-105`) links 25 documents.
  - The largest current contracts: `docs/ANALYSIS_CATALOG.md` 157,435 B, `docs/TOOLS.md` 127,400 B, `docs/HALF_MARATHON.md` 99,703 B, `docs/ANALYTICS.md` 87,953 B, `docs/OPERATIONS.md` 72,393 B, `docs/WEBSITE_ARCHITECTURE.md` 61,763 B, `analysis/README.md` 55,094 B, `docs/SEO.md` 53,040 B.
  - Lines over 1,000 characters (the count, then the longest line): `docs/TOOLS.md` 41 (2,708), `docs/ANALYTICS.md` 31 (1,857), `docs/HALF_MARATHON.md` 28 (2,913), `docs/WEBSITE_ARCHITECTURE.md` 12 (1,866), `analysis/README.md` 11 (2,297), `docs/OPERATIONS.md` 7 (1,951). Ten lines outside `docs/history` exceed 2,000 characters (`docs/TOOLS.md` 4, `docs/HALF_MARATHON.md` 3, `docs/STORIES.md`, `docs/RUNNER_CONTEXT_AND_PEERS.md` and `analysis/README.md` 1 each). In `AGENTS.md`, rule 4 has a line of 1,348 characters (line 20) and rule 13 one of 1,127 (line 32).
  - One count in many places (`git grep -l -F -e "<n>" -- '*.md' ':!docs/history' ':!autopilot'`): `4,222,246` (eligible finishes, `master-20261103b`) in 10 documents, 21 occurrences: `analysis/ACCESS.md`, `analysis/README.md`, `docs/ALL_FINISHER_ANALYSES.md`, `docs/ANALYSIS_CATALOG.md`, `docs/DATA_ARCHITECTURE.md` (2), `docs/FAST_START_ANALYSIS.md`, `docs/HALF_MARATHON.md` (2), `docs/PROJECT_HANDOFF.md` (2), `docs/REFRESH_20261103b.md` (9), `docs/RUNNER_CONTEXT_AND_PEERS.md`. Also `5,388,605` in 7 documents (13 occurrences), `4,257,513` in 3 (4), `4,162,015` in 2 (3), `3,631,904` in 2 (2).
  - A superseded section in the body of a current contract: `docs/TOOLS.md:341-372`, "## Course-shape band (owner decision, October 20, 2026) — superseded October 23, 2026", 15,022 B (12% of the file), above the file's own `## History` at line 373. Its own note says it "is not the current contract" and is "kept here so its links keep working" (five links use its anchor, for example `docs/OWNER_DECISIONS.md:20`).
  - In-file history: 16 current documents end in a `## History` section. It is 36% of `docs/RUNNER_CONTEXT_AND_PEERS.md` (7,031 of 19,383 B), 29% of `docs/FAST_START_ANALYSIS.md` (8,077 B), 26% of `docs/DATA_ARCHITECTURE.md` (10,490 B), 25% of `docs/WEATHER_ANALYSES.md` (5,443 B), 21% of `docs/TOP_TEN_ANALYSES.md` (6,574 B), 20% of `docs/KNOWN_ISSUES.md` (7,119 B).
  - Discoverability is otherwise good: the handoff's Subsystem index (`docs/PROJECT_HANDOFF.md:42-63`) gives contract, builder, verifier and workflow per subsystem in one table, and `docs/history/README.md` indexes the archive (21 rows for 22 archived files; `handoff-2026-11-05-current-state-before-person-id.md` has no row, see P0-3).
  - Contradictions between a document and the code are listed where they belong: P0-3 (state lines, including the handoff's "current 1050 refresh" at `docs/PROJECT_HANDOFF.md:102`), P1-3 (`docs/OPERATIONS.md:40`), P1-5 (Python version), P1-9 (`analysis/README.md:21`), P2-13 (`docs/WEBSITE_ARCHITECTURE.md:164`).
- **Status.** Verified by me (byte, line and occurrence counts by the commands shown; the section sizes by an `awk` sum per heading). Inferred: the token estimate, and that the reading load causes missed lines (the stale lines of P0-3 are consistent with it, not proof of it).
- **Why it matters.** The maintainers are agents with a bounded context. A start-here set of about 43,000 tokens plus a 25,000 to 40,000 token contract is spent before any code is read, on every session, and the sweep that rule 21 requires grows with every document that repeats a count. The four documents with a stale claim about production (P0-3) are the visible result. Rule 19 forbids fixing this by rewriting; everything below moves text verbatim or adds text.
- **Proposed change.**
  1. **Mechanical, S.** Move `docs/TOOLS.md:341-372` verbatim to below `## History` in the same file. The heading and its anchor are unchanged, so the five links keep working, and the current contract ends where its last current section ends. This does not shrink the file; step 3 does.
  2. **Engineering (documents), M.** Counts in one place. In each contract document, replace a repeated release count by a link to the refresh record or the generated facts file of P1-8 step 2, keeping one tagged count where the contract's own rule needs it (rule 21: "a count in a contract document carries its release tag"). Each removed sentence moves verbatim to the file's History section, dated. Rule 21's sweep then covers two or three files instead of ten.
  3. **Mechanical, S to M.** Move the six largest in-file `## History` sections (above) verbatim into `docs/history/<subject>-<date>.md`, leave a one-line pointer under the heading so `#history` anchors still resolve, and add the rows to `docs/history/README.md`. Rule 19 allows either place; the archive keeps a current contract short. About 45 KB leaves the current contracts.
  4. **Convention, S.** For new and edited paragraphs, one sentence per line (Markdown joins them when rendered; table rows and list items keep their present form). Do not reflow existing text in bulk: it would touch every line of every contract and hide real changes in the history. State the convention in `docs/OPERATIONS.md`.
  5. **Owner decision.** Split "always read" from "read when you change it" in the handoff's "Read in order", so that the always-read set is `AGENTS.md`, the handoff's first three sections and the one contract. `AGENTS.md` and the handoff are the owner's files.
- **Fix type.** Step 1: Mechanical (`docs/TOOLS.md`, a cut and paste of lines 341-372 to the end of the file). Step 3: Mechanical (documents). Step 2: Engineering (documents). Step 4: convention, added text in `docs/OPERATIONS.md`. Step 5: Owner decision.
- **Effort and risk.** S for steps 1 and 4; S to M for step 3; M for step 2. Risk: broken anchors. Run the link check of `docs/OPERATIONS.md:56` (or `linkcheck.py` from the appendix) before and after each move.

---

## 4. P2: polish

Smaller items. Each is real and verified unless it says otherwise; none is urgent.

### P2-1. Runner search needs `DecompressionStream`: older Safari gets a plain message that points at a download the page does not show, the limit is in no document or check, and the second decompression call has no guard of its own

- **What.** The runner lookup is served as `.json.gz` files that the page decompresses itself. Safari before 16.4 and Firefox before 113 have no `DecompressionStream`, so `/runners` cannot search there. The search path handles this with a plain message, which is good; three loose ends remain.
- **Evidence.**
  - `git grep -n "DecompressionStream" -- app components lib scripts docs` prints three lines: `lib/runner-search.ts:109` (the guard: `if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open the compressed search files. Please use a current browser, or download the full export below.');`), `lib/runner-search.ts:110` and `lib/runner-context.ts:103`. No document mentions it.
  - The message says "download the full export below", but the page has no such link: `git grep -n -i -E "download|#downloads" -- app/runners components/RunnerSearch.tsx components/RunnerContext.tsx` prints nothing. The open data is reached from the menu (`components/SiteNav.tsx:35`, "Open data" to `/methodology#downloads`); the footer (`components/SiteFooter.tsx:16-19`) has no downloads link.
  - `lib/runner-context.ts:103` calls `new DecompressionStream('gzip')` with no check. It is reachable only after the guarded loader has succeeded: `RunnerContext` is rendered only at `components/RunnerSearch.tsx:180`, with races that came from `loadRunnerProfile` (`components/RunnerSearch.tsx:272`), which goes through `loadShard` (`lib/runner-search.ts:97-117`). So it is latent, safe by call order only. If reached, `components/RunnerContext.tsx:291` would show the engine's own error text in the alert at line 310.
  - The static check does not know the built-in: `scripts/verify-browser-compat.cjs:28-34` lists lookbehind, `structuredClone`, `findLast`, the `toSorted` family and `groupBy`. The old-Safari scenario (`scripts/e2e/browser.cjs:75-79`, `scripts/e2e/scenarios/s5-old-safari.cjs:21`) makes lookbehind throw and opens pages; it leaves `DecompressionStream` in place and does not search.
  - `docs/WEBSITE_ARCHITECTURE.md:157-170` ("Older browsers and error pages") describes what was fixed for Safari before 16.4 and says "Not covered: CSS, other syntax (Next.js compiles it down for Safari 12) and real devices"; the search limit is not in that list.
- **Status.** Verified by me (greps and reading the call paths). Not verified: the share of visits on such browsers (analytics not read), the engine's exact error text, and the rendered page (I read the files, not a browser).
- **Why it matters.** The site went to some length to open on Safari 15 (#56). On those browsers its second most important page opens and then refuses its main action, with a message that sends the visitor to a link that is not there. Whether to support them is a product choice; the message and the record of the limit are not.
- **Proposed change.**
  1. **Mechanical, S.** In `components/RunnerSearch.tsx:321`, when the search error is this one, render a link to `/methodology#downloads` beside it, or change the sentence at `lib/runner-search.ts:109` to "…or use Open data in the menu". No verifier asserts this sentence (`git grep -n -F -e "compressed search files" -e "full export" -- scripts` prints nothing). Note that the alert also offers "Try again", which cannot help on such a browser.
  2. **Mechanical, S.** Before `lib/runner-context.ts:103`, add the same `typeof DecompressionStream === 'undefined'` test with a plain message. Add a rule to `scripts/verify-browser-compat.cjs`: a file that contains `new DecompressionStream` must also contain `typeof DecompressionStream`. That tightens a check; it weakens none.
  3. **Mechanical, S.** Add one sentence on the limit to `docs/WEBSITE_ARCHITECTURE.md` (older browsers) and `docs/KNOWN_ISSUES.md` (added text).
  4. **Adds a check (owner, handoff item 12), S to M.** In the `safari15` emulation delete `window.DecompressionStream`, and let S5 search once on `/runners` and expect the plain message.
  5. **Owner decision.** Support those browsers: either a small inflate fallback loaded only when the built-in is missing, or plain `.json` shards that the host compresses (which also serves P0-1 and P1-4).
- **Fix type.** Steps 1 to 3: Mechanical. Step 4: Owner decision (adds a check). Step 5: Owner decision.
- **Effort and risk.** S for steps 1 to 3. Risk: low; step 1 changes visible copy, so run `verify-runner-search` and the copy checks.

### P2-2. Fonts and content-addressed data are revalidated on every visit; only `/_next/static` is cached for long

- **What.** Vercel's default for files from `public/` is `max-age=0, must-revalidate`. The fonts and the data files that are fetched by digest never change under their URL, so each visit pays a conditional request for each of them.
- **Evidence (read November 9, 2026, production `068b6c37` per `/version.json`).** `curl -sS -I -H 'accept-encoding: br' https://splithappens.run<path>`:

  | Path | `cache-control` | Notes |
  | --- | --- | --- |
  | `/fonts/inter-latin-wght-normal.woff2` | `public, max-age=0, must-revalidate` | 48,256 B; one of the two faces `app/layout.tsx:57` preloads on every page |
  | `/data/runners/manifest.json` | `public, max-age=0, must-revalidate` | `br`, `x-robots-tag: noindex` |
  | `/data/live.json` | `public, max-age=0, must-revalidate` | 283 B |
  | `/version.json` | `no-store` | set by `vercel.json:35-41`, which shows a `vercel.json` header rule does override the default for a static file |
  | `/_next/static/*` | `public,max-age=31536000,immutable` | Next's hashed files |

  All nine runtime data call sites carry `?v=` (`git grep -n -F "?v=" -- lib components app`). Six carry a sha256 of the content (`lib/runner-search.ts:103`, `lib/runner-context.ts:99`, `lib/all-finisher-context.ts:106`, `lib/fast-start.ts:107`, `lib/half.ts:25`, `lib/insights.ts:85`). Three carry a release tag or vintage, which is **not** a content version: `lib/runner-search.ts:88` and `lib/runner-context.ts:111` (`manifest.json?v=<release tag>`) and `lib/analysis-aggregates.ts:13`. The lookup manifest changed under an unchanged tag on November 5, 2026: `git show b35789b8a:public/data/runners/manifest.json` and `git show 068b6c370:…` both say `release_tag` `master-20261103b`, with digests `8f593e05…` (925,805 B) and `f1caea12…` (926,144 B).
- **Status.** Verified by me (live headers; greps; the two manifest versions). Inferred: the saving, which is one round trip per file per visit (a 304 has no body), not megabytes.
- **Why it matters.** Small: two preloaded fonts and up to eleven more faces revalidate on each cold navigation, and a returning runner-search visitor revalidates shards that cannot have changed. The warning matters more than the saving: a blanket long cache on `/data/*` requests with `?v=` would have broken search for returning visitors after #91, because the manifest's `v` did not change.
- **Proposed change.**
  1. **Mechanical, S.** In `vercel.json`, add a rule `{ "source": "/fonts/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800, stale-while-revalidate=2592000" }] }`. Not `immutable`: font file names carry no content hash (`public/fonts/*.woff2`, copied from fontsource by `scripts/fonts/copy-fonts.cjs`).
  2. **Mechanical, S, optional.** A rule for `/data/:path*` with `"has": [{ "type": "query", "key": "v", "value": "[0-9a-f]{64}" }]` and `Cache-Control: public, max-age=31536000, immutable`. The value pattern is the point: it leaves the three tag-versioned requests on revalidation. The `has` form is the one `vercel.json:42-46` already uses.
  3. **Engineering, S, better than a comment.** Version the two manifest requests by content: have a build-time module hash `public/data/runners/manifest.json` and `public/data/runner-context/manifest.json` (as `lib/insights-server.ts:33` does for its files) and pass the two digests as props to the components that call `loadRunnerManifest` (`lib/runner-search.ts:88`) and `loadRaceInsights` (`lib/runner-context.ts:111`), to use as `v` in place of the release tag. Today the runner manifest's digest is computed only in the browser, after the download (`lib/runner-search.ts:92-93`). Then no data URL can outlive its bytes.
- **Fix type.** Steps 1 and 2: Mechanical (`vercel.json`). Step 3: Engineering.
- **Effort and risk.** S. Risk for step 2 without its value pattern: stale manifests, as above. Read the headers on a preview deployment before merging; `docs/WEBSITE_ARCHITECTURE.md` should record the rule (rule 19).

### P2-3. Twenty-four scripts each carry their own TypeScript loader, in seven spellings

- **What.** Verifiers load the site's `.ts` and `.tsx` modules by registering a `require` hook that transpiles with `typescript`. The same eight lines (hook, `@/` alias resolver) are pasted into 24 scripts with small differences.
- **Evidence.** `grep -l -E "transpileModule" -r scripts --include=*.cjs | wc -l` gives 24 (20 verifiers, the builders `build-chart-cards.cjs` and `build-og-images.cjs`, and `scripts/e2e/inspect.cjs`; 25 hooks, one file has two); for example `scripts/verify-seo.cjs:33-40`. `grep -h -o -E "compilerOptions: \{[^}]*\}" …` shows seven spellings: target ES2022 in 19 hooks and ES2020 in 6; `jsx` present in 22 and absent in 3; `resolveJsonModule` in 6. `scripts/lib/` holds three shared files (`png-stamp.cjs`, `terrain-model.cjs`, `words.cjs`) and no loader.
- **Status.** Verified by me (greps). Inferred: that the differences are accidental; I did not test each script under one option set.
- **Why it matters.** A change to how verifiers read the site's modules (a new alias, a JSON import, a newer target) must be made 24 times, and a verifier that transpiles differently from its neighbour can pass where the other fails.
- **Proposed change.** `scripts/lib/ts-require.cjs` exporting one `register(root)` with the superset options (ES2022, `esModuleInterop`, `jsx: ReactJSX`, `resolveJsonModule`) and the `@/` resolver; each script replaces its block with `require('./lib/ts-require.cjs').register(ROOT)`. Convert one family at a time and compare each verifier's output before and after.
- **Fix type.** Engineering (mechanical per file, but it touches 24 checks, so each needs a before-and-after run).
- **Effort and risk.** M (the runs, not the edit). Risk: low; the superset is what 14 of the hooks already use plus `resolveJsonModule`.

### P2-4. Twenty-three exports are used nowhere

- **What.** Exported names that no file imports and their own file does not use.
- **Evidence.** From `exports.cjs` (scratch folder; a name-based heuristic over `app`, `components`, `lib` and `scripts`): `components/art/useTicker.ts` `useInView`; `components/story/Units.tsx` `DistanceUnit`, `TemperatureStep`, `PerDegree`, `PerDegreeRange`; `components/tools/QualifyingRaceText.tsx` `possessive`; `components/viz/scale.ts` `niceTicks`; `lib/charts/fmt.ts` `paceUnit`; `lib/charts/spec.ts` `FORMS`; `lib/charts-server.ts` `chartByNumber`; `lib/fast-start.ts` `referenceTimeDifference`; `lib/insights-server.ts` `insightFileVersion`, `clientArchetypes`; `lib/nuggets/format.ts` `degreeStep`; `lib/report-shared.ts` `TONE`; `lib/research-data.ts` `getLive`, `liveRows`, `readableLabel`; `lib/seo-routes.ts` `isIndexable`; `lib/tools/pace.ts` `timeFrom`, `distanceFrom`, `watchPace`; `lib/tools/weather.ts` `shadeWbgt`. A further 34 exports are named only by verifiers (P1-6 confirms two of them), and 359 are used only inside their own file (the `export` keyword is surplus).
- **Status.** Verified by a script of mine, which matches names, not bindings. Re-grep each name (`git grep -n -w <name> -- app components lib scripts`) before deleting; a name used through a re-export or a string would be missed.
- **Why it matters.** Dead exports are read, type-checked and kept consistent by agents that cannot tell they are dead. Tree-shaking keeps them out of the bundle, so visitors pay nothing.
- **Proposed change.** Delete the 23 after the re-grep; `npx tsc --noEmit -p .` and the build prove nothing else used them. An ESLint rule or `ts-prune` in CI would keep the list at zero but adds a check (owner, handoff item 12).
- **Fix type.** Mechanical (the files above), after the re-grep.
- **Effort and risk.** S. Risk: low; the type check fails on a wrong deletion.

### P2-5. Three pack index files from September are still published and nothing reads them

- **What.** `public/data/packs/INDEX.json` (1,046 B), `PACK_IDS.json` (1,207 B) and `PACK_IDS.analyst.json` (14,512 B) sit beside the 34 `ext_*` pack folders.
- **Evidence.** `git grep -n -I -E "packs/(INDEX|PACK_IDS)|PACK_IDS(\.analyst)?\.json" -- . ':!public/data'` prints nothing: no code, script, workflow or document names them. `git log -1 --format='%h %ad' --date=short -- public/data/packs/INDEX.json` gives `a18b655e9 2026-09-12` (#36), before the last three release adoptions (#70, #78, #89). They are served at `/data/packs/INDEX.json` and so on.
- **Status.** Verified by me (grep and log). Not checked: whether anything outside the repository fetches them.
- **Why it matters.** They describe a pack set that no longer exists, in a public folder whose other files are bound to the adopted release (rule 5: "Do not fall back to historical chart files"; these are not chart files, but they are stale published metadata).
- **Proposed change.** `git rm` the three files; Git history keeps them (rule 5: "Preserve historical numerical evidence in Git history"). Record it in the handoff (rule 19).
- **Fix type.** Mechanical (three deletions).
- **Effort and risk.** S. Risk: a 404 for an outside reader of a file that nothing links.

### P2-6. One build-time reader answers a missing file with an empty list where its neighbour throws, and it holds the project's only `any`

- **What.** `lib/research-data.ts:44` declares `readJson(file: string): any | null`, the single `any` type under `app/`, `components/` and `lib/`. `table()` (lines 50-57) throws on a stale pack (`Stale analysis pack: <name>`, line 54) but returns `[]` when the pack's meta file is missing or unreadable, when its status is not `ready` or `ok` (line 53) and when the CSV itself cannot be read (line 56, a bare `catch`). `lib/extension-data.ts:19-40`, the reader beside it, throws in the matching cases (`Stale analysis source: <name>`, `Invalid ready extension pack: <name>`).
- **Evidence.** `git grep -n -E "readJson\(" -- lib app components` prints three lines, all in this file (44, 52, 60). The only caller of this `table()` is `lib/nuggets/home.ts:62`, which feeds the home page's "second 20K" figure; given an empty list, `second20kFrom(null)` (`lib/nuggets/home.ts:43-58`) shows the fallback sentence "The second 20K against the first, finish by finish." and no figure. The pack is healthy today: `public/data/packs/ext_pacing_shapes/pack_meta.json` has `status: ready` and `input_export_id: master-20261103b`, the tag in `analysis/release.json`. `scripts/verify-nuggets.cjs:253-268` reads the same CSV on its own and compares the share (line 259), so a dropped figure fails `verify:data`.
- **Status.** Verified by me (files read; grep). The verifier was not run.
- **Why it matters.** Two different things look the same on the page: "this figure is under its guard" (rule 13: the fallback shows) and "a file is missing from the build" (a defect). The verifier tells them apart in CI, but the deploy does not run it: `package.json:8` is the build, and `vercel.json` sets no `buildCommand` (the Vercel project's own settings were not read). The `any` also lets `getStudyEvidence()` (lines 59-67) hand an object to every caller as `CurrentStudy` after five field checks.
- **Proposed change.** (1) At `lib/research-data.ts:44` return `unknown` and narrow at the two call sites: `meta` to `{ status?: string; input_export_id?: string } | null`, `study` through the existing checks. (2) In `table()` keep `[]` for "not an `ext_` pack" and "status not ready" (those are states) and throw `Missing table ${name} in ready pack ${pack}` when a ready pack's CSV cannot be read, as `lib/extension-data.ts` does. No guard or floor changes: a ready pack with its table gives the rows it gives today.
- **Fix type.** Mechanical (`lib/research-data.ts:44-57`: two narrowings and one `throw`).
- **Effort and risk.** S. Risk: low; the build then fails where it now drops a figure, which is the intent. Run `npm run verify:data` and `npm run build` (rule 23).

### P2-7. Two `useMemo` calls in the race plan never reuse their value

- **What.** `components/tools/RacePlan.tsx:279-281` builds `result` and `published` during render, and both are new objects on every render: `courseGoalResult` returns an object literal on each path (`lib/tools/plan.ts:75-83`) and so does `publishedGoal` (`lib/tools/plan.ts:34`). Both are dependencies of the `share` memo (lines 282-288) and `published` of the `spread` memo (292-298), so once the course-goal file has loaded each memo recomputes on every render.
- **Evidence.** The ESLint run of P1-3 reports it twice: `components/tools/RacePlan.tsx 280:9 react-hooks/exhaustive-deps: The 'published' conditional could make the dependencies of useMemo Hook (at line 288) change on every render`, and the same for line 298 (`eslint.review.json` in the scratch folder). ESLint does not flag `result` because it comes from a function call; the function's source shows it is a fresh object too.
- **Status.** Verified by me (lint output and source).
- **Why it matters.** Little at run time: the repeated work is two passes over 875 rows (`public/data/insights/tools/course-goal.json`, 161,449 B). The cost is code that claims a memo it does not have, and two of the five warnings that stand between this repository and a lint job that can require zero (P1-3).
- **Proposed change.** Wrap both values in `useMemo`, keeping their names: `published` with `[goalData.data, goal, exampleOn, example]` and `result` with `[goalData.data, goal, course]` (`course` is an element of the `courses` prop, line 216, so its reference is stable). Keep the names because `scripts/verify-tools.cjs:1024` matches `result?.state === 'unavailable' && goalData.data && offered` in the source text. The other three warnings: `components/QuestionViz.tsx:62` goes with the file (P1-6); `components/story/ArchetypeStory.tsx:37` uses `key = times.join(',')` as a stand-in for `times` on purpose and wants a one-line disable comment with that reason; `components/report/ReportActions.tsx:143` is an `<img>` for an image drawn in the browser, where `next/image` has nothing to optimise in a static export, so `@next/next/no-img-element` belongs off in the config.
- **Fix type.** Mechanical (`components/tools/RacePlan.tsx:279-281`).
- **Effort and risk.** S. Risk: low; `scripts/verify-tools.cjs:411-412` renders the component and lines 437-1110 assert on its source, so run `node scripts/verify-tools.cjs` after the edit.

### P2-8. The first-load budget counts 31 KB that current browsers never download

- **What.** `scripts/e2e/scenarios/s8-budget.cjs:31-37` sums the gzip (level 9) size of every `<script src>` the exported HTML names. One of them is Next's `nomodule` polyfill chunk, which a browser with module support skips.
- **Evidence.** The live home page names 13 scripts, one of them `<script src="/_next/static/chunks/polyfills-78c92fac7aa8fdd8.js" noModule="">` (saved as `live/home.html` in the scratch folder). Served uncompressed it is 91,381 B, the size of `node_modules/next/dist/build/polyfills/polyfill-nomodule.js`; `zlib.gzipSync(file, { level: 9 }).length` gives 31,084 B (as served: 31,374 B gzip, 32,681 B brotli). So 31,084 B of the 152,647 B figure for `/` in `scripts/e2e/budget.json` is not first load in any browser the site supports, and the same constant sits in each of the 40 page figures (lowest 145,100; highest 196,356 for `/analyses/pacing-pattern`).
- **Status.** Verified by me (script read; sizes measured on November 9, 2026 against production `068b6c37`). The scenario was not run.
- **Why it matters.** The budget does its job: a constant hides no growth and the 1,536 B tolerance (`s8-budget.cjs:23`) applies to everything else. The only cost is a reader who takes 152,647 B as what a phone downloads, when it is about 121.6 KB gzip.
- **Proposed change.** Leave the measure, the figures and the tolerance alone (rule 23; `docs/OPERATIONS.md:49`: "never change the tolerance"). Add one sentence to the `note` in `scripts/e2e/budget.json` and one under "First-load budgets (S8)" at `docs/OPERATIONS.md:46`: each figure includes the 31,084 B `nomodule` polyfill chunk that current browsers skip. If the owner wants the figure to mean "downloaded by a current browser", that is a re-measure of all 40 figures on one day with a dated reason, not an edit.
- **Fix type.** Mechanical (two sentences). The re-measure would be an owner decision.
- **Effort and risk.** S. Risk: none.

### P2-9. `package.json` carries the old name, two scripts that cannot work and one font package that nothing uses

- **What.** `package.json:2` names the package `htw-live-study`. Lines 9-10 keep `"start": "next start"` and `"export": "next export"`. Line 36 installs `@fontsource-variable/jetbrains-mono`.
- **Evidence.** The font: outside `docs/history` and the lockfile, `git grep -n -i "jetbrains"` prints only `package.json:36` and a comment at `scripts/font-fallbacks.cjs:86`; `scripts/fonts/copy-fonts.cjs` copies three families and its header says no mono face is shipped (`app/styles/fonts.css:4` agrees). The scripts: `docs/PROJECT_HANDOFF.md:37` (owner item 12) already lists "removing the `export` and `start` scripts, which do not work with `output: 'export'`". The name: `git grep -n "htw-live-study" -- scripts .github app lib components vercel.json` shows only host names (`vercel.json:7`, `scripts/verify-seo.cjs:51`, `scripts/e2e/browser.cjs:21`), the repository name in release links (`lib/analytics-policy.ts:116`) and base-path fixtures (`scripts/verify-analytics.cjs:53-55`); `git grep -n -E "npm_package_name|pkg\.name|packageJson\.name" -- scripts lib app components .github next.config.mjs` prints nothing, so nothing reads the package name.
- **Status.** Verified by me (greps). The two scripts were not run.
- **Why it matters.** Small: one unused package for every `npm ci` and every audit, and a first line that names a project the site no longer calls itself.
- **Proposed change.** (1) Remove line 36 and refresh the lockfile with `npm install --package-lock-only`; the diff should touch that one package. (2) Rename to `pace-notes` in `package.json:2` and `package-lock.json:2,8`. Leave every `htw-live-study` host and repository name as it is: they are real addresses and compatibility names (rule 22). (3) Lines 9-10 wait for the owner's answer to item 12.
- **Fix type.** (1) and (2) Mechanical. (3) Owner decision, already asked.
- **Effort and risk.** S. Risk: low.

### P2-10. Twenty modules read files at build time; seven say so in their name and none is protected against a client import

- **What.** Twenty files under `components/` and `lib/` import `node:fs` to read `public/data` during the build. Seven are named `*-server.ts`. Thirteen are not: `lib/course-page.ts`, `lib/extension-data.ts`, `lib/nuggets/core.ts`, `lib/nuggets/runners.ts`, `lib/og-paths.ts`, `lib/personalized-data.ts`, `lib/research-data.ts`, `lib/stories.ts`, `lib/weather-data.ts`, `components/DataCoverage.tsx`, `components/half/HalfCharts.tsx`, `components/methods/MethodsData.tsx` and `components/methods/MethodsPages.tsx`. None imports `server-only`.
- **Evidence.** `git grep -l -E "from 'node:fs'|from 'fs'" -- components lib | wc -l` gives 20 (0 under `app/`); `git ls-files 'lib/*-server.ts'` gives 7; `git grep -n -E "server-only|client-only" -- app components lib package.json` prints one comment (`lib/finish-times-summary.ts:7`). The client side is marked consistently: 81 files start with `'use client'` and 24 components carry `.client.tsx` in their name.
- **Status.** Verified by me (greps).
- **Why it matters.** A client component that imports one of these by mistake fails the build with webpack's "Can't resolve 'fs'", which names a module and not the rule. `docs/OPERATIONS.md:48` records two accidental client imports on October 30, 2026 (#85); those cost bytes, and the same slip with a file reader costs a failed build and a search for the reason.
- **Proposed change.** Add `import 'server-only';` as the first line of the twenty files, but only after the loaders are one (P2-3). Next 14.2.5 resolves the marker itself (`node_modules/next/dist/build/create-compiler-aliases.js:135,140`), so the build needs no new package. The verifiers do not go through Next: they `require` these files in plain Node, where `server-only` is not installed (`ls node_modules/server-only` fails) and Next's compiled copy throws by design (`node_modules/next/dist/compiled/server-only/index.js`). The shared loader must therefore map `server-only` to `next/dist/compiled/server-only/empty.js` in its `Module._resolveFilename` hook; added to the files first, the import would break every verifier that loads them. Renaming the thirteen files to `*-server` is optional and touches many imports; the marker gives the protection without it.
- **Fix type.** Engineering (twenty one-line edits plus one mapping in the shared loader of P2-3).
- **Effort and risk.** S after P2-3, M with it. Risk: medium if done before P2-3 (verifiers fail to load), low after.

### P2-11. Formatting is load-bearing: no formatter, source lines up to 2,014 characters, and at least 105 assertions that match component source text

- **What.** There is no formatter configuration (P2-14). Page prose is written as single JSX lines, and five verifiers assert on the exact text of component source files.
- **Evidence.** Lines over 1,000 characters: 18 in `components/` and 2 in `scripts/`; over 400 characters: 164 in `components/`, 54 in `scripts/`, 32 in `lib/`, 27 in `analysis/` (`.py`) and 15 in `app/`. The longest: `components/methods/MethodsTools.tsx` 2,014, `components/methods/MethodsHalf.tsx` 1,843, `components/RunnerContext.tsx` 1,533, `scripts/verify-analytics.cjs` 1,330, `scripts/verify-tools.cjs` 1,221 (per folder: `git ls-files <dir> | grep -E "\.(ts|tsx|cjs|mjs|js|py|css)$" | xargs awk 'length($0)>400{b++} length($0)>1000{c++} END{print b+0, c+0}'`). Source-text assertions: `grep -c -E "assert\.(match|doesNotMatch)\([A-Za-z]*[sS]ource" scripts/verify-*.cjs` gives 84 in `verify-tools.cjs`, 11 in `verify-analytics.cjs`, 5 in `verify-runner-search.cjs`, 4 in `verify-units.cjs` and 1 in `verify-weather.cjs`; more use other variable names (the `section(planSource, …)` slices at `scripts/verify-tools.cjs:997-999`). An example is `scripts/verify-tools.cjs:1014`, which matches one whole `const bandState = …;` statement character for character.
- **Status.** Verified by me (counts). "At least 105" is a lower bound from one variable-name pattern.
- **Why it matters.** A one-word change to a 2,000-character line is a 2,000-character diff, hard to review and hard for an agent to edit by exact match. And a rename or a line break in a component can fail a verifier although the page is unchanged, so the cheapest refactors carry the most check failures. Both push work toward "leave it as it is".
- **Proposed change.** Do not run a formatter over the repository: it would rewrite thousands of lines and break the source-text assertions at once. (1) Convention for new or touched prose, stated once in `docs/OPERATIONS.md`: one sentence per source line inside a JSX paragraph (JSX joins the lines with one space, so the page is unchanged; check the rendered text where a sentence ends at an element). (2) When a source-text assertion fails on a refactor, replace it with an assertion on the rendered output, which most of these verifiers already produce with `renderToStaticMarkup` (`scripts/verify-tools.cjs:412`); that keeps the check and drops the dependence on spelling. Never delete such an assertion to make a refactor pass (rule 23).
- **Fix type.** (1) Mechanical (one paragraph of convention). (2) Engineering, as the files are touched.
- **Effort and risk.** S for the convention; the rest is incremental. Risk: none from the convention.

### P2-12. The budget file keeps its history in one 8,177-character JSON string

- **What.** `scripts/e2e/budget.json` (9,859 B) has three keys: `note` (415 characters), `pages` (40 figures) and `measured`, a single string of 8,177 characters holding 11 dated entries from six days (October 18 to 30, 2026). `docs/OPERATIONS.md:49` prescribes the growth: "add a dated entry at the top of the file's `measured` text, by hand".
- **Evidence.** `node -e "const b=require('./scripts/e2e/budget.json'); console.log(b.measured.length, Object.keys(b.pages).length)"` prints `8177 40`; `git log --oneline -- scripts/e2e/budget.json | wc -l` gives 13. Nothing reads the field: `grep -n "measured" scripts/e2e/scenarios/s8-budget.cjs` shows only a local variable, and `--write-budget` passes the committed object through (`s8-budget.cjs:91`).
- **Status.** Verified by me.
- **Why it matters.** Every re-measure rewrites one line of 8 KB, so the diff shows the whole history as changed and two branches that both re-measure always conflict on it.
- **Proposed change.** Make `measured` an array of strings, one per dated entry, newest first, splitting the existing text at its entry boundaries without changing a word (rule 19), and change the sentence at `docs/OPERATIONS.md:49` to "add a dated entry at the top of the `measured` list" in the same pull request. The script needs no change. Entries older than the current figures can later move verbatim to `docs/history`.
- **Fix type.** Mechanical (`scripts/e2e/budget.json`, `docs/OPERATIONS.md:49`). An autopilot run cannot do it (`scripts/` is protected).
- **Effort and risk.** S. Risk: none; the figures are untouched.

### P2-13. Comments and path lists that describe things the repository no longer has

- **What and evidence.** Each line below was read on the frozen commit.
  - `.github/workflows/public-explorer.yml:12` lists `analysis/test_runner_lookup.py` in its path filter; the file does not exist (`ls analysis/test_runner_lookup.py` fails; the lookup's tests are in `analysis/test_public_explorer.py`). Already with the owner as part of handoff item 12.
  - `.github/workflows/pacing-analysis.yml:34-36` gives a reason for the exact Python pin that `docs/REFRESH_20261103b.md:152` says no longer holds (detail in P1-5).
  - `scripts/verify-browser-compat.cjs:27` and `scripts/verify-analytics.cjs:620,677` scan `['app', 'components', 'lib', 'hooks', 'context']`; `hooks/` and `context/` do not exist. `docs/WEBSITE_ARCHITECTURE.md:164` and `:202` repeat the five names. Harmless (a missing folder scans as empty) and arguably deliberate cover for a folder someone adds later; the documents should say "and `hooks/` or `context/` if they are ever added" or drop them.
  - `next.config.mjs:25-27` sets `basePath` and `assetPrefix` from `NEXT_PUBLIC_BASE_PATH` "to allow GitHub Pages deployments". 30 files name the variable (25 outside `docs/`: 12 in `lib/`, 4 in `app/`, 4 in `scripts/`, 3 in `components/`, `next.config.mjs`, `README.md`). No workflow builds or deploys such a site: `grep -n -E "deploy-pages|upload-pages-artifact|configure-pages|NEXT_PUBLIC_BASE_PATH|gh-pages" .github/workflows/*.yml` prints nothing. `docs/SEO.md:134` records that the manifest link is wrong under a base path. Whether a Pages site exists outside the workflows was not checked (GitHub API not called).
  - `lib/packs.ts:12` calls its list the "Registry of the research packs (ids and titles) whose data files stay published under public/data/packs". None of its 46 ids has a folder there: `public/data/packs` holds 34 `ext_*` folders and the three stale files of P2-5.
- **Status.** Verified by me (files read; greps), except the existence of a Pages site.
- **Why it matters.** Each one sends a reader to look for something that is not there. The base-path support is the costly one: it is threaded through 25 source files and tested by `scripts/verify-analytics.cjs` (lines 53-55, 427, 435, 785, 908-912), and it is the stated reason the moved-page stubs exist (P2-17).
- **Proposed change.** (1) Fix the comment at `lib/packs.ts:12` and the two sentences in `docs/WEBSITE_ARCHITECTURE.md` (move the superseded sentences verbatim to the file's History section, rule 19). (2) `public-explorer.yml:12` and the `pacing-analysis.yml` comment are in the quick wins and P1-5. (3) Ask the owner one question: is the GitHub Pages build still wanted? If yes, add a job that builds with `NEXT_PUBLIC_BASE_PATH` set so the support is exercised; if no, the base path, the stubs and their tests can be retired in one planned change.
- **Fix type.** (1) Mechanical. (3) Owner decision.
- **Effort and risk.** S for (1). Retiring the base path would be M and touches the analytics and SEO verifiers; do not start it without the answer.

### P2-14. Repository conventions that would cost minutes are absent

- **What.** The root holds ten tracked files (`.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `next-env.d.ts`, `next.config.mjs`, `package-lock.json`, `package.json`, `tsconfig.json`, `vercel.json`) and `.github/` holds only workflows.
- **Evidence.** Absent, each checked by name: `.nvmrc`, `.node-version`, `.python-version`, `.npmrc`, `.editorconfig`, a prettier configuration, an ESLint configuration (P1-3), `.gitattributes`, `.github/dependabot.yml` or `renovate.json`, `CODEOWNERS`, `.github/pull_request_template.md`, `.pre-commit-config.yaml`, `pyproject.toml`, `ruff.toml`, a licence file. `package.json` has no `engines`, `packageManager` or `browserslist` (its keys: `name version private type scripts dependencies devDependencies`). Workflows use Node 20 in three jobs (`site-validation.yml:21,52`, `runner-context.yml:42`) and Node 22 in seven (`grep -n "node-version" .github/workflows/*.yml`). The licence gap is already open with the owner (`docs/PROJECT_HANDOFF.md:29`, item 4).
- **Status.** Verified by me (file checks). Which Node version Vercel builds with is a project setting I could not read.
- **Why it matters.** The Node that builds production, the Node that runs the checks and the Node on an agent's machine are three unstated versions. The 37 advisories of P1-1 arrived with nothing to announce them. And rules 19, 23 and 24 ask every pull request for the same statements (documents updated, checks run, the owner's dated merge request), which a template would prompt for at no cost.
- **Proposed change.** (1) `.nvmrc` with the major version CI uses for the site build, and `"engines": { "node": ">=20" }` in `package.json`, after reading the Vercel project's setting so the three agree. (2) `.github/dependabot.yml` for `npm` and `github-actions`, weekly, grouped, security updates first; it opens pull requests and merges nothing, so rule 24 still governs. (3) `.github/pull_request_template.md` with four lines: the contract document updated (rule 19); the checks run with their dated result (rule 23); live state read from `/version.json` if the text says "live" (rule 20); the owner's merge request quoted and dated (rule 24). The autopilot writes its own pull request bodies, so check `scripts/autopilot-*.cjs` do not assume an empty template before adding it (out of my scope; not checked). (4) `.gitattributes` with `* text=auto eol=lf` and `*.gz binary`, so no machine rewrites line endings in files whose sha256 is pinned. (5) `.editorconfig` (UTF-8, LF, two spaces, final newline).
- **Fix type.** (3), (4) and (5) Mechanical (new files, no check added). (1) Mechanical after reading the Vercel setting. (2) Owner decision (it creates pull requests).
- **Effort and risk.** S each. Risk: low. For (4), run `git add --renormalize . && git status` first and confirm it reports no change: if it does, a tracked file has CRLF endings and its bytes are pinned somewhere, so leave that file out of the rule.

### P2-15. Browser data loading is careful but written out six times: seven copies of the digest check, two answers when Web Crypto is missing, no notice for a stalled download, one page-wide error boundary

- **What.** All nine runtime requests go through `dataFetch` (`lib/data-fetch.ts`, 19 lines), which reports a failure and does nothing else. What follows the response (read the bytes, compare the length, compare the sha256, parse, cache) is repeated in each loader module.
- **Evidence.**
  - The sha256-to-hex step is written seven times in six files: `lib/all-finisher-context.ts:109`, `lib/fast-start.ts:110`, `lib/half.ts:14-17`, `lib/insights.ts:74-77`, `lib/runner-context.ts:30`, `lib/runner-search.ts:92` and `:107` (`git grep -n "crypto.subtle.digest" -- lib`). `loadHalf` (`lib/half.ts:20-35`) and `loadInsight` (`lib/insights.ts:80-95`) differ in 4 of 24 lines (`diff <(sed -n '12,35p' lib/half.ts) <(sed -n '72,95p' lib/insights.ts)`).
  - Two policies: `lib/half.ts:28` and `lib/insights.ts:88` skip the comparison when `crypto.subtle` is missing and never compare the length; the other four compare the length and call `crypto.subtle` unguarded. Browsers expose `crypto.subtle` only on HTTPS and localhost, so production is unaffected; a phone opening a development server by its LAN address would get a raw `TypeError` message on four loaders and unverified data on two.
  - The pack tables are the one family checked for shape and city only, with no digest or length (`lib/analysis-aggregates.ts:13-17`); they are also the largest files (P0-2).
  - No request has a time limit or a slow-download notice: `git grep -n -E "AbortSignal\.timeout|setTimeout\([^)]*abort" -- app components lib` prints nothing. A connection that stalls during a 3 MB to 6 MB shard (P0-1) or a table (P0-2) leaves the loading line on screen until the visitor acts.
  - Failures, by contrast, are handled well: each loader throws a plain sentence, a failed request is evicted from its cache (`lib/half.ts:31`, `lib/insights.ts:91`), and five components offer "Try again" (`components/AllFinisherAnalysis.tsx:341`, `AnalysisExplorer.tsx:316`, `CheckpointExplorer.tsx:130`, `FastStartAnalysis.tsx:163`, `RunnerContext.tsx:310`).
  - Error boundaries: `app/error.tsx` (38 lines) and `app/global-error.tsx` (41 lines), both with a reload after a failed chunk; nothing below them (`git grep -n -E "componentDidCatch|getDerivedStateFromError|ErrorBoundary" -- app components lib` prints nothing). A render error inside one interactive figure replaces the page's whole content, server-rendered text included, with "This page didn't load properly".
- **Status.** Verified by me (files read; greps). Inferred: the behaviour without Web Crypto (platform rule, not run) and with a stalled connection (no timer exists; not simulated).
- **Why it matters.** Mostly maintenance: P0-1, P0-2 and P2-2 each change how a file is fetched or verified, and today that means the same edit in up to six modules whose policies have already drifted. For visitors, the stalled download is the one visible gap.
- **Proposed change.** (1) Add `fetchVerified(url, { sha256, bytes, signal, referrerPolicy })` to `lib/data-fetch.ts`, returning the verified `ArrayBuffer`; the six loaders keep their own sentences, parsing and caches and call it. Choose the missing-Web-Crypto policy once and record it in `docs/WEBSITE_ARCHITECTURE.md`. The strict form (refuse with a plain sentence) is the stronger check; the lenient form relaxes four loaders only where production never runs. Keep every visible sentence byte for byte: `scripts/verify-half.cjs` checks the half ones (`lib/half.ts:7-9`), and `scripts/verify-analytics.cjs` requires every request to go through `dataFetch`. (2) In the same helper, an optional callback after about ten seconds so a component can add "Still loading. This file is large." beside its status line; no automatic abort, because a slow phone may simply need longer. (3) One small class component around each interactive island, showing the line `components/RunnerContext.tsx:73` already uses for a report that did not load and calling `trackFailure('render')`, so the rest of the page stays.
- **Fix type.** Engineering (three small, separate changes).
- **Effort and risk.** S to M. Risk: low; (1) touches the two loaders that set `referrerPolicy: 'no-referrer'` for privacy (rule 18), so run `npm run verify:analytics` and the half and runner-search verifiers after it.

### P2-16. The largest files are verifiers and tool components; split the verifiers first

- **What.** The twenty largest source files outside the autopilot, by lines (`git ls-files app components lib scripts analysis | grep -E "\.(ts|tsx|cjs|mjs|js|py|css)$" | grep -v autopilot | xargs wc -l | sort -rn`):

  | Lines | File | Note |
  |---:|---|---|
  | 1,990 | `analysis/test_half.py` | 132 KB; 19 classes, 85 tests |
  | 1,735 | `scripts/verify-tools.cjs` | 199 KB; one linear script in 14 `// ----` sections; the terrain section is lines 444-1168 |
  | 1,472 | `scripts/verify-insights.cjs` | 109 KB |
  | 1,221 | `scripts/verify-analytics.cjs` | 135 KB |
  | 1,188 | `analysis/half_quality.py` | 80 KB |
  | 1,080 | `scripts/verify-half.cjs` | |
  | 949 | `scripts/e2e/scenarios/s6-visit-signals.cjs` | |
  | 949 | `components/tools/Predictor.tsx` | 57 KB; 13 `useState`, 7 `useEffect`, 8 components |
  | 946 | `scripts/verify-seo.cjs` | |
  | 922 | `components/tools/Projector.tsx` | 55 KB; 21 `useState`, 12 `useEffect` |
  | 913 | `components/tools/WeatherMatch.tsx` | 61 KB |
  | 900 | `analysis/adapt_master.py` | |
  | 893 | `components/tools/SplitCheck.tsx` | 15 `useState` |
  | 873 | `scripts/verify-courses.cjs` | |
  | 815 | `components/tools/QualifyingChecker.tsx` | 15 `useState` |
  | 807 | `lib/nuggets/stories.ts` | |
  | 777 | `analysis/half_policy_lists.py` | |
  | 659 | `analysis/build_extended.py` | |
  | 626 | `analysis/half_links_extract.py` | |
  | 622 | `components/tools/PaceBand.tsx` | 14 `useState`, 13 `useEffect` |

  Line counts understate the verifiers: `scripts/verify-tools.cjs` averages 114 characters a line, with lines of up to 1,221 (P2-11).
- **Status.** Verified by me (counts).
- **Why it matters.** `scripts/verify-tools.cjs` covers every tool in one process that stops at its first failed assertion (P1-7), so a change to one tool waits for, and can be hidden behind, the checks of all the others. The tool components are large but each ships only to its own page: the pages of the seven largest tools load 21 KB to 26 KB gzip above the 145,100 B that a stub page with no content of its own loads (`scripts/e2e/budget.json`: `/tools/projector` 165,847 B to `/tools/pace-band` 171,551 B), so their size is a reading cost, not a visitor cost.
- **Proposed change.** (1) Split `scripts/verify-tools.cjs` along its own section comments into one file per topic (time parsing, pace charts, planner, terrain, predictor, qualifying, half) under `scripts/verify-tools/`, run by the same `package.json` entry, on top of the shared loader (P2-3) and the collecting runner (P1-7). The script prints its number of checks on its last line (`scripts/verify-tools.cjs:1735`): the split is right when the parts sum to the number printed today, which shows no assertion was dropped (rule 23). (2) Leave the tool components until one is changed for a feature; then move its sub-components and its input state into files beside it. Do the verifier first: 84 of its assertions read these components' source text (P2-11), and each names the file it reads. (3) Leave `analysis/test_half.py` and the Python builders: they are long but each is one subject.
- **Fix type.** Engineering.
- **Effort and risk.** M for (1). Risk: low with the check count compared before and after.

### P2-17. Ninety-one stub pages are built for a GitHub Pages site that no workflow builds; production can never serve 90 of them

- **What.** `movedPages()` (`lib/seo-routes.ts:84-86`) lists 91 moved addresses that each keep a stub page in the export: `/htw`, `/packs`, `/packs/smyth_htw`, `/research/personalized`, `/your-race`, 84 `/packs/<id>` pages and two former weather analyses. `vercel.json:11-20` answers 90 of them with a 308 before any file is looked up. The code says why the stubs exist: "The noindex stub kept at each (components/MovedPage.tsx) is for the GitHub Pages build, which cannot redirect" (`lib/seo-routes.ts:44-45`).
- **Evidence.** `node moved-count.cjs /home/user/pace-notes-review` (scratch folder; it loads `lib/seo-routes.ts` read-only) prints `movedPages 91 movedPackIds 84`. Read on November 9, 2026: `/htw`, `/packs`, `/packs/r10_unravel_typology`, `/research/personalized` and `/analyses/wind-and-pacing` answer 308 with the expected targets; `/your-race` answers 200. Supporting code: `lib/packs.ts` (64 lines, 46 ids; imported only by `lib/seo-routes.ts:19` and `scripts/verify-research.cjs:24`), `components/MovedPage.tsx` (23 lines), `components/LegacyAnalysisLink.tsx` (20 lines), six page files of 10 to 18 lines, the `stubs` family in `scripts/verify-seo.cjs` (lines 60, 732-779) and six stub entries in `scripts/e2e/budget.json` (five at 145,100 B, `/research/personalized` at 145,823 B). No workflow builds a Pages site (P2-13).
- **The three routes the brief asked about.** None is dead. `/request-analysis` is linked from the navigation, the footer, `/about` and runner search (`components/SiteNav.tsx:34`, `components/SiteFooter.tsx:19`, `app/about/page.tsx:74`, `components/RunnerSearch.tsx:121`). `/report` is a working page (`lib/chapters.ts:168`, `lib/tools/links.ts:49`). `/your-race` has no 308 on purpose: it forwards old `#guide-<question>` links in the browser, and a redirect would drop the fragment before the page could read it (`lib/seo-routes.ts:59-63`).
- **Status.** Verified by me (the count, by running the route module; live status codes; greps). Not verified: whether a Pages site exists.
- **Why it matters.** Not for visitors: production serves none of the 90. For maintainers: 91 pages are built and held to SEO and budget expectations on every build for a second host that, as far as the repository shows, is not deployed, and answering "is this page dead?" takes three files.
- **Proposed change.** Nothing until the owner answers the question in P2-13. If the Pages build is retired: delete the 90 stubs a 308 covers (keep `/your-race`), `lib/packs.ts` and the stub half of `movedPages()`; keep `vercel.json`'s redirects as the one record of moved addresses; change the `stubs` expectations in `scripts/verify-seo.cjs` and the import at `scripts/verify-research.cjs:24` with a dated comment, keeping the checks that moved addresses stay out of the sitemap and out of the site's own links (rule 23: a changed expectation, not a removed check); remove the stub entries from the budget file with a dated entry. If it stays: add the workflow that builds it, so the stubs and the base path are exercised.
- **Fix type.** Owner decision.
- **Effort and risk.** M after the decision. Risk: none for old links as long as the redirects stay.

### P2-18. Legacy names: 97 files say HTW and 104 say `private-export`; one rename is safe and the others are compatibility identifiers

- **What and evidence.** Outside `public/data` and the lockfile (`git grep -l -E 'HTW|htw' -- . ':!public/data' ':!package-lock.json' | wc -l`, and the same with `-F` for the other names): `HTW` or `htw` in 97 files and 383 lines (42 documents, 18 scripts, 14 analysis files, 7 in `lib`, 4 in `app`, 2 in `components`); `htw-live-study` in 32 files and 95 lines; `private-export` in 104 files and 272 lines; `smyth_htw` in 22 files; `marathon-study` in 4 files.
  - `htw-live-study` is the GitHub repository's name, the old Vercel host that `vercel.json:5-10` redirects, and the npm package name. Only the package name can change (P2-9).
  - `smyth_htw` and `pct_htw` are a pack id and a column in published data files (`lib/packs.ts:16`, `lib/research-data.ts:79,119`); rule 14 keeps historical field names.
  - `private-export-…` and `htw-db-…` are release tags (rules 9 and 22).
  - `marathon-study-units` is the localStorage key of a visitor's unit choice (`components/UnitsProvider.tsx:9`, `docs/ANALYTICS.md:102`, `scripts/e2e/inspect.cjs:355`); renaming it would reset every returning visitor's choice.
- **Status.** Verified by me (greps).
- **Why it matters.** A new reader meets three names for one project and a tag that says "private" on public data. The rules explain each one, but only to someone who has read rules 9, 14 and 22; a search for "Pace Notes" finds none of them.
- **Proposed change.** Rename nothing except the package. Add a five-row table "Names that stay" (name, what it is, why it stays, the rule) to `docs/WEBSITE_ARCHITECTURE.md` and link it from the handoff's Subsystem index, so the explanation is in one findable place.
- **Fix type.** Mechanical (one table in one document).
- **Effort and risk.** S. Risk: none.

---

## 5. What is good: keep

Each item names where to see it. No proposal in this report should cost any of them; where a proposal touches one, the finding says how it is kept.

**Data integrity**

- **Every input is pinned by sha256 and a difference fails loudly.** Three pin files (`analysis/release.json`, `analysis/half-release.json`, `analysis/weather-release.json`), and a downloader that needs no token (`analysis/download_release.py:1-8`). See P1-9.
- **Independent recounts.** Node verifiers recount the numbers the Python builders publish, and parity fixtures hold the two languages together (`scripts/half/fixtures/parity.json`). The duplicated logic between Python and Node is the design, not a defect (P1-9).
- **Rebuild and compare.** Data workflows rebuild from the pinned assets and compare the result with the committed files byte for byte (`cmp` at `.github/workflows/charts.yml:63`, `insights.yml:71` and `half.yml:196`).
- **Deterministic output.** The lookup builder writes gzip with a fixed level and no timestamp (`analysis/build_runner_lookup.py:13`: `compresslevel=6, mtime=0`), so equal records give equal bytes. P1-4 only asks that the embedded tag stop defeating this.
- **Numbers on pages are recounted from data files.** For example the home figure (`scripts/verify-nuggets.cjs:253-268`).
- **Rules with a verifier were found intact.** Every stale or contradictory statement in P0-3 and P1-8 concerns a rule that no check enforces; I found no drift in a rule that names a verifier.

**Loading data in the browser**

- **One fetch wrapper with failure telemetry.** `lib/data-fetch.ts` (19 lines) is the only place that calls `fetch`; `scripts/verify-analytics.cjs:677-680` fails any other file under `app`, `components` or `lib` that does. No component fetches on its own (ten `dataFetch(` lines: the definition and nine call sites in seven modules).
- **Bytes are verified before they are parsed.** Digest and byte length are checked on the runtime data (`lib/half.ts`, `lib/insights.ts:72-95`, `lib/runner-search.ts:92-107`, `lib/runner-context.ts:102`). P2-15 proposes one helper, not a weaker test.
- **A failed request leaves its cache,** so "Try again" refetches (`lib/half.ts:31`, `lib/insights.ts:91`), and five components offer "Try again" (list in P2-15).
- **Six of nine data requests are versioned by content digest;** the three versioned by tag are revalidated on every visit, so no visitor is served stale data (P2-2).
- **Typed values stay out of the Referer header.** `referrerPolicy: 'no-referrer'` on the two loaders whose page URL can hold typed values (`lib/half.ts:25`, `lib/insights.ts:85`).
- **Requests are cancelled when the question changes** (eight `AbortController`s in six files) and errors are typed states, not exceptions on screen.
- **Initial answers are server-rendered,** so the heavy tables of P0-2 load only when a visitor changes a control.
- **The runner search runs on submit,** not per keystroke (`components/RunnerSearch.tsx:307`), which caps the number of shard downloads.
- **A browser without `DecompressionStream` gets a plain sentence,** not an exception (`lib/runner-search.ts:109`); P2-1 extends it to the one loader that lacks it.
- **Root error boundaries recover from a stale chunk** by reloading once (`app/error.tsx`, `app/global-error.tsx`) and report the failure kind without the error's message.

**Front end**

- **Static export.** No server, middleware, route handler or server action runs in production, so the server-side advisories of P1-1 do not reach visitors.
- **Strict TypeScript, clean.** `tsconfig.json:7` (`"strict": true`); one `any` (`lib/research-data.ts:44`), one `as unknown as` (`lib/split-check-server.ts:22`) and no `@ts-ignore`, `@ts-expect-error` or `@ts-nocheck` in 409 files; nine `eslint-disable` comments in six files under `components/tools` and `components/report`, every one for `react-hooks/exhaustive-deps` (inert today, since ESLint never runs); `npx tsc --noEmit -p .` exits 0; ESLint with the Next rule set reports 0 errors and 5 warnings (P1-3, P2-7).
- **A first-load budget with a tolerance and a self-test** (`scripts/e2e/scenarios/s8-budget.cjs:16,23,153`; 40 page figures), and the documented habit of looking for an accidental import first.
- **PostHog and its recorder load lazily** (`lib/analytics.ts:139-162`); the recorder is bundled, not fetched from a third-party host.
- **Fonts are self-hosted subsets:** 13 `woff2` files, 558,196 B in all, every web face with `font-display: swap`, seven local fallback faces matched with `size-adjust` (`app/styles/fonts.css`, 20 `@font-face` rules), and only the two faces every page sets first are preloaded (`app/layout.tsx:57`).
- **Client components are marked consistently:** 81 files start with `'use client'`, 24 of them also say so in their name (`.client.tsx`).
- **Moved addresses are checked.** `scripts/verify-seo.cjs` compares `vercel.json`'s redirects with `movedTo()`, and the forward-only `/your-race` stub keeps old fragment links working (P2-17).

**Checks and workflows**

- **Verifiers render real components** (`renderToStaticMarkup`, for example `scripts/verify-tools.cjs:412`) and recount what they show.
- **Six verifiers already collect every problem and print a message for each** (`scripts/verify-half.cjs:55-57,1074-1078`, `verify-seo.cjs:88-91`, `verify-css.cjs:82-84`, `verify-half-source.cjs:127-133`, `verify-replay-e2e.cjs:102`, `verify-seo-live.cjs:49-51`). P1-7 proposes this form for the rest.
- **The privacy scenario types two value sets** and fails if a run's own values reach analytics (`scripts/e2e/scenarios/s2-differential.cjs`); the old-Safari scenario walks every sitemap page (`s5-old-safari.cjs`).
- **Workflow hygiene.** All eleven non-autopilot workflows declare `permissions: contents: read`; every checkout sets `persist-credentials: false` (13 checkouts); every job has a timeout (13 `timeout-minutes`); no repository secret is used (`GH_TOKEN: ${{ github.token }}` only, in six workflows: `insights.yml:52`, `inspect-full-export.yml:43`, `pacing-analysis.yml:45`, `public-explorer.yml:47`, `runner-context.yml:50`, `weather-analysis.yml:55`); only GitHub's own actions are used.
- **The half `source` job proves anonymous access** by refusing to run with a token in its environment (`.github/workflows/half.yml:152-158`).
- **The Python suite needs no data and no network,** so it can run anywhere (P1-8 step 4 uses that).

**Documents**

- **The owner-decision register** (`docs/OWNER_DECISIONS.md`): each decision quoted and dated.
- **The handoff's Subsystem index** (`docs/PROJECT_HANDOFF.md:42-63`): contract, builder, verifier and workflow for each subsystem in one table. It is the best single aid for a new agent in the repository.
- **The history index** (`docs/history/README.md`) and the rule that superseded text moves verbatim (rule 19).

---

## 6. Quick wins (each under an hour)

Each item is effort S, changes no number on any page, lowers no floor and removes no check. Each names its finding, where the evidence and the reasoning are. Line numbers are those of commit `068b6c37`. After any of them, run the checks for the change type (rule 23); the item names the one check that matters most. Where an item changes workflow behaviour or a contract, the document line in the same item is what rule 19 asks for.

**A. Workflows and package (nothing a visitor receives changes)**

1. **Blobless history for the half scope test.** `.github/workflows/half.yml`: under `with:` after line 125 add `filter: blob:none`; at line 135 make the command `git diff --no-renames --name-only "$BASE" "$HEAD"`. Add the line `git clone --filter=blob:none` to the cloning advice in `docs/OPERATIONS.md`. (P1-4 step 1, P1-5 step 1.) Check: the scope step prints the same decision as before on a pull request that touches a half builder and on one that does not.
2. **Cancel superseded pull-request runs.** In the ten workflows without a group (`all-finisher-context.yml`, `charts.yml`, `fast-start.yml`, `insights.yml`, `inspect-full-export.yml`, `pacing-analysis.yml`, `public-explorer.yml`, `runner-context.yml`, `site-validation.yml`, `weather-analysis.yml`) add
   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
     cancel-in-progress: ${{ github.event_name == 'pull_request' }}
   ```
   and one sentence in `docs/OPERATIONS.md`. Pushes to `main`, releases and manual runs are never cancelled. (P1-5 step 2.)
3. **A Markdown edit no longer starts the longest calculation.** `.github/workflows/pacing-analysis.yml`: after line 6 add `- '!analysis/**/*.md'`; replace the sentence at `docs/OPERATIONS.md:24` (the old one moves verbatim to that file's History section). (P1-5 step 3.)
4. **The Python pin says why it is there.** Rewrite the comment at `.github/workflows/pacing-analysis.yml:34-36` (the interpreter of the recorded local run; `docs/REFRESH_20261103b.md:152` says the pin is now optional) and correct the Python sentences at `README.md:45`, `analysis/README.md:35` and `docs/OPERATIONS.md:24,254` ("Python 3.12 (as in CI)") and at `docs/OPERATIONS.md:211` ("The data workflows use Python 3.12") to name both versions CI uses (3.12 in four workflows, 3.13.16 in six). (P1-5 step 5.)
5. **Cache pip.** Under `with:` of the eleven `actions/setup-python@v5` steps (`all-finisher-context.yml:28`, `charts.yml:40`, `fast-start.yml:29`, `half.yml:102,141`, `insights.yml:36`, `inspect-full-export.yml:31`, `pacing-analysis.yml:32`, `public-explorer.yml:31`, `runner-context.yml:34`, `weather-analysis.yml:32`) add `cache: pip` and `cache-dependency-path: analysis/requirements.txt`. (P1-5 step 4.)
6. **Drop the unused font package.** Remove `package.json:36` (`@fontsource-variable/jetbrains-mono`) and run `npm install --package-lock-only`; the lockfile diff should touch that one package. Check: `node scripts/fonts/copy-fonts.cjs --check`. (P2-9.)
7. **Name the package after the site.** `pace-notes` at `package.json:2` and `package-lock.json:2,8`. Change no host, repository or release name (rule 22). (P2-9, P2-18.)
8. **Convention files.** `.github/pull_request_template.md` (four prompts: contract document updated, rule 19; checks run with their dated result, rule 23; live state read from `/version.json` if the text says "live", rule 20; the owner's merge request quoted and dated, rule 24); `.editorconfig` (UTF-8, LF, two spaces, final newline); `.gitattributes` (`* text=auto eol=lf`, `*.gz binary`) only after `git add --renormalize . && git status` reports no change; `.nvmrc` and `"engines"` only after reading the Vercel project's Node setting. Before adding the template, confirm that the autopilot's scripts do not assume an empty one (not checked; out of my scope). (P2-14, P1-8 step 5.)

**B. `vercel.json` (read the headers on a preview deployment before merging)**

9. **Three security headers.** Replace the header list at `vercel.json:25` with the four-entry list printed in P1-2 step 1: `Referrer-Policy: strict-origin` (as today), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), browsing-topics=()`. Do not list `clipboard-write` or `web-share`: the site uses both. Check on the preview: `/`, `/data/live.json`, one `.gz` shard and one font still answer 200 with the content type they have today, and `/runners` still searches. (P1-2 step 1.)
10. **Cache the fonts for a week.** Add the rule `{ "source": "/fonts/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=604800, stale-while-revalidate=2592000" }] }`. Not `immutable`: the font file names carry no content hash. Record both rules in `docs/WEBSITE_ARCHITECTURE.md`. (P2-2 step 1.)

**C. Site code (run `npm run verify:data` and `npm run build`; for 11 to 13 also `npm run autopilot:privacy`)**

11. **Load the smallest index shard that can answer the search.** `lib/runner-search.ts:122-124`: of the typed tokens of three or more characters, take those whose shard is listed in `manifest.shards` and load the one with the fewest `bytes`; if none is listed, keep the present rule. Add one assertion to `scripts/verify-runner-search.cjs` that a two-token query requests the smaller of two listed shards (the existing case at line 242 keeps passing). "martin smith" goes from 3.28 MiB to 0.15 MiB of transfer with the same results. (P0-1 tier 1.)
12. **Point the old-browser message at something the page has.** Either change the sentence at `lib/runner-search.ts:109` to end "…or use Open data in the menu", or render a link to `/methodology#downloads` beside the alert at `components/RunnerSearch.tsx:321`. (P2-1 step 1.)
13. **Guard the second decompression call.** Before `lib/runner-context.ts:103` add the `typeof DecompressionStream === 'undefined'` test with a plain sentence; in `scripts/verify-browser-compat.cjs` add the rule that a file containing `new DecompressionStream` must also contain `typeof DecompressionStream`; add one sentence on the limit to `docs/WEBSITE_ARCHITECTURE.md` and `docs/KNOWN_ISSUES.md`. (P2-1 steps 2 and 3.)
14. **Memoize the two race-plan values.** `components/tools/RacePlan.tsx:279-281`: wrap `published` in `useMemo` with `[goalData.data, goal, exampleOn, example]` and `result` with `[goalData.data, goal, course]`, keeping both names (a source-text assertion at `scripts/verify-tools.cjs:1024` reads one of them). Check: `node scripts/verify-tools.cjs`. (P2-7.)
15. **Remove the only `any` and fail on a missing table.** `lib/research-data.ts:44-57`: `readJson` returns `unknown`, narrowed at its two call sites; `table()` throws `Missing table ${name} in ready pack ${pack}` when a ready pack's CSV cannot be read and keeps `[]` for the two real states. (P2-6.)
16. **Delete the 23 unused exports** listed in P2-4, after repeating the grep for each name. Check: `npx tsc --noEmit -p .` (about 13 seconds). (P2-4.)
17. **Delete three stale files.** `git rm public/data/packs/INDEX.json public/data/packs/PACK_IDS.json public/data/packs/PACK_IDS.analyst.json`; record it in the handoff. Git history keeps them (rule 5). (P2-5.)
18. **Correct the comment at `lib/packs.ts:12`** (none of its 46 ids has a folder under `public/data/packs`). (P2-13.)

**D. Documents (check links before and after with the script in the appendix; superseded text moves verbatim, rule 19)**

19. **Re-point 26 links** in `docs/history/handoff-2026-11-05-current-state-before-89.md` (16) and `docs/history/handoff-2026-11-05-current-state-before-person-id.md` (10): prefix `../` for targets in `docs/`, `../../` for targets at the repository root, drop the `history/` prefix for siblings. Add the second file's row to the table in `docs/history/README.md`. (P0-3 step 1.)
20. **`analysis/README.md:21`**: say that the pinned `master-*` tag with `layout: master` goes to `adapt_master.py` and that other tags must start `private-export-` or `htw-db-`; add the "Two stages" paragraph. (P1-9 steps 1 and 2.)
21. **`docs/OPERATIONS.md:40`**: the type check is not a gap, `next build` runs it; say so, and give `npx tsc --noEmit -p .` as the quick form. (P1-3 step 1.)
22. **`docs/TOOLS.md:341-372`**: move the superseded section verbatim to below `## History` in the same file; its anchor and the five links to it are unchanged. (P1-10 step 1.)
23. **The budget's two sentences.** In the `note` of `scripts/e2e/budget.json` and under "First-load budgets (S8)" at `docs/OPERATIONS.md:46`: each figure includes the 31,084 B `nomodule` polyfill chunk that current browsers skip. No figure and no tolerance changes. (P2-8.)
24. **The budget's history as a list.** `scripts/e2e/budget.json`: make `measured` an array of its eleven dated entries, newest first, without changing a word; change the sentence at `docs/OPERATIONS.md:49` to match. Check: `node scripts/e2e/scenarios/s8-budget.cjs --self-test`. (P2-12.)
25. **`docs/WEBSITE_ARCHITECTURE.md:164,202`**: the two sentences that name `hooks/` and `context/` folders the repository does not have. (P2-13.)
26. **A "Names that stay" table** in `docs/WEBSITE_ARCHITECTURE.md` (`htw-live-study`, `smyth_htw` and `pct_htw`, `private-export-…`, `htw-db-…`, `marathon-study-units`: what each is, why it stays, the rule), linked from the handoff's Subsystem index, which is the owner's file. (P2-18.)
27. **Two conventions, one paragraph** in `docs/OPERATIONS.md`: one sentence per source line for new or edited prose in documents and JSX, and no bulk reformatting. (P1-10 step 4, P2-11.)

**E. Ready to apply, waiting for the owner (each adds or changes a check: handoff item 12, `docs/PROJECT_HANDOFF.md:37`)**

- `.eslintrc.json` with `{ "extends": "next/core-web-vitals" }`. `next build` then lints `app`, `components` and `lib` in CI and on Vercel; my one run found 0 errors, so nothing should fail (inferred: no build was run); fix or annotate the 5 warnings first. (P1-3.)
- `node scripts/verify-css.cjs --self-test` and `node scripts/fonts/copy-fonts.cjs --check` in the `verify` job; `node scripts/verify-chapters.cjs --html`, `node scripts/verify-half.cjs --html` and `npm run og:check` in `privacy-e2e`. (P1-3.)
- A job on pushes to `main` that runs the full Python suite. (P1-8 step 4.)
- A token-shape `git grep` step in the `verify` job (the pattern is in the appendix and prints nothing today). (P1-8 step 3.)
- The link and stale-state check for documents in the `verify` job, after item 19. (P0-3 step 2, P1-8 step 1.)
- A `typecheck` script, and removing the two scripts at `package.json:9-10` that cannot work with `output: 'export'`. (P1-3, P2-9.)
- `.github/workflows/public-explorer.yml:12`: the path filter names `analysis/test_runner_lookup.py`, which does not exist. (P2-13.)
- `.github/dependabot.yml` for `npm` and `github-actions`. (P2-14.)

**Not quick, though some look it**

- `next` and `eslint-config-next` to 14.2.35: one line each, but it needs a build, the budget scenario and the full checks, because the `shell` cache group and the `RootLayoutReferencesLast` plugin in `next.config.mjs:8-47` depend on Next's chunk order (P1-1).
- Deleting the six unreachable files and `recharts`: the files are trivial, the three verifiers that still assert on them are not (P1-6).
- The thirty-one stale state lines: M, because each needs its superseded sentence archived verbatim and two are headings with linked anchors (P0-3 step 1).
- `scripts/verify-all.cjs` and `scripts/lib/check.cjs` (P1-7); `scripts/lib/ts-require.cjs`, and only then `import 'server-only'` (P2-3, P2-10); `fetchVerified` and the island boundary (P2-15); splitting `scripts/verify-tools.cjs` (P2-16).
- Anything that needs a rebuild of committed data: the table encoding (P0-2), sub-sharding the index (P0-1 tier 3), taking `release_tag` out of shard bodies and moving generated shards out of Git (P1-4).
- A generated facts file, one ordered pipeline entry point, and counts in one place (P1-8 step 2, P1-9 step 3, P1-10 step 2).
- The GitHub Pages question and the 90 stubs behind it (P2-13, P2-17).

---

## 7. What I did not check

The brief allowed reading, light commands, and one run each of `tsc`, `eslint`, `npm audit` and `npm outdated`. Nothing was built, no verifier, browser scenario or pipeline step was run, and the GitHub API was not called. Each item names the finding it limits.

**Not run (builds, verifiers, browser scenarios and the pipeline were out of bounds)**

- How long `npm run verify:data`, `npm run build` and the Python suite take today. The one figure this report uses, about 18 minutes for `verify:data`, is the repository's own dated note (`docs/REFRESH_20261103b.md:102`, November 5, 2026). (P1-7, P1-8.)
- Whether `next` 14.2.35 builds with the `shell` cache group and the `RootLayoutReferencesLast` plugin (`next.config.mjs:8-47`), and how the first-load figures move. (P1-1.)
- That `next build` stays green once an ESLint configuration exists. It is inferred from my one ESLint run (0 errors, 5 warnings). (P1-3.)
- That recharts is in no shipped chunk. It rests on the import graph and on the repository's own statement. (P1-6.)
- That `import 'server-only'` type-checks and builds here. It is reasoned from Next's alias file. (P2-10.)
- The S8 budget scenario and the verifiers named as the check for a proposed change (`verify-tools`, `verify-research`, `verify-runner-search`). I read them; I did not run them. (P2-6, P2-7, P2-8.)
- The size of one exported stub page. No build was run, and production answers those paths with a 308. (P2-17.)
- Whether `og:check` renders the same on a CI runner as on the machine that made the cards. (P1-3.)
- What a Python linter would report. ruff is not installed here and I did not install it. (P1-9.)
- Whether the chart modules that no test names are exercised through `test_charts.py`. (P1-9.)
- The two `package.json` scripts that cannot work with `output: 'export'` were read, not run. (P2-9.)

**Not read (the GitHub API was out of bounds)**

- Workflow run history: which jobs really ran, for how long, and how often a run was superseded. Every statement about CI comes from the workflow files and `git log`. (P1-5, P1-8.)
- Whether branch protection requires a review or a check by name, and whether secret scanning with push protection is enabled. (P1-8.)
- Whether the lookup shards also exist as release assets (P1-4), and the size of the `master-20261103b` bundle (P1-5 quotes the size recorded for 1050).
- Whether a GitHub Pages site exists for this repository. (P2-13, P2-17.)
- Whether pull request #49 is still a draft and the branch `codex/berlin-2026-intake` still exists (`docs/OPERATIONS.md:215`). (P0-3 step 2.)

**Outside the repository**

- The Vercel project's settings: build command, Node version, whether any check gates a deployment, and the limits that would apply to fetching data during the build. (P1-4, P2-6, P2-14.)
- The response headers of a preview deployment. I read production only. (P1-2, P2-2.)
- What the PostHog recorder needs under a Content-Security-Policy, and whether `dompurify` sits in the lazily loaded PostHog chunk. (P1-1, P1-2.)
- The share of visits from browsers without `DecompressionStream`, the engine's exact error text, and the rendered `/runners` page. Analytics were not read. (P2-1.)
- Time and memory on a phone for the large files. The sizes are measured; the cost on a device is inferred from them. (P0-1, P0-2.)
- Whether anything outside the repository still fetches the three stale pack index files. (P2-5.)

**Estimated, sampled or reasoned instead of measured**

- The size of a clone made with `--filter=blob:none` and the time `half.yml` would save. Both come from object sizes, not from a timed run. (P1-4, P1-5.)
- How many shards would have kept their bytes across an adoption without the embedded release tag. I sampled four shards at four adoptions. (P1-4.)
- The 34 exports that only verifiers name, and the 23 that nothing names, come from a script that matches names, not bindings. (P2-4.)
- The shard rule for tokens of one or two characters. I measured the three-character rule the page uses. (P0-1.)
- The loaders' behaviour without Web Crypto and on a stalled connection. Reasoned from the code and the platform rule, not simulated. (P2-15.)
- The assertion census (1,790 of 3,518 without a message) is a heuristic and can be off by a few per file. (P1-7.)
- The token estimate for the documents (four bytes a token). (P1-10.)
- Whether the autopilot's scripts assume an empty pull request template. (P2-14.)
- **The list of stale state lines is a floor.** Three rounds of wider searching each added lines, so I do not claim the 31 are all of them. I did not recount the six cell counts in `docs/TOP_TEN_ANALYSES.md:13`, nor the other counts that live sections label with 1050. (P0-3.)

**Out of scope by the brief**

- The autopilot, SEO and AEO, and visual design. Two things I tripped over there, both of the P0-3 kind: `docs/SEO.md:121` and `:126` state the merged branch state as pending, and `autopilot/backlog.md:53` carries an update dated 2026-10-30 that names 1050 as the adopted release (dated, so not false, but it is one of the 83 lines the release-intake sweep prints).

---

## 8. Appendix: commands to re-run

Every command here is read-only. Run them from the reviewed copy; `S` is the scratch folder. Outputs are quoted as they printed on 2026-11-09 with Node 22.23.4. Short commands that a finding already quotes beside their output are mostly not repeated here.

```
cd /home/user/pace-notes-review      # commit 068b6c3700f7201b78d13698c1838c515b21a32c
S=/tmp/scratchpad/review/arch
```

**A. The four medium-weight commands (each was run once; their outputs are saved, so read those)**

```
npx tsc --noEmit -p . --incremental false      # exit 0, no output, 12.9 s
npx eslint . --ext .ts,.tsx --no-eslintrc -c "$S/eslintrc.review.json" -f json -o "$S/eslint.review.json" 2> "$S/eslint.review.stderr"   # 8.1 s
npm audit --omit=dev --json > "$S/npm-audit-prod.json" 2> "$S/npm-audit-prod.stderr"
npm outdated --json > "$S/npm-outdated.json" 2> "$S/npm-outdated.stderr"
```

`eslintrc.review.json` holds `{"root": true, "extends": ["/home/user/pace-notes-review/node_modules/eslint-config-next/core-web-vitals.js"]}`; the repository has no configuration of its own (P1-3). The three `.stderr` files are empty.

ESLint result from the saved file (P1-3, P2-7):

```
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); let e=0,w=0; const rows=[]; for(const f of r){ e+=f.errorCount; w+=f.warningCount; for(const m of f.messages) rows.push(f.filePath.replace("/home/user/pace-notes-review/","")+":"+m.line+" "+m.ruleId); } console.log("files",r.length,"errors",e,"warnings",w); console.log(rows.join("\n"));' "$S/eslint.review.json"

files 410 errors 0 warnings 5
components/QuestionViz.tsx:62 react-hooks/exhaustive-deps
components/report/ReportActions.tsx:143 @next/next/no-img-element
components/story/ArchetypeStory.tsx:37 react-hooks/exhaustive-deps
components/tools/RacePlan.tsx:280 react-hooks/exhaustive-deps
components/tools/RacePlan.tsx:280 react-hooks/exhaustive-deps
```

The 410 files are the 409 under `app/`, `components/` and `lib/` (`git ls-files app components lib | grep -c -E '\.(ts|tsx)$'`) plus `next-env.d.ts`.

Audit summary from the saved file (P1-1):

```
node -e 'const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); console.log(JSON.stringify(a.metadata.vulnerabilities)); for(const [n,v] of Object.entries(a.vulnerabilities)) console.log(n, v.severity, v.range, "fix:", JSON.stringify(v.fixAvailable), "via:", v.via.length);' "$S/npm-audit-prod.json"

{"info":0,"low":0,"moderate":0,"high":2,"critical":2,"total":4}
dompurify critical <=3.4.16 fix: true via: 5
next critical 0.9.9 - 16.3.0-preview.10 fix: {"name":"next","version":"14.2.35","isSemVerMajor":false} via: 38
postcss high <=8.5.22 fix: {"name":"next","version":"14.2.35","isSemVerMajor":false} via: 4
source-map-js high 1.0.0 - 1.2.1 fix: true via: 1
```

Which Next advisories 14.2.35 closes (P1-1; `semver` is the copy in `node_modules`):

```
node -e '
const semver=require("/home/user/pace-notes-review/node_modules/semver");
const a=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));
const adv=a.vulnerabilities.next.via.filter(x=>typeof x==="object");
const open=[],closed=[]; for(const x of adv) (semver.satisfies("14.2.35",x.range)?open:closed).push(x);
const sev=l=>{const c={};for(const x of l)c[x.severity]=(c[x.severity]||0)+1;return JSON.stringify(c)};
console.log("next advisories",adv.length,"closed by 14.2.35:",closed.length,sev(closed),"still open:",open.length,sev(open));' "$S/npm-audit-prod.json"

next advisories 37 closed by 14.2.35: 12 {"high":4,"moderate":5,"low":2,"critical":1} still open: 25 {"moderate":11,"high":9,"low":2,"critical":3}
```

`npm-outdated.json` lists 13 packages (current, then latest): `@types/node` 20.14.10, 26.6.6; `@types/react` 18.3.3, 19.3.0; `@types/react-dom` 18.3.0, 19.3.0; `eslint` 8.57.0, 10.14.0; `eslint-config-next` 14.2.5, 16.4.5; `next` 14.2.5, 16.4.5; `playwright` 1.56.1, 1.65.0; `posthog-js` 1.433.10, 1.447.5; `react` and `react-dom` 18.3.1, 19.3.1; `recharts` 2.12.7, 3.10.1; `typescript` 5.5.4, 7.0.2; `web-vitals` 6.2.2, 6.2.3. The peer and engine ranges of the patch release came from `timeout 60 npm view next@14.2.35 dependencies peerDependencies engines --json` (network: `registry.npmjs.org`).

**B. P0-1, runner search**

Shard sizes from the committed manifest (quantiles by lower rank):

```
node -e '
const m=require("./public/data/runners/manifest.json");
const b=Object.entries(m.shards).filter(([p])=>p.startsWith("index/")).map(([p,v])=>v.bytes).sort((x,y)=>x-y);
const q=f=>b[Math.floor((b.length-1)*f)];
console.log("index shards",b.length,"min",b[0],"median",q(0.5),"p90",q(0.9),"p99",q(0.99),"max",b[b.length-1],"over 1,000,000 B",b.filter(x=>x>1e6).length,"over 1,048,576 B",b.filter(x=>x>1048576).length);'

index shards 3790 min 102 median 4615 p90 88871 p99 526299 max 6591800 over 1,000,000 B 10 over 1,048,576 B 8
```

Tier 1, what the smallest candidate shard would cost for the same query (bytes, then MiB, now and after):

```
node -e '
const c=require("crypto"), m=require("./public/data/runners/manifest.json");
const key=t=>"index/"+c.createHash("sha256").update(Array.from(t).slice(0,3).join("")).digest("hex").slice(0,3)+".json.gz";
const mib=b=>(b/1048576).toFixed(2);
for(const q of ["martin smith","mark lee","anna maria rossi","david martin","stephen king","christian mueller","michael johnson","maria","usa"]){
  const tok=q.split(" ");
  const longest=tok.reduce((b,t)=>t.length>b.length?t:b);
  const now=m.shards[key(longest)].bytes;
  const cand=tok.filter(t=>t.length>=3).map(key).filter(p=>m.shards[p]).map(p=>m.shards[p].bytes);
  console.log(q.padEnd(18), key(longest), now, mib(now), "->", Math.min(...cand), mib(Math.min(...cand)));
}'

martin smith       index/516.json.gz 3438714 3.28 -> 159171 0.15
mark lee           index/516.json.gz 3438714 3.28 -> 175863 0.17
anna maria rossi   index/516.json.gz 3438714 3.28 -> 402247 0.38
david martin       index/516.json.gz 3438714 3.28 -> 754109 0.72
stephen king       index/41c.json.gz 1072251 1.02 -> 89876 0.09
christian mueller  index/943.json.gz 1041847 0.99 -> 106791 0.10
michael johnson    index/224.json.gz 1001340 0.95 -> 629132 0.60
maria              index/516.json.gz 3438714 3.28 -> 3438714 3.28
usa                index/5fc.json.gz 6591800 6.29 -> 6591800 6.29
```

Rows that sit in a shard only because of a trailing country code (reads and re-compresses all 3,790 index shards, so it is the slowest command here; output as it printed earlier today, not run again for this appendix):

```
node "$S/index-codes.cjs" /home/user/pace-notes-review

index gz bytes 147017212 raw bytes 592445549 | gz bytes the code-only rows account for (re-gzipped estimate) 18385784 (12.5%)
after: max 3342007 p99 487204 over 1 MB 6 over 250 KB 103
index/5fc.json.gz 6591800 -> 3140 rows 524342 code-only 524161
```

Parse cost in Node (three child runs per file; decimal MB; "with text" is the heap while the source text is still held, "value only" what the parsed value keeps). Run the script as a file: under `node -e` the text was not released after the parse and the two figures came out equal.

```
node "$S/parse-cost.cjs" public/data/packs/ext_personalized_guide/tables/checkpoint_00.json public/data/packs/ext_personalized_guide/tables/city_00.json public/data/all-finisher-context/evidence.json public/data/runners/index/516.json.gz public/data/runners/index/5fc.json.gz

tables/checkpoint_00.json          file B 54847498 | JSON B 54847498 | gunzip ms 0 | parse ms 229-250 | heap MB with text 170 value only 116 | rss MB 196
tables/city_00.json                file B 12167171 | JSON B 12167171 | gunzip ms 0 | parse ms 106-111 | heap MB with text 34 value only 22 | rss MB 85-86
all-finisher-context/evidence.json file B 14868380 | JSON B 14868380 | gunzip ms 0 | parse ms 97-133 | heap MB with text 50 value only 21 | rss MB 72-79
index/516.json.gz                  file B 3438714 | JSON B 14144118 | gunzip ms 51-53 | parse ms 169-204 | heap MB with text 73 value only 45 | rss MB 130-132
index/5fc.json.gz                  file B 6591800 | JSON B 29917199 | gunzip ms 91-102 | parse ms 198-394 | heap MB with text 152 value only 92 | rss MB 206-217
```

Timings moved between runs (the checkpoint table parsed in 211 to 270 ms over nine runs), so the report quotes ranges; the heap figures were the same in every run. Live transfer sizes were read with `curl -sS -H 'accept-encoding: br' -o /dev/null -w '%{size_download}\n' --max-time 60 https://splithappens.run<path>` and the headers with `curl -sS -I -H 'accept-encoding: br' --max-time 30 https://splithappens.run<path>`.

**C. P0-2, the large tables**

```
stat -c '%s %n' public/data/runners/manifest.json public/data/packs/ext_personalized_guide/tables/checkpoint_00.json public/data/packs/ext_personalized_guide/tables/city_00.json public/data/all-finisher-context/evidence.json
926144 public/data/runners/manifest.json
54847498 public/data/packs/ext_personalized_guide/tables/checkpoint_00.json
12167171 public/data/packs/ext_personalized_guide/tables/city_00.json
14868380 public/data/all-finisher-context/evidence.json

ls -l public/data/packs/ext_personalized_guide/tables/checkpoint_*.json | awk '{print $5}' | sort -n | awk '{a[NR]=$1; s+=$1} END {print "checkpoint tables", NR, "bytes", s, "median", (a[NR/2]+a[NR/2+1])/2}'
checkpoint tables 28 bytes 226698704 median 3659537
ls -l public/data/packs/ext_personalized_guide/tables/checkpoint_*.json | awk '$5>5000000{n++} END{print n}'      # 8
ls -l public/data/packs/ext_personalized_guide/tables/city_*.json | awk '{n++; s+=$5} END{print n, s}'           # 28 44720258
```

Shape of the All-courses table and its size under two change-point encodings (a re-encoding in memory; nothing is written):

```
node -e '
const fs=require("fs"); const f="public/data/packs/ext_personalized_guide/tables/checkpoint_00.json";
const d=JSON.parse(fs.readFileSync(f,"utf8"));
const by={}; let cdfA=0,cdfB=0,cdfRaw=0,points=0,strict=0,entries=0,zero=0;
const len=x=>Buffer.byteLength(JSON.stringify(x));
for(const r of d.rows){
  const c=r.cdf; const A=[],B=[]; let run=0;
  for(let i=0;i<c.length;i++){ entries++; if(c[i]===0) zero++;
    if(i===0||c[i]!==c[i-1]){ if(i>0){B.push(run); strict++;} A.push(i,c[i]); B.push(c[i]); run=1; points++; } else run++; }
  B.push(run);
  cdfRaw+=len(c); cdfA+=len(A); cdfB+=len(B);
  const k=r.checkpoint; by[k]=by[k]||{rows:0,raw:0,A:0,B:0}; by[k].rows++; by[k].raw+=len(r)+1; by[k].A+=len({...r,cdf:A})+1; by[k].B+=len({...r,cdf:B})+1;
}
console.log("file",fs.statSync(f).size,"rows",d.rows.length,"entries",entries,"zero",zero,"change points",points,"strict changes",strict);
console.log("cdf bytes as stored",cdfRaw,"as [index,value] pairs",cdfA,"as [value,run] pairs",cdfB);
for(const [k,v] of Object.entries(by)) console.log("checkpoint",k,"rows",v.rows,"bytes now",v.raw,"with index pairs",v.A,"with runs",v.B);'

file 54847498 rows 21426 entries 13519806 zero 3672522 change points 1114069 strict changes 1092643
cdf bytes as stored 50292576 as [index,value] pairs 8901257 as [value,run] pairs 6854847
checkpoint 20 rows 5667 bytes now 14638557 with index pairs 4802046 with runs 3957410
checkpoint 30 rows 7717 bytes now 19657286 with index pairs 4635100 with runs 3937609
checkpoint 35 rows 8042 bytes now 20431458 with index pairs 3898836 with runs 3394553
```

13,519,806 entries in 21,426 rows is 631 per row. The top-level keys (`city`, `rows`) and the course name of each table show in `head -c 120` of the file.

**D. P0-3, stale state lines and broken links**

One script holds the searches. It reads tracked Markdown only; with `list` as a second argument it also prints the lines behind each count.

```
bash "$S/stale-search.sh" /home/user/pace-notes-review

1. ten phrases                                              42 lines in 19 files
2a. three phrases, live sections                            20 lines in 14 files
2b. three phrases, archived sections                         2 lines in  1 files
3. 1050 beside a present-state word, live sections          46 lines in 14 files
4. merged branch names, live sections                       38 lines in 14 files
5. release-intake sweep for 1050                            83 lines in 23 files
5a. the same files, live sections only                      73 lines in 23 files
6. table lines: 31 in 15 documents; ten phrases match 20, three phrases 16, five phrases 18
```

Search 1 is the phrase search, the ten phrases of the finding:

```
BROAD='draft PR #89|not merged|not deployed|production still uses|still pins|On `main` that is|on `main` since|source on `main` and in production|current refresh record|the current \[1050 refresh\]'
git grep -n -E "$BROAD" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!autopilot' ':!.claude'
```

Its 42 lines are: 20 of the table's 31; `docs/SEO.md:121` and `:126`; the handoff's Current state itself (`docs/PROJECT_HANDOFF.md:18`); 12 under History headings; 5 statements that are true today (`docs/ANALYTICS.md:55`, `:71`, `:159`; `docs/AUTOPILOT.md:226`; `docs/OPERATIONS.md:127`); and 2 that send the reader to "the current refresh record" without naming one (`docs/WEBSITE_ARCHITECTURE.md:79` and `docs/KNOWN_ISSUES.md:29`). The status cell of `docs/KNOWN_ISSUES.md:29` still reads "live (1050)": a candidate for the table that the 31 do not count, which is one more reason to read the table as a floor.

Searches 2a and 2b use the three phrases proposed for a check (`draft PR #|not merged|production still uses`) and split the matches by section. A section counts as archived when its nearest heading of level 1 to 4 contains "Histor" or "as written", except "Release history" and "preserved history", which head live sections. The 20 live lines are 16 table lines, `docs/SEO.md:121` and `:126`, `docs/PROJECT_HANDOFF.md:18` and `docs/OPERATIONS.md:215`; the 2 archived ones are `docs/HALF_MARATHON.md:299` and `:305`. `narrow3-all.out` lists the 22 with their class and heading.

Searches 3 and 4 are the two that follow headings and skip archived sections: `1050` as a number of its own beside a word for the present state (current, adopted, every page, still, on `main`, in production, live, "the release every", "pin names"), and the three merged branch names (`feat/half-v4`, `feat/cross-distance-label`, `feat/person-id-identity`). They point to sections to read; their counts include true lines.

Search 5 is release intake step 9 (`docs/OPERATIONS.md:164`) for the superseded release, and 5a the same with archived sections left out:

```
git grep -n -E 'private-export-20261021-1050|4,108,749|5,327,504' -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'
```

Line 6 tests the table's 31 lines (`stale31.txt`, one `file:line` per row) against the phrase patterns; the five-phrase pattern is the three plus `not deployed|until that branch merges`.

Links, and the two strings no document names:

```
python3 -I "$S/linkcheck.py" $(git ls-files '*.md')     # output saved as linkcheck.out; its last line: broken links: 26
git grep -c -F f1caea12 -- '*.md'                       # prints nothing
git grep -c -F "1,386,298" -- '*.md'                    # prints nothing
for c in b35789b8a 068b6c370; do git show $c:public/data/runners/manifest.json | python3 -I -c "import sys,json,hashlib; b=sys.stdin.buffer.read(); d=json.loads(b); print(d.get('release_tag'), hashlib.sha256(b).hexdigest()[:12], len(b))"; done
master-20261103b 8f593e056ac4 925805
master-20261103b f1caea128421 926144
```

The 26 broken links are 16 in `docs/history/handoff-2026-11-05-current-state-before-89.md` and 10 in `docs/history/handoff-2026-11-05-current-state-before-person-id.md`.

**E. Production reads (network: `splithappens.run` only; 2026-11-09, about 20:15 UTC)**

```
curl -sS --max-time 30 https://splithappens.run/version.json       # sha 068b6c37... (the reviewed commit), ref main, builtAt 2026-11-05T20:24:05.684Z
curl -sS --max-time 30 https://splithappens.run/data/live.json     # release_tag master-20261103b
for p in /htw /packs /packs/r10_unravel_typology /research/personalized /analyses/wind-and-pacing /your-race; do curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' "https://splithappens.run$p"; done
```

Headers and transfer sizes use the two `curl` forms at the end of block B. The home page as served is saved as `live/home.html` and its asset paths as `live/urls.txt`. The answers are quoted in the findings that use them. The only other host contacted was `registry.npmjs.org` (block A).

**F. P1-4, Git weight (sizes as Git stores them, in MiB although the commands print "MB")**

```
git rev-list --objects HEAD | git cat-file --batch-check='%(objecttype) %(objectsize:disk) %(rest)' | awk '$1=="blob" {n=split($3,a,"/"); key=(a[1]=="public" ? a[1]"/"a[2]"/"a[3] : a[1]); cnt[key]++; sz[key]+=$2; tot+=$2; tn++} END {for (k in sz) printf "%10.1f MB %7d  %s\n", sz[k]/1048576, cnt[k], k; printf "%10.1f MB %7d  TOTAL blobs\n", tot/1048576, tn}' | sort -nr | head -8

    2828.4 MB   54371  TOTAL blobs
    2609.5 MB   47049  public/data/runners
      85.0 MB    1386  public/data/runner-context
      68.9 MB     800  public/data/packs
      29.0 MB     408  public/charts/cards
      17.0 MB    1600  public/data/insights
       6.8 MB       5  public/data/all-finisher-context
       2.2 MB      11  public/data/fast-start

git rev-list --count HEAD          # 108
git rev-list --count --all         # 787
git count-objects -vH              # in-pack: 71824, size-pack: 3.12 GiB

for c in 068b6c370 b35789b8a 39f305713 77356bf08; do git diff-tree -r --no-renames --diff-filter=AM "$c^" "$c" | awk '{print $4}' | git cat-file --batch-check='%(objectsize) %(objectsize:disk)' | awk -v c="$c" '{n++; raw+=$1; disk+=$2} END {printf "%s files=%d raw=%.1f MB disk=%.1f MB\n", c, n, raw/1048576, disk/1048576}'; done

068b6c370 files=8563 raw=569.4 MB disk=501.1 MB
b35789b8a files=8944 raw=683.4 MB disk=511.5 MB
39f305713 files=8722 raw=677.7 MB disk=515.4 MB
77356bf08 files=8748 raw=722.8 MB disk=473.7 MB
```

The four `disk` figures sum to 2,001.7 MiB. The first command walks every object reachable from `HEAD`, so it is slow.

**G. P1-5, workflows (read from the files; the GitHub API was not called)**

```
ls .github/workflows | wc -l                                           # 13
ls .github/workflows | grep -v '^autopilot' | wc -l                    # 11
grep -L "^concurrency:" .github/workflows/*.yml | grep -v autopilot    # ten files: every one of the 11 but half.yml
grep -n -E "fetch-depth|filter:" .github/workflows/*.yml               # one line: half.yml:125, fetch-depth: 0
grep -h -o -E "uses: [A-Za-z0-9_./-]+@[A-Za-z0-9_.-]+" .github/workflows/*.yml | sort | uniq -c
     19 uses: actions/checkout@v4
      5 uses: actions/download-artifact@v4
     16 uses: actions/setup-node@v4
     11 uses: actions/setup-python@v5
     16 uses: actions/upload-artifact@v4
```

**H. P1-6 and P2-4, files and exports that nothing uses**

```
node "$S/reach.cjs" /home/user/pace-notes-review       # summary line: files 409 entries 69 reachable 403 unreachable 6
node "$S/exports.cjs" /home/user/pace-notes-review     # exported names no other file mentions; a name-based heuristic, read each hit
```

The recharts closure (424 packages with it, 390 without, 34 only because of it) came from a one-off walk over `package-lock.json` that was not saved as a script. The method: start from the root package's dependencies; resolve each dependency name from the depending package's path upward through `node_modules`, as Node does; take the closure over `dependencies`, `optionalDependencies` and `peerDependencies`; do it once with `recharts` in the starting list and once without. It is the one figure in this report whose command cannot be copied from here.

**I. P1-7, assertion messages**

```
node "$S/assertmsgs.cjs" /home/user/pace-notes-review     # last line: TOTAL without message 1790 with message 1728
```

**J. P1-8, token shapes (prints nothing today)**

```
git grep -n -I -E "(gh[p]_[A-Za-z0-9]{20,}|github_pa[t]_[A-Za-z0-9_]{20,}|gh[osu]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{24,}|ph[c]_[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{30,}\.)" -- . ':!public/data' ':!package-lock.json'
```

It is a shape search, not a secret scanner: it knows nine shapes and does not look at Git history or at `public/data`.

**K. P1-9, the Python side (counted and read; no Python from the repository was run)**

```
ls analysis/*.py | wc -l                                      # 87
cat analysis/*.py | wc -l                                     # 24407
ls analysis/test_*.py | wc -l                                 # 18
cat analysis/test_*.py | wc -l                                # 5246
cat analysis/test_*.py | grep -c -E '^\s*def test_'           # 256
git ls-files analysis/course_terrain | grep -c '\.py$'        # 27
git ls-files 'docs/evidence/**/pipeline*.sh' | wc -l          # 5
tot=0; miss=0; for f in analysis/*.py; do b=$(basename "$f" .py); case "$b" in test_*) continue;; esac; tot=$((tot+1)); grep -q -w -- "$b" analysis/test_*.py analysis/course_terrain/test_*.py 2>/dev/null || miss=$((miss+1)); done; echo "$miss of $tot"      # 22 of 69
```

To list the 22 modules, put `echo "$b"` in place of `miss=$((miss+1))`. A module counts as named when its name appears as a word in any test file, so the 22 is a floor on untested modules, not a coverage figure.

**L. Types and lint suppressions**

```
git ls-files app components lib | grep -c -E '\.(ts|tsx)$'                                    # 409 (app 69, components 215, lib 125)
git grep -l -E "^['\"]use client['\"]" -- app components lib | wc -l                          # 81
ls scripts/verify-*.cjs | wc -l                                                               # 32
git grep -n -E ":\s*any\b|\bas any\b|<any>|\bany\[\]" -- app components lib                   # 5 lines; 4 are prose, 1 is a type: lib/research-data.ts:44
git grep -n 'as unknown as' -- app components lib                                             # 1 line: lib/split-check-server.ts:22
git grep -n -E "@ts-nocheck|@ts-ignore|@ts-expect-error" -- app components lib                # nothing
git grep -n 'eslint-disable' -- app components lib scripts                                    # 9 lines in six files, all react-hooks/exhaustive-deps
```

**M. Smaller counts used in the findings**

```
git grep -n "DecompressionStream" -- app components lib scripts docs | wc -l                  # 3
git grep -n -F "?v=" -- lib components app | wc -l                                            # 9
grep -l -E "transpileModule" -r scripts --include=*.cjs | wc -l                               # 24
node -e "const b=require('./scripts/e2e/budget.json'); console.log(b.measured.length, Object.keys(b.pages).length)"      # 8177 40
git grep -l "NEXT_PUBLIC_BASE_PATH" | wc -l                                                   # 30
git grep -n -E "componentDidCatch|getDerivedStateFromError|ErrorBoundary" -- app components lib      # nothing
git grep -n "dataFetch(" -- app components lib | wc -l                                        # 10
git grep -l -E 'HTW|htw' -- . ':!public/data' ':!package-lock.json' | wc -l                   # 97 files (383 lines with -n)
git grep -l -F 'htw-live-study' -- . ':!public/data' ':!package-lock.json' | wc -l            # 32
git grep -l -F -e 'private-export' -- . ':!public/data' ':!package-lock.json' | wc -l         # 104
ls public/fonts/*.woff2 | wc -l; cat public/fonts/*.woff2 | wc -c                             # 13, then 558196
git ls-files '*.md' | wc -l; git ls-files -z '*.md' | xargs -0 cat | wc -c                    # 67, then 2468939
stat -c '%s %n' AGENTS.md docs/PROJECT_HANDOFF.md docs/OPERATIONS.md analysis/README.md       # 20117, 23923, 72393, 55094 (171,527 B together)
node "$S/moved-count.cjs" /home/user/pace-notes-review                                        # movedPages 91 movedPackIds 84
node -e "const fs=require('fs'),z=require('zlib');const b=fs.readFileSync('node_modules/next/dist/build/polyfills/polyfill-nomodule.js');console.log(b.length, z.gzipSync(b,{level:9}).length)"      # 91381 31084
diff <(sed -n '12,35p' lib/half.ts) <(sed -n '72,95p' lib/insights.ts) | wc -l                # 18
```

**N. What is in the scratch folder**

- `REPORT.md`: this report.
- Scripts, all read-only, each taking the repository path as its argument unless noted: `parse-cost.cjs` (takes file paths), `index-codes.cjs`, `reach.cjs`, `exports.cjs`, `assertmsgs.cjs`, `moved-count.cjs`, `stale-search.sh` with its list `stale31.txt`, and `linkcheck.py` (takes Markdown paths).
- Saved outputs: `eslintrc.review.json` and `eslint.review.json`, `npm-audit-prod.json`, `npm-outdated.json`, their three empty `.stderr` files, `linkcheck.out`, `narrow3-all.out`, `live/home.html` and `live/urls.txt`.

Nothing under `/home/user/pace-notes` or `/home/user/pace-notes-review` was edited, no branch was checked out, and no job is left running.
