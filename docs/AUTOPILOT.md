# Autopilot

The autopilot is how Pace Notes improves itself between your own changes. Twice a week a scheduled Claude session reads the site's analytics, picks one change, builds it on a branch and opens a pull request. A GitHub Actions workflow on `main` decides whether that pull request merges, waits for the deploy, checks the live site and reverts the merge by itself if the live site is broken. The data, the release pins and the privacy code are out of its reach: a guard rejects any autopilot pull request that touches them.

The rules the autopilot follows are in `autopilot/CONSTITUTION.md`. This page explains the machinery that enforces them.

**State on October 14, 2026.** Repository: the guard, merge gate, smoke test, statistics helper, version stamp and both workflows are in the setup pull request (branch `setup/autopilot`). Deployed: **not yet deployed or active.** Nothing merges until that pull request is on `main`, the `privacy-e2e` check and the `playwright` dev dependency exist (both come with the visit-signals pull request), and the scheduled session is turned on.

## What runs when

| What | When | Where |
| --- | --- | --- |
| **Pace Notes autopilot** (Claude session) | Mondays and Thursdays at 7:56 a.m. US Eastern | A scheduled task in Claude. It reads PostHog, writes a run note on the "Autopilot log" issue, and opens at most one pull request. It never merges. |
| **Autopilot merge** workflow | Every 15 minutes, whenever "Website data validation" finishes, and when an autopilot pull request is labelled, unlabelled, marked ready, reopened or gets new commits | `.github/workflows/autopilot-merge.yml`, always from `main` |
| **Autopilot guard** workflow | On every pull request (other branches pass at once) | `.github/workflows/autopilot-guard.yml`; early feedback only |
| **Website data validation** | On every pull request and push to `main`, as before | `.github/workflows/site-validation.yml`; its `verify` job now also self-tests the autopilot scripts |

GitHub can start scheduled workflows a few minutes late, and turns them off after 60 days without any activity in the repository.

## The loop

