# Autopilot

The autopilot is how Pace Notes improves itself between your own changes. Twice a week a scheduled Claude session reads the site's analytics, picks one change, builds it on a branch and opens a pull request. A GitHub Actions workflow on `main` decides whether that pull request merges, waits for the deploy, checks the live site and reverts the merge by itself if the live site is broken. The data, the release pins and the privacy code are out of its reach: a guard rejects any autopilot pull request that touches them.

The rules the autopilot follows are in `autopilot/CONSTITUTION.md`. This page explains the machinery that enforces them, and what it cannot enforce.

**State on October 15, 2026.** Repository: the guard, merge gate, smoke test, statistics helper, version stamp and both workflows are in the setup pull request (branch `setup/autopilot`, rebased on `main` after the older-Safari fix, #56). Deployed: **not yet deployed or active.** Nothing merges until that pull request is on `main`, the `privacy-e2e` check and the `playwright` dev dependency exist (both come with the visit-signals pull request), and the scheduled session is turned on.

## What runs when

| What | When | Where |
| --- | --- | --- |
| **Pace Notes autopilot** (Claude session) | Mondays and Thursdays at 7:56 a.m. US Eastern | A scheduled task in Claude. It reads PostHog, writes a run note on the "Autopilot log" issue, and opens at most one pull request. It is told never to merge; see [What the machinery cannot stop](#what-the-machinery-cannot-stop). |
| **Autopilot merge** workflow | Every 15 minutes, whenever "Website data validation" finishes, and when an autopilot pull request is labelled, unlabelled, marked ready, reopened or gets new commits | `.github/workflows/autopilot-merge.yml`, always from `main` |
| **Autopilot guard** workflow | On every pull request (other branches pass at once) | `.github/workflows/autopilot-guard.yml`; early feedback only, because it runs the pull request's own copy |
| **Website data validation** | On every pull request and push to `main`, as before | `.github/workflows/site-validation.yml`; its `verify` job now also self-tests the autopilot scripts |

GitHub can start scheduled workflows a few minutes late, and turns them off after 60 days without any activity in the repository.

The merge workflow has five jobs. The two that open pages in a browser, and so run the pull request's own JavaScript (its preview) or the merged code (production), run on machines of their own with a read-only token and no credentials on disk. The gate and merge jobs check out only `scripts/` and fetch file contents as git needs them, since they read git objects, not the site. Their reads of the GitHub API are tried up to three times, so one bad answer does not fail a scheduled run.

1. **gate** checks every gate below and picks at most one pull request;
2. **preview** smoke-tests every sitemap page of that pull request's Vercel preview and runs `verify:seo:live` against it, then smoke-tests every production sitemap page as a baseline (read-only);
3. **merge** records the result on the pull request, checks every gate again and squash-merges, then waits for the production deploy. It never runs in a cancelled run;
4. **live** smoke-tests every sitemap page of https://splithappens.run and runs `verify:seo:live` (read-only);
5. **report** records that the live checks passed, or opens an incident (reverting the merge when a live check failed), and then, whatever happened, makes sure every autopilot merge is accounted for.

## The loop

1. **Observe.** The session reads PostHog (aggregate numbers and a bounded number of recording summaries) and the ledger of earlier changes.
2. **Evaluate.** Changes whose evaluation date has passed are judged by the rule written down before they shipped, with `npm run autopilot:stats`. Small samples are called inconclusive.
3. **Choose.** One change, with a hypothesis, a primary metric, guardrails, a baseline and a decision rule, appended as a line to `autopilot/ledger.jsonl` in the same pull request.
4. **Build.** On a branch `autopilot/YYYY-MM-DD-<slug>`. Before it marks the pull request ready the session runs `npm run autopilot:check`, looks at the changed pages at phone and desktop widths, and has the change reviewed against the constitution.
5. **Pull request.** Labelled `autopilot`, opened by `koolkam00` (Claude sessions act as that account).
6. **Gates.** The merge workflow checks every gate below on the current head commit, including a `verify:seo:live` run against production, so the change is never blamed for a problem the live site already had.
7. **Preview checks.** The smoke test runs over every page in the pull request's Vercel preview (with `version.json` naming the head commit), and `verify:seo:live` checks the preview's redirects, sitemap, headers and share card. Then the full smoke test runs on production, with the same coverage as the post-deploy run, as a baseline for step 11.
8. **Merge.** A squash merge, pinned to the commit that passed. The merge comment repeats the gate table.
9. **Deploy.** The workflow waits (up to 30 minutes) for Vercel's Production deployment of the merge commit, then until https://splithappens.run/version.json names that commit (up to 5 minutes).
10. **Live check.** The smoke test runs over every page in the sitemap, and `npm run verify:seo:live` checks redirects, the sitemap and headers.
11. **Record or revert.** If both pass, the workflow leaves a hidden "live checks passed" record on the pull request. If a live check failed, it reverts the merge on `main` and opens an incident issue, which pauses everything (see [Incidents](#incidents)). The report job compares the baseline and live failure sets, matching the page, viewport, browser mode and exact failure message. It skips the revert only when every live smoke failure was already recorded before the merge; any new failure still reverts, even if another page was already broken. Missing or malformed artifacts cannot justify skipping a revert. A failed SEO check always reverts, because SEO passed just before merging.

## Merge gates

Every gate is checked on each run; the workflow merges the first pull request (lowest number) for which all of them pass, and at most one per run. The table on the pull request's status comment (marked `<!-- autopilot-merge-status -->`, edited in place, only when something changes) is how the session learns why a pull request is waiting. Failures it has already recorded for the head commit (the preview checks failed, or GitHub refused the merge) stay on that comment, with the details and a link to the run, until a new commit is pushed.

| Gate | Passes when |
| --- | --- |
| Open, ready, targets `main` | The pull request is open, not a draft, and its base is `main`. |
| No forks | The branch is in `koolkam00/pace-notes`. |
| Autopilot branch | The branch name starts with `autopilot/`. |
| Author | Opened by `koolkam00`. |
| Label | It has the `autopilot` label. |
| No blocking label | None of `autopilot:paused`, `autopilot:needs-owner`, `do-not-merge` on the pull request. |
| Not paused | No open issue or pull request anywhere in the repository has the `autopilot:paused` label. |
| Not switched off | The repository variable `AUTOPILOT_MERGE` is unset or `on`. Any other value (`off`, `false`, `0`, `no`, `paused`, …) stops merges, and the table shows the value it found. |
| Merge history | Every autopilot pull request merged in the last 14 days has either the "live checks passed" record or an incident issue. One that has neither (merged by hand, or by a run that was cancelled or timed out before the live checks) gets an incident issue at once, which pauses everything. |
| Checks | Every check run on the current head commit finished cleanly: for each app and name, the latest attempt completed with success, neutral or skipped. Anything queued or running waits; any other result fails. The `verify` and `privacy-e2e` runs from GitHub Actions must be among them. A check on an older commit does not count. |
| Vercel status | The `Vercel` commit status on the head commit, posted by `vercel[bot]`, is success. |
| Guard | `main`'s copy of `scripts/autopilot-guard.cjs` passes on the pull request's head (see below). |
| Review threads | No unresolved review thread. |
| Change requests | No reviewer's latest review requests changes (the Codex review bot can request changes; you cannot on a pull request opened as your own account). |
| Ready long enough | At least 15 minutes since the later of: the pull request being marked ready (or opened, if it was opened ready), and the head commit arriving (the first check suite GitHub created for it; commit dates are not used, since anyone can set them). |
| Mergeable | GitHub says it merges cleanly, and it is not behind `main` (otherwise the table says "needs main merged in"). |
| Preview | `vercel[bot]` reports a successful Preview deployment of the head commit, at one of this project's preview addresses (`htw-live-study-…-koolkam00s-projects.vercel.app`). |
| Preview checks have not failed | The preview checks (next row) have not already failed on this commit. Push a fix, or an empty commit, to try again. |
| GitHub has not refused | An earlier merge attempt on this commit was not refused by GitHub (for example by a ruleset); the reason is in the table. Push a commit to try again. |
| Live site healthy | `verify:seo:live` passes against production just before merging. Checked only once everything else passes; while it fails, merges wait (the table says what fails), so the change is not reverted for a problem it did not cause. |
| Preview checks | After the gates: the smoke test of every sitemap page passes on the preview, including `version.json` naming the head commit, and `verify:seo:live` passes against the preview. A failure blocks that commit. If the checks could not finish (the browser did not start, or the preview could not be reached), the commit is tried again on the next run. The full smoke test of production that follows is a baseline only: it never blocks the merge (so a change that fixes a problem on production can ship), but its individual failure identities determine whether a later smoke failure is pre-existing. An aggregate failed exit code never exempts new failures. |

## What an autopilot pull request can never change

The guard (`npm run autopilot:guard -- --base origin/main --head HEAD`) reads the change with git only and never runs code from the pull request. It fails the pull request when:

- **It touches a protected path** (added, changed, deleted or renamed). The authoritative list is `PROTECTED` at the top of `scripts/autopilot-guard.cjs`:
  - data and releases: `analysis/**`, `public/data/**`, `data/**`, `docs/evidence/**`;
  - privacy and measurement, **under every file extension** (webpack prefers a `.js` or `.mjs` file to a `.ts` file of the same name, so a sibling would replace the module): `lib/analytics.*`, `lib/analytics-policy.*`, `lib/replay-policy.*`, `lib/event-policy.*`, `lib/data-fetch.*`, `lib/experiment-runtime.*`, `lib/chunk-reload.*`, `components/SiteAnalytics.*`, `components/AnalyticsPreference.*`, `components/PageFeedback.*`, `components/SectionTracker.*`, every `components/Experiment*` file (the experiment framework, including `ExperimentVariant.tsx` with `useVariant`; the registry `lib/experiments.ts` stays open), `app/privacy/**`, `docs/ANALYTICS.md`;
  - error pages, at any depth: `app/**/error.*`, `app/**/global-error.*`, `app/**/not-found.*` (the smoke test recognises an error page by `main`'s headings, so a new one would hide crashes from it);
  - checks and tooling: `scripts/**`, `.github/**`, `.claude/**`, `package.json` (in any folder), `package-lock.json`, `next.config.*`, `vercel.json`, `tsconfig.json`, `.gitignore`, `.npmrc`, `.nvmrc`, `.node-version`;
  - rules and the documents that describe them: `CLAUDE.md`, `AGENTS.md`, `autopilot/CONSTITUTION.md`, `autopilot/metrics.md`, `docs/AUTOPILOT.md`, `docs/PROJECT_HANDOFF.md`, `LICENSE*`.
- **It touches anything outside the allowed areas.** An autopilot pull request may only change `app/`, `components/`, `lib/`, `hooks/`, `context/`, `public/` (not `public/data/`), `styles/`, Markdown files under `docs/`, and `autopilot/ledger.jsonl`, `autopilot/backlog.md` and `autopilot/LEARNINGS.md`. Every file at the root, every dotfile in any folder (`.env.production`, `.babelrc`, `.postcssrc`, `.vercelignore`, …) and any new top-level folder counts as protected, because Next.js and Vercel read such files at build time.
- **It adds JavaScript to site code**: a new or renamed `.js`, `.jsx`, `.mjs` or `.cjs` file under `app/`, `components/`, `lib/`, `hooks/`, `context/` or `styles/`. Site code is TypeScript; JavaScript is not type-checked and would win over a TypeScript module of the same name.
- **It deletes or moves a page**: any `app/**/page.tsx` or `app/**/route.ts`, and the files behind `/robots.txt`, `/sitemap.xml` and the web manifest. URLs are your decision.
- **The root layout loses analytics**: `app/layout.tsx` must still render `<SiteAnalytics />` (and `<ExperimentHead />` once `main` has it). This is a pattern check: commented-out tags (including trailing `//` comments) and tags behind `false &&` do not count, but it cannot prove the component renders.
- **An added line could leak data, load something from elsewhere or replace error UI**: `<script`, `next/script`, `dangerouslySetInnerHTML`, `innerHTML` and similar, `eval(`, `new Function(`, cookies, `localStorage`, `sessionStorage`, `indexedDB`, `sendBeacon`, `XMLHttpRequest`, WebSockets, `EventSource`, any mention of PostHog, `<iframe>`, `<embed>`, `<object>`, `<base>`, `javascript:` addresses, `fetch(` or `import(` of an absolute address, `src=`, `srcSet=` (any candidate), `url(`, `@import` or `<link href=` pointing at another host, inline event handlers (`onload=`, `onerror=`) in HTML and SVG files, and a custom error boundary (`getDerivedStateFromError`, `componentDidCatch`). In `.ts`, `.tsx` and `.js` files the tags and `url(` are matched in lower case only, so React components such as `<Link>` or `<Frame>` and the `URL` constructor are not mistaken for them; `<object` followed by type punctuation (`Array<object>`) is a type, and `javascript:` counts only as an address (after a quote, `(` or `=`), so copy such as "needs JavaScript: …" is fine.
- **An added line names another host outside a link.** Any address on another host in code (a constant, a data list, a template, a `setAttribute` call, page metadata) fails, because a later line can load it and external images, fonts, scripts and data reveal visitors' IP addresses. So does an address whose host is computed (`` `https://${host}/…` ``, `'https://' + host`), which the guard cannot read. A link's address is fine where a link's address belongs: `href=` (an `<a>` or a `next/link` `<Link>`) or a `url`, `href` or `link` field of a list of links, as the citations already use. Identifiers that are never fetched are fine too: XML namespaces (`xmlns:inkscape="http://…"`) and the JSON-LD fields `license`, `sameAs`, `citation` and `@id` (`npm run verify:seo` keeps the JSON-LD privacy rules). Addresses on the site itself, `doi.org`, `schema.org`, `www.w3.org`, `www.sitemaps.org` and `github.com/koolkam00` are allowed anywhere, and addresses in comments are ignored (a comment marker inside a string does not count as one).
- **An added line breaks a copy rule**: the banned words and phrases in constitution §3 ("the wall clock" is fine), and the release identifiers that never appear in visible copy (the tag, not the `private-export-` prefix the data loaders use to check a release).
- These scans cover every changed file except the prose files (Markdown under `docs/`, and the three `autopilot/` files). A file moved into site code from a path that was never scanned is read in full, not just its changed lines. A line moved unchanged from one scanned file to another (a component split in two) is existing code and is not reported again; an edited line is.
- **It is too big**: more than 60 changed files; more than 1,500 changed lines (added plus deleted, not counting the ledger); more than 200 KB of added text in one file or 1 MB in all; a line over 3,000 characters outside `public/` (no minified code or inlined images); more than 10 new ledger lines.
- **A file is not what it says**: only `png`, `jpg`, `jpeg`, `webp`, `avif`, `gif`, `ico`, `woff`, `woff2`, `ttf`, `otf`, `pdf`, `mp4` and `webm` files may be binary, only under `public/` (not `public/data/`) or as a Next.js icon or share image under `app/` (`favicon.ico`, `icon`, `apple-icon`, `opengraph-image`, `twitter-image`), each at most 600 KB and 2 MB in all. Every other file must be UTF-8 text, so it is scanned. Symbolic links and submodules are refused.
- **The ledger is wrong** (the lifecycle is in `autopilot/metrics.md` §4): the pull request must append at least one line to `autopilot/ledger.jsonl`, unless it is a bookkeeping pull request that changes nothing but existing ledger lines, `autopilot/backlog.md` and `autopilot/LEARNINGS.md`. Every new or changed line must be one JSON object on one line with `id` (unique, `YYYY-MM-DD-slug`), `date`, `kind` (`change`, `experiment`, `conclude`, `revert`, `fix`), `title`, `hypothesis`, `primary_metric`, `guardrails` (a list), `baseline` (an object), `decision_rule`, `evaluate_after` (a date; `null` only for `fix`, `revert` and `conclude`), `status` (`proposed`, `shipped`, `reverted`, `concluded`), `pr` (a number or `null`), `verdict` (`null` or `keep`, `revert`, `inconclusive`, `iterate`, `ship-variant`, `keep-control`) and `result` (`null` or an object); `shipped_on` and `evaluated_on`, when present, are dates or `null`. Experiment entries also require `min_sample` (a positive safe integer) and `max_days` (an integer from 1 to 42); both are immutable after registration.
  - A **new** entry is pre-registered: status `proposed`, `verdict`, `result` and `shipped_on` null, dated within two days of the branch date, with `id` exactly equal to the branch name after `autopilot/`, and naming this pull request or none. The one exception is the record of an earlier change whose pull request closed without merging: status `reverted`, with `verdict` null or `inconclusive`, and its earlier date, historical branch ID and pull request number. Such a closed-unmerged record cannot substitute for the new proposal required by a site-changing pull request.
  - An **existing** entry cannot be removed or moved, and only `status`, `verdict`, `result`, `evaluated_on`, `pr`, `shipped_on` and `notes` may change. The status only moves forward (`proposed` to `shipped`, `concluded` or `reverted`; `shipped` to `concluded` or `reverted`; `concluded` to `reverted`), and `verdict`, `result`, `evaluated_on`, `pr` and `shipped_on` may be filled in once and are then fixed. Lines are matched by `id`, so a deleted line is reported as deleted.
  - Problems already on `main` (a blank line, a byte-order mark, an old entry that breaks a rule) are reported as warnings, so they never block every later pull request; a broken line may be repaired.
- **The work is not committed.** Run on `HEAD` (as `npm run autopilot:check` does), the guard fails while tracked files have uncommitted changes, because it reads commits, not the working tree; untracked files are a warning.

Branch names must look like `autopilot/2026-10-15-home-hero` (a real date, lower case, at most 80 characters).

The guard is a pattern check, not a proof. It is one layer next to the constitution, CI, the adversarial review, the preview checks and the live check. A determined attempt to hide a third-party request in code it cannot recognise (for example by building a host name from pieces held in different variables) would get past it; the smoke test's network tripwire, which scrolls every page to the bottom so lazy images load too, is the next layer (on the preview for every sitemap page before the merge, and on production after it), and you can review any merged change in the pull request.

`npm run verify:seo` also keeps two privacy rules of its own, rather than reading them from `lib/seo-routes.ts` (which autopilot pull requests may edit, for example to update a page's date): `robots.txt` must keep blocking the two folders of recorded runner names, and `/runners` and `/your-race` must stay noindex.

## How to stop it

In order of how quickly they act:

1. **Add the label `autopilot:paused` to any open issue**, for example the "Autopilot log" issue. Merges stop within 15 minutes, and the scheduled session sees the label and skips its run. The label is checked again just before merging, so it also stops a run that is already under way. Remove the label, or close the issue, to resume. (Cancelling a run of the workflow before its merge step also stops that one merge.)
2. **Set the repository variable `AUTOPILOT_MERGE` to `off`** (Settings → Secrets and variables → Actions → Variables); any value other than `on` works. Nothing merges in runs that start after the change. A run already under way may have read the old value, so use the label above when it must stop now. The session can still open pull requests.
3. **Disable the "Autopilot merge" workflow** in the Actions tab. Pull requests then stay open until you merge them yourself.
4. **Turn off the "Pace Notes autopilot" scheduled task in Claude.** No new sessions run.

To hold one pull request without pausing everything, add `autopilot:needs-owner` or `do-not-merge` to it, or leave a review comment unresolved. (Requesting changes does not work on these pull requests: they are opened as your own account, and GitHub does not let an author request changes on their own pull request.)

## Incidents

When a live check fails after a merge, the workflow:

1. reverts the merge commit on an up-to-date `main` as `github-actions[bot]` and pushes it (if the revert conflicts with later commits, or the push is refused, it skips the revert and says so; Vercel deploys a successful revert as usual). The revert keeps the records: the squash merge contained the change's ledger line and any learnings, so the revert commit puts `main`'s ledger and `autopilot/LEARNINGS.md` back and marks the entries that merge added `reverted` (verdict `revert`, with the pull request, `shipped_on` and a dated note). The ledger therefore still shows that the change was tried and reverted, which the session's "two reverts in a row" check reads;
2. opens an issue titled `Autopilot incident: <pull request title>` with the labels `autopilot-incident` and `autopilot:paused`, saying which step failed, a short log excerpt, the workflow run, the pull request, the merge commit and whether the revert was pushed (opening the issue is tried three times);
3. comments on the pull request with a link to it.

Because the issue carries `autopilot:paused`, nothing else merges until it is closed, a revert pull request included. When the automatic revert could not be pushed and the site is still broken, the session opens a revert pull request and asks you, under "Needs you" in its log, to close the incident so that the revert can merge through the usual gates (or use a Vercel rollback for a hard outage). Other cases open the same issue without reverting, because they do not show the change itself is at fault:

- the deploy failed or timed out (the issue gives the reason: a Vercel failure, no deployment in time, or `version.json` not naming the merge);
- the live checks could not finish (the site could not be reached, production was already serving a later commit, or the job was cancelled or timed out);
- every live smoke failure exactly matches one in the full pre-merge baseline (page, viewport, browser mode and message). This opens an incident without reverting. New failures, including a different error on an already-broken page, still revert. Exact matching is intentionally conservative: changed error text or measured CLS values count as a new failure rather than risk hiding a regression. The baseline and live JSON remain in the run's artifacts;
- a merged autopilot pull request has neither the "live checks passed" record nor an incident. The workflow checks this at the end of every run and at the start of the next one, so a merge by hand, a cancelled run, a lost answer from GitHub or an incident that could not be opened all end in an incident.

The workflow does not watch the revert's own deploy; the next session (or you) confirms it with `npm run autopilot:smoke -- --base https://splithappens.run --quick` before closing the issue. The constitution allows the session to close an incident only once the cause is understood and fixed and the live smoke test passes.

Merges and reverts made with the workflow's `GITHUB_TOKEN` do not start other workflows, so "Website data validation" does not run on those pushes to `main`. The pull request's own CI run, the preview checks and the live checks stand in for it. Vercel still deploys them.

## What the machinery cannot stop

The Claude session acts as your GitHub account, `koolkam00`, which is an admin of a repository whose `main` is not protected, and it has tools that can merge pull requests and push commits. "It never merges" is an instruction in the constitution and the session's playbook, not a technical limit. What the machinery does about it:

- every gate, the guard and the merge itself run from `main`'s copy of the workflow, so an autopilot pull request cannot loosen them;
- an autopilot pull request merged by anyone but the workflow is noticed within 15 minutes and opens a paused incident, so nothing else merges until you have looked;
- a push straight to `main` is not noticed by the workflow. The Vercel deploy and your own review are the only checks on it.

A ruleset on `main` does not close this while the session uses your account: an admin can bypass rulesets, and the `autopilot-guard` check that a ruleset could require runs the pull request's own copy of the guard, so a pull request that edits it can make it pass.

## Optional hardening (owner steps)

- **Durable fix: give the session its own GitHub account** with the write role (not admin), and sign it in instead of yours. Then add a ruleset on `main` (Settings → Rules → Rulesets): require a pull request, require the `verify` and `privacy-e2e` checks, block force pushes and deletion, and restrict who may update `main` to the admin role and the merge workflow's identity. Change `allowedAuthors` in `scripts/autopilot-merge.cjs` to the new account in the same owner pull request.
- **Do not add "GitHub Actions" as a ruleset bypass actor.** It would let any workflow push to `main`, including a push-triggered workflow committed on any branch, which runs before any guard. If a ruleset blocks pushes to `main`, the automatic revert's push is refused; the incident then says "not pushed", and you revert by hand. To keep automatic reverts under a ruleset, use a dedicated GitHub App (or deploy key) whose secret lives in an environment that only `main` may use, and use it only for the revert push. This needs a small change to the workflow, made by you.
- **Pin the "Autopilot log" issue**, so its pause label is easy to find.
- **Optionally turn off the Vercel Toolbar on previews** (Vercel project settings). The smoke test already ignores it, but previews then load nothing from another host at all.
- **Create the labels** `autopilot`, `autopilot:paused`, `autopilot:needs-owner`, `autopilot-incident`, `autopilot-log` (the session finds the "Autopilot log" issue by it) and `do-not-merge` ahead of time (the workflow creates the incident and pause labels itself if they are missing).

## Tools

| Command | What it does |
| --- | --- |
| `npm run autopilot:check` | Everything an autopilot pull request must pass before it is marked ready: `verify:data`, `verify:analytics`, `verify:compat` (older-browser source scan), `build`, `verify:compat -- --build`, `verify:seo`, `verify:autopilot`, then the guard against `origin/main` (commit first: the guard reads commits). **Note for maintainers:** once the privacy browser tests (the `privacy-e2e` check) have an npm script on `main`, add it to this script too; until then CI runs them and the merge gate requires them. |
| `npm run autopilot:guard -- --base <ref> --head <ref> [--branch <name>] [--pr <n>] [--json]` | The guard. The branch defaults to `GITHUB_HEAD_REF`, then the checked-out branch when `--head` is `HEAD`; other branches pass without checks. `--pr` lets it check that new ledger lines name this pull request. `--self-test` builds temporary repositories covering every rule. |
| `npm run autopilot:smoke -- --base <url> [--quick] [--expect-sha <sha>] [--json <file>]` | Opens pages in Chromium at 390×844 (and 1366×900 for `/` and `/tools`), scrolling each to the bottom in steps so lazy images and anything loaded on scroll are requested too, and watching each for at least 5 seconds from the start of its navigation. Fails on a status other than 200, a page error, Next.js's "Application error" screen, a missing or hidden `<h1>`, an error page (the site's error-page heading, or any element marked `data-error-boundary`), or a request to the site itself answering 400 or more. The quick list is also opened as Safari before 16.4 behaves (a RegExp with lookbehind throws). Requests to other hosts are aborted: PostHog's are counted (expected on production; nothing is sent), so is Vercel's own preview toolbar (`vercel.live`, which Vercel adds to `*.vercel.app` previews only), and any other host fails the run. A page whose first load failed for a network reason (a timeout, a 5xx, a failed request to the site) is loaded once more and fails only if that load fails too; a page error or crash with no network cause fails at once, so an error that shows up on some loads only is not hidden. `sitemap.xml` and `version.json` are fetched up to three times. It also measures the home page with 4× CPU throttling and a 1.6 Mbps / 150 ms network and reports LCP, CLS and total blocking time; only a CLS above 0.25 fails (no finished lab run is a warning). Exit 0 passed, 1 failed, 3 could not finish (the browser did not start, `sitemap.xml` or `version.json` could not be read, or a non-preview address such as production already serves another commit, and nothing else failed; on a `*.vercel.app` preview, whose address belongs to one deployment, another commit is a failure). Behind a proxy, run it with `NODE_USE_ENV_PROXY=1`. |
| `npm run verify:seo:live` | The live search checks. Each request is tried up to three times when the network fails or the site answers 5xx; exit 3 means the only failures were requests that never got an answer. |
| `npm run autopilot:stats -- <command>` | `ab --a x/n --b x/n` and `prepost --before x/n --after x/n` (rates with 95% Wilson intervals, the difference with Newcombe's interval, a two-sided z-test and the probability that B is higher); `mde --p <rate> --n <per group>` and `need --p <rate> --lift <difference>` (80% power, two-sided 5% level); `median` and `p75 --values a,b,c`. Add `--json` for machine output. |
| `npm run verify:autopilot` | Self-tests of the guard, the merge gate (against a mocked GitHub API, including the workflow's artifact-to-decision command and real report-driven reverts in temporary repositories) and the statistics (against published values). CI runs it. |
| `node scripts/autopilot-merge.cjs evaluate --dry-run [--pr <n>]` | The merge gate's view of open autopilot pull requests (or of one pull request), writing nothing. Without `GITHUB_TOKEN` it reads the public API anonymously and cannot read review threads. `reconcile --dry-run` lists autopilot merges without a live-check record. |

**Version stamp.** `npm run build` first runs `scripts/write-version.cjs`, which writes `public/version.json` with the commit (`VERCEL_GIT_COMMIT_SHA`, else git), the branch and the build time. It is ignored by git, served with `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and is not in the sitemap. The merge workflow and `--expect-sha` read it to confirm which commit a preview or production deploy serves.

## Measured on October 14, 2026

Against production (commit `510eb20`, before this change was merged), from a sandbox whose outbound proxy occasionally answers 502:

- Quick run: 23 pages, 48 checks, about 80 seconds. Every page passed in normal mode. In old-Safari mode 5 of 23 failed (`/`, `/analyses`, `/analyses/pacing-pattern`, `/courses/amsterdam`, `/about`): the known lookbehind crash, which the old-Safari fix removes. `--expect-sha` failed because `version.json` does not exist there yet.
- Full run: 117 pages (the 115 sitemap pages plus `/runners` and `/request-analysis`), 142 checks, about 2 minutes 43 seconds. 137 passed; the 5 failures were the same old-Safari pages. Two pages passed only on the second load, after a 502 on a script from the sandbox's proxy; before the second load was added, such 502s failed four pages in one run.
- Quick run on a Vercel preview (`3268ae5`): about 75 seconds, the same results, 48 Vercel toolbar requests aborted and counted, no other host.
- Home page lab (median of 3): LCP about 1.5 s, CLS 0.003, total blocking time about 1.0 s.
- Fault injection on a local copy of the build: a wrong commit in `version.json`, a missing page script (404), an image from another host, a removed `<h1>` (hydration error) and the error-page heading were each reported.

After the review fixes (pages scrolled to the bottom and watched for at least 5 seconds, a second load only for a network cause), from the same sandbox:

- Quick run on production: 94 seconds, the same results (every normal page passed; the same 5 old-Safari failures).
- Full run on production: 117 pages, 142 checks, about 3 minutes 49 seconds; the same 5 old-Safari failures and nothing else. Two pages were loaded a second time, each after a 502 on a script from the sandbox's proxy, and passed.
- `verify:seo:live` with retries passed twice in a row against production, and its path checks passed against the `3268ae5` preview (without retries, the same preview run had failed two checks on dropped connections).
- Fault injection on a local copy of the older-Safari-fix build (quick run): a clean copy passed (48 of 48 checks, old Safari included); a 502 on the first request for `version.json` and for `sitemap.xml` passed after the retry; `sitemap.xml` always answering 502 ended with exit 3 ("could not finish"), not a failure; a page script throwing 2.5 seconds after it ran failed `/tools` on all three checks with no second load (before the 5-second watch, it passed); an image from another host far below the fold, loaded lazily, failed `/tools` (the scroll reached it); an element marked `data-error-boundary` failed `/about`.

## Measured on October 15, 2026

After the second review round, from the same sandbox:

- Quick run on production (now with the older-Safari fix): 23 pages, 48 checks, about 102 seconds, every check passed (old Safari 23 of 23); 48 PostHog requests aborted, no other host; home lab LCP about 1.5 s, CLS 0.003, total blocking time about 0.9 s.
- A local copy of the build whose `version.json` named another commit: every page passed and the run ended "could not finish" (exit 3), not failed.
- The guard in a partial, `scripts/`-only clone of the repository (as the workflows now check out) fetched the file contents it needed and checked an 18-file change in about 12 seconds through the sandbox's proxy.
- `actionlint` 1.7.7 reports nothing on the three workflows.

## Files

- `autopilot/CONSTITUTION.md`: the rules, which override everything else the autopilot reads; only you change it.
- `autopilot/metrics.md`: the metrics a change may be judged by, and how each is measured.
- `autopilot/backlog.md`: ideas and problems waiting for a run.
- `autopilot/LEARNINGS.md`: what earlier changes taught, kept short.
- `autopilot/ledger.jsonl`: one line per change, written before it ships, then marked shipped and later judged (lifecycle in `autopilot/metrics.md` §4).
- `.claude/skills/pace-notes-autopilot/SKILL.md`: the session's step-by-step playbook.
- `scripts/autopilot-guard.cjs`, `scripts/autopilot-merge.cjs`, `scripts/autopilot-smoke.cjs`, `scripts/autopilot-stats.cjs`, `scripts/write-version.cjs`: the machinery described on this page.
- `.github/workflows/autopilot-merge.yml`, `.github/workflows/autopilot-guard.yml`: the workflows.