1. **Observe.** The session reads PostHog (aggregate numbers and a bounded number of recording summaries) and the ledger of earlier changes.
2. **Evaluate.** Changes whose evaluation date has passed are judged by the rule written down before they shipped, with `npm run autopilot:stats`. Small samples are called inconclusive.
3. **Choose.** One change, with a hypothesis, a primary metric, guardrails, a baseline and a decision rule, appended as a line to `autopilot/ledger.jsonl` in the same pull request.
4. **Build.** On a branch `autopilot/YYYY-MM-DD-<slug>`. Before it marks the pull request ready the session runs `npm run autopilot:check`, looks at the changed pages at phone and desktop widths, and has the change reviewed against the constitution.
5. **Pull request.** Labelled `autopilot`, opened by `koolkam00` (Claude sessions act as that account).
6. **Gates.** The merge workflow checks every gate below on the current head commit, then runs the smoke test against the pull request's Vercel preview.
7. **Merge.** A squash merge, pinned to the commit that passed. The merge comment repeats the gate table.
8. **Deploy.** The workflow waits (up to 30 minutes) for Vercel's Production deployment of the merge commit, then until https://splithappens.run/version.json names that commit (up to 5 minutes).
9. **Live check.** The smoke test runs over every page in the sitemap, and `npm run verify:seo:live` checks redirects, the sitemap and headers.
10. **Auto-revert.** If a live check fails, the workflow reverts the merge on `main` and opens an incident issue, which pauses everything (see [Incidents](#incidents)).

## Merge gates

Every gate is checked on each run; the workflow merges the first pull request (lowest number) for which all of them pass, and at most one per run. The table on the pull request's status comment (marked `<!-- autopilot-merge-status -->`, edited in place, only when something changes) is how the session learns why a pull request is waiting.

| Gate | Passes when |
| --- | --- |
| Open, ready, targets `main` | The pull request is open, not a draft, and its base is `main`. |
| No forks | The branch is in `koolkam00/pace-notes`. |
| Autopilot branch | The branch name starts with `autopilot/`. |
| Author | Opened by `koolkam00`. |
| Label | It has the `autopilot` label. |
| No blocking label | None of `autopilot:paused`, `autopilot:needs-owner`, `do-not-merge` on the pull request. |
| Not paused | No open issue or pull request anywhere in the repository has the `autopilot:paused` label. |
| Not switched off | The repository variable `AUTOPILOT_MERGE` is not `off`. |
| Checks | The latest attempt of the `verify` and `privacy-e2e` check runs (from GitHub Actions) on the current head commit finished with success. A check on an older commit, or one still running, does not count. |
| Vercel status | The `Vercel` commit status on the head commit is success. |
| Guard | `main`'s copy of `scripts/autopilot-guard.cjs` passes on the pull request's head (see below). |
| Review threads | No unresolved review thread. |
| Change requests | No reviewer's latest review requests changes. |
| Ready long enough | At least 15 minutes since the pull request was marked ready (or opened, if it was opened ready). |
| Mergeable | GitHub says it merges cleanly, and it is not behind `main` (otherwise the table says "needs main merged in"). |
| Preview | Vercel reports a successful Preview deployment of the head commit, with its address. |
| Preview smoke test | The quick smoke test passes on that preview, including `version.json` naming the head commit. A failure is recorded on the status comment and blocks that commit; push a fix, or an empty commit, to try again. |

## What an autopilot pull request can never change

The guard (`npm run autopilot:guard -- --base origin/main --head HEAD`) reads the change with git only and never runs code from the pull request. It fails the pull request when:

- **It touches a protected path** (added, changed, deleted or renamed). The authoritative list is `PROTECTED` at the top of `scripts/autopilot-guard.cjs`:
  - data and releases: `analysis/**`, `public/data/**`, `data/**`;
  - privacy and measurement: `lib/analytics.ts`, `lib/analytics-policy.ts`, `lib/replay-policy.ts`, `lib/event-policy.ts`, `lib/data-fetch.ts`, `lib/experiment-runtime.ts`, `components/SiteAnalytics.tsx`, `components/AnalyticsPreference.tsx`, `components/PageFeedback.tsx`, `components/SectionTracker.tsx`, `components/Experiment.tsx`, `app/privacy/**`, `app/error.tsx`, `app/global-error.tsx`, `docs/ANALYTICS.md`;
  - checks and tooling: `scripts/**`, `.github/**`, `.claude/**`, `package.json`, `package-lock.json`, `next.config.*`, `vercel.json`, `tsconfig.json`, `.gitignore`, `.npmrc`, `.nvmrc`, `.node-version`;
  - rules: `CLAUDE.md`, `AGENTS.md`, `autopilot/CONSTITUTION.md`, `autopilot/metrics.md`, `LICENSE*`.
- **It deletes or moves a page**: any `app/**/page.tsx` or `app/**/route.ts`, and the files behind `/robots.txt`, `/sitemap.xml` and the web manifest. URLs are your decision.
- **The root layout loses analytics**: `app/layout.tsx` must still render `<SiteAnalytics />` (and `<ExperimentHead />` once `main` has it). Commented-out tags do not count.
- **An added line could leak data or load something from elsewhere**: `<script`, `next/script`, `dangerouslySetInnerHTML`, `innerHTML` and similar, `eval(`, `new Function(`, cookies, `localStorage`, `sessionStorage`, `indexedDB`, `sendBeacon`, `XMLHttpRequest`, WebSockets, `EventSource`, any mention of PostHog, `<iframe`, `fetch(` or `import(` of an absolute address, and `src=`, `srcSet=`, `url(`, `@import` or `<link href=` pointing at another host (external images, fonts and media reveal visitors' IP addresses). Ordinary `<a href="https://…">` links are fine. Lines added in several consecutive lines are read together, so splitting a tag over lines does not hide it. This applies to every file except `docs/`, `autopilot/` and Markdown, so a new folder cannot get around it.
- **An added line breaks a copy rule**: the banned words and phrases in constitution §3, and the release identifiers that never appear in visible copy (same files as above).
- **It is too big**: more than 30 changed files, more than 1,500 changed lines (added plus deleted, not counting the ledger), a binary file outside `public/` (or in `public/data/`), a binary file over 600 KB, or more than 2 MB of binary files in total. Symbolic links and submodules are refused.
- **The ledger is wrong**: the pull request must append at least one line to `autopilot/ledger.jsonl`. Every line must be a JSON object with `id` (unique, `YYYY-MM-DD-slug`), `date`, `kind` (`change`, `experiment`, `conclude`, `revert`, `fix`), `title`, `hypothesis`, `primary_metric`, `guardrails` (a list), `baseline` (an object), `decision_rule`, `evaluate_after` (a date; `null` only for `fix` and `revert`), `status` (`proposed`, `shipped`, `reverted`, `concluded`), `pr` (a number or `null`), `verdict` (`null` or `keep`, `revert`, `inconclusive`, `iterate`, `ship-variant`, `keep-control`) and `result` (`null` or an object). Existing lines cannot be removed or moved, and for them only `status`, `verdict`, `result`, `evaluated_on`, `pr` and `notes` may change.

Branch names must look like `autopilot/2026-10-15-home-hero` (lower case, at most 80 characters).

The guard is a pattern check, not a proof. It is one layer next to the constitution, CI, the adversarial review, the preview smoke test and the live check. A determined attempt to hide a third-party request in code it cannot recognise would get past it; the smoke test's network tripwire is the next layer, and you can review any merged change in the pull request.

## How to stop it

In order of how quickly they act:

1. **Add the label `autopilot:paused` to any open issue**, for example the "Autopilot log" issue. Merges stop within 15 minutes (the merge workflow checks on every run), and the scheduled session sees the label and skips its run. Remove the label, or close the issue, to resume.
2. **Set the repository variable `AUTOPILOT_MERGE` to `off`** (Settings → Secrets and variables → Actions → Variables). Nothing merges until you change or delete it. The session can still open pull requests.
3. **Disable the "Autopilot merge" workflow** in the Actions tab. Pull requests then stay open until you merge them yourself.
4. **Turn off the "Pace Notes autopilot" scheduled task in Claude.** No new sessions run.

To hold one pull request without pausing everything, add `autopilot:needs-owner` or `do-not-merge` to it, request changes, or leave a review comment unresolved.

## Incidents

When the live checks fail after a merge, the workflow:

1. reverts the merge commit on an up-to-date `main` as `github-actions[bot]` and pushes it (if the revert conflicts with later commits, or the push is refused, it skips the revert and says so; Vercel deploys a successful revert as usual);
2. opens an issue titled `Autopilot incident: <pull request title>` with the labels `autopilot-incident` and `autopilot:paused`, saying which step failed, a short log excerpt, the workflow run, the pull request, the merge commit and whether the revert was pushed;
3. comments on the pull request with a link to it.

Because the issue carries `autopilot:paused`, nothing else merges until it is closed. If the deploy itself fails or times out, the workflow opens the same issue without reverting (a deploy problem says nothing about the change). The workflow does not watch the revert's own deploy; the next session (or you) confirms it with `npm run autopilot:smoke -- --base https://splithappens.run --quick` before closing the issue. The constitution allows the session to close an incident only once the cause is understood and fixed and the live smoke test passes.

Merges and reverts made with the workflow's `GITHUB_TOKEN` do not start other workflows, so "Website data validation" does not run on those pushes to `main`. The pull request's own CI run, the preview smoke test and the live checks stand in for it. Vercel still deploys them.

## Tools

| Command | What it does |
| --- | --- |
| `npm run autopilot:check` | Everything an autopilot pull request must pass before it is marked ready: `verify:data`, `verify:analytics`, `build`, `verify:seo`, `verify:autopilot`, then the guard against `origin/main`. **Note for maintainers:** once `verify:compat` (older-browser check) and `verify:replay-e2e` (privacy browser tests) exist on `main`, add them to this script. |
| `npm run autopilot:guard -- --base <ref> --head <ref> [--branch <name>] [--json]` | The guard. The branch defaults to `GITHUB_HEAD_REF`, then the checked-out branch when `--head` is `HEAD`; other branches pass without checks. `--self-test` builds temporary repositories covering every rule. |
| `npm run autopilot:smoke -- --base <url> [--quick] [--expect-sha <sha>] [--json <file>]` | Opens pages in Chromium at 390×844 (and 1366×900 for `/` and `/tools`). Fails on a status other than 200, a page error, Next.js's "Application error" screen, a missing or hidden `<h1>`, the site's error-page heading, or a request to the site itself answering 400 or more. The quick list is also opened as Safari before 16.4 behaves (a RegExp with lookbehind throws). Requests to other hosts are aborted: PostHog's are counted (expected on production; nothing is sent), so is Vercel's own preview toolbar (`vercel.live`, which Vercel adds to `*.vercel.app` previews only), and any other host fails the run. A failing page is loaded once more in a fresh browser context and fails only if that load fails too, so one dropped request does not revert a good deploy; pages that passed only on the second load are listed in the output. It also measures the home page with 4× CPU throttling and a 1.6 Mbps / 150 ms network and reports LCP, CLS and total blocking time; only a CLS above 0.25 fails. Behind a proxy, run it with `NODE_USE_ENV_PROXY=1`. |
| `npm run autopilot:stats -- <command>` | `ab --a x/n --b x/n` and `prepost --before x/n --after x/n` (rates with 95% Wilson intervals, the difference with Newcombe's interval, a two-sided z-test and the probability that B is higher); `mde --p <rate> --n <per group>` and `need --p <rate> --lift <difference>` (80% power, two-sided 5% level); `median` and `p75 --values a,b,c`. Add `--json` for machine output. |
| `npm run verify:autopilot` | Self-tests of the guard, the merge gate (against a mocked GitHub API, plus real reverts in temporary repositories) and the statistics (against published values). CI runs it. |
| `node scripts/autopilot-merge.cjs evaluate --dry-run [--pr <n>]` | The merge gate's view of open autopilot pull requests (or of one pull request), writing nothing. Without `GITHUB_TOKEN` it reads the public API anonymously and cannot read review threads. |

**Version stamp.** `npm run build` first runs `scripts/write-version.cjs`, which writes `public/version.json` with the commit (`VERCEL_GIT_COMMIT_SHA`, else git), the branch and the build time. It is ignored by git, served with `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and is not in the sitemap. The merge workflow and `--expect-sha` read it to confirm which commit a preview or production deploy serves.

## Measured on October 14, 2026

Against production (commit `510eb20`, before this change was merged), from a sandbox whose outbound proxy occasionally answers 502:

- Quick run: 23 pages, 48 checks, about 80 seconds. Every page passed in normal mode. In old-Safari mode 5 of 23 failed (`/`, `/analyses`, `/analyses/pacing-pattern`, `/courses/amsterdam`, `/about`): the known lookbehind crash, which the old-Safari fix removes. `--expect-sha` failed because `version.json` does not exist there yet.
- Full run: 117 pages (the 115 sitemap pages plus `/runners` and `/request-analysis`), 142 checks, about 2 minutes 43 seconds. 137 passed; the 5 failures were the same old-Safari pages. Two pages passed only on the second load, after a 502 on a script from the sandbox's proxy; before the second load was added, such 502s failed four pages in one run.
- Quick run on a Vercel preview (`3268ae5`): about 75 seconds, the same results, 48 Vercel toolbar requests aborted and counted, no other host.
- Home page lab (median of 3): LCP about 1.5 s, CLS 0.003, total blocking time about 1.0 s.
- Fault injection on a local copy of the build: a wrong commit in `version.json`, a missing page script (404), an image from another host, a removed `<h1>` (hydration error) and the error-page heading were each reported.

## Optional hardening (owner steps)

- **A ruleset on `main`** (Settings → Rules → Rulesets): require a pull request before merging, require the status checks `verify`, `privacy-e2e` and `autopilot-guard`, block force pushes and deletion. Add **GitHub Actions** as the only bypass actor, so the merge workflow's automatic reverts can still push to `main`. Do not require approvals: the autopilot acts as your account and cannot approve its own pull requests.
- **Pin the "Autopilot log" issue**, so its pause label is easy to find.
- **Optionally turn off the Vercel Toolbar on previews** (Vercel project settings). The smoke test already ignores it, but previews then load nothing from another host at all.
- **Create the labels** `autopilot`, `autopilot:paused`, `autopilot:needs-owner`, `autopilot-incident` and `do-not-merge` ahead of time (the workflow creates the incident and pause labels itself if they are missing).

## Files

- `autopilot/CONSTITUTION.md`: the rules, which override everything else the autopilot reads; only you change it.
- `autopilot/metrics.md`: the metrics a change may be judged by, and how each is measured.
- `autopilot/backlog.md`: ideas and problems waiting for a run.
- `autopilot/LEARNINGS.md`: what earlier changes taught, kept short.
- `autopilot/ledger.jsonl`: one line per change, written before it ships and updated when it is judged.
- `.claude/skills/pace-notes-autopilot/SKILL.md`: the session's step-by-step playbook.
- `scripts/autopilot-guard.cjs`, `scripts/autopilot-merge.cjs`, `scripts/autopilot-smoke.cjs`, `scripts/autopilot-stats.cjs`, `scripts/write-version.cjs`: the machinery described on this page.
- `.github/workflows/autopilot-merge.yml`, `.github/workflows/autopilot-guard.yml`: the workflows.
