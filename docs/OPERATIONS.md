# Operations runbook

This is the one runbook: which checks a change needs, how a commit is pushed, merged and deployed, how a new release is taken in, how anonymous access is proved, and the refresh sequence for each data family. The standing rules are in [AGENTS.md](../AGENTS.md) and the owner's decisions in [OWNER_DECISIONS.md](OWNER_DECISIONS.md). The current state (main, production, the pins, open pull requests, the autopilot) belongs in the [project handoff](PROJECT_HANDOFF.md), and the autopilot's machinery is in [AUTOPILOT.md](AUTOPILOT.md).

Repository state, merged state and deployed state are three different facts. Write "live" only after reading `/version.json` ([after a merge](#pull-requests-merging-and-deploying)).

Sections: [checks by change type](#checks-by-change-type) · [before you push](#before-you-push) · [pull requests, merging and deploying](#pull-requests-merging-and-deploying) · [release intake](#release-intake) · [access checks](#access-checks) · [CI workflow map](#ci-workflow-map) · [agent environment notes](#agent-environment-notes) · [statuses](#report-statuses-separately). Refresh sequences: [source and audit](#verify-access-and-source-state) · [calculation](#calculate-all-owned-outputs) · [import](#validate-import-and-publish) · [runner context](#runner-context-refresh) · [all-finisher context](#all-finisher-context-refresh) · [fast start](#fast-start-analysis-refresh) · [stories](#data-story-refresh) · [terrain splits](#terrain-splits-refresh) · [Top 100 charts](#top-100-charts-refresh) · [half](#half-refresh) · [producer](#producer-operations-and-missing-information).

## Checks by change type

Two workflows run on every pull request, whatever it touches. **Website data validation** (`.github/workflows/site-validation.yml`, Node 20) also runs on every push to `main`. **Autopilot guard** passes at once for a branch that does not start with `autopilot/`. Website data validation has two jobs:

- **`verify`**, in this order: `npm ci`, `npm run verify:data`, `npm run verify:analytics`, `npm run verify:compat`, `npm run verify:autopilot`, `npm run build`, `npm run verify:compat -- --build`, `npm run verify:seo`.
- **`privacy-e2e`**: `npx playwright install --with-deps chromium`, a build with the dummy analytics key (`NEXT_PUBLIC_POSTHOG_KEY=phc_test_dummy`, `NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com`), then `npm run verify:replay-e2e -- --keep e2e-failures`. That runs the browser scenarios S1–S8 in `scripts/e2e/scenarios/`; S8 is the [first-load budget](#first-load-budgets-s8). `npm run autopilot:privacy` runs the same build and scenarios locally.

`verify:data` is a chain of verifiers in `package.json`, starting with `verify-css.cjs`. It ends with both card checks: `node scripts/build-chart-cards.cjs --check` (the Top 100 cards), then `node scripts/verify-half.cjs`, which also requires a current half receipt, then `node scripts/build-chart-cards.cjs --check --set half`. The data-family workflows run as well when a pull request touches their paths ([CI workflow map](#ci-workflow-map)).

| Change | Run before pushing | CI that runs |
| --- | --- | --- |
| Documentation only (Markdown outside `analysis/`) | The [link and anchor check](#the-link-and-anchor-check) and `git diff --check origin/main` (no trailing spaces, no blank line at the end of a file). Run `npm run verify:analytics` if `docs/ANALYTICS.md` changed, because it parses that file's event table. Run `npm run verify:autopilot` if `autopilot/metrics.md` changed, because the guard reads its `## 1. Definitions` table (only the owner edits that file). Never edit `docs/CHARTS_INSTAGRAM.md` by hand: `node scripts/build-chart-cards.cjs --captions` writes it. No full-data calculation is needed ([AGENTS.md](../AGENTS.md)). | Website data validation and Autopilot guard; Half marathon if `docs/evidence/half/**` changed |
| Site code or copy (`app/`, `components/`, `lib/`, styles) | `npx tsc --noEmit -p .`, then the `verify` job's commands in its order, then `npm run autopilot:privacy`. For a visual change, build, capture the changed pages and look at them ([design system](DESIGN_SYSTEM.md)). | Website data validation. Also Top 100 charts for `lib/charts/**` and `components/charts/**`; Half marathon for `lib/half*`, `lib/tools/half-to-full.ts`, `lib/nuggets/half.ts`, `lib/charts/text/half.ts`, `components/half/**` and `app/half/**`; Runner context and peers for `lib/runner-context.ts` |
| Anything a share card is stamped with: the chart drawing code, `app/styles/tokens.css`, `app/styles/fonts.css`, `app/styles/pages/charts.css`, `lib/units.ts`, `lib/nuggets/format.ts`, the three card fonts, and for the half cards also `lib/tools/half-to-full.ts`, `lib/nuggets/half.ts` and `lib/charts/text/half.ts` (the exact lists are `CODE` in `scripts/build-chart-cards.cjs` and `scripts/half/card-images.cjs`) | The row above, plus `node scripts/build-chart-cards.cjs` and `node scripts/build-chart-cards.cjs --set half`. Each redraws the cards whose stamp changed and needs Chromium. Open the changed PNGs, then run both `--check` commands. A colour-token change also needs `npm run og:check`, which checks the share images in `public/og/` (`npm run og:images` redraws them). | `verify:data` runs both card checks; Top 100 charts and Half marathon repeat their own |
| Published data (`public/data/**`) | That family's sequence below: build into a fresh folder, run its verifier with `--input`, copy, then `npm run verify:data` and `npm run build`. | Website data validation and the family's workflow |
| Calculation (`analysis/*.py`) | `python -m unittest discover -s analysis -p 'test_*.py'` (Python 3.12, as in CI), then the family's builder and verifier | Marathon pacing analysis on any `analysis/**` path (every Python test, a FULL download and the whole calculation, up to 60 minutes), so a documentation edit under `analysis/` starts it too; and the family's workflow |
| Half files (pin, policy, builders, recount, half pages) | `python3 -I -m unittest discover -s analysis -p 'test_half.py'`, `node scripts/verify-half.cjs` and `node scripts/build-chart-cards.cjs --check --set half`. After any rebuild, also `npm run verify:half-source`, which writes the receipt, and after a build `node scripts/verify-half.cjs --html` ([half refresh](#half-refresh)). | Half marathon: `check` on every half pull request, and `source` when the pin, the policy, a builder, the downloader or the recount changes |
| Analytics, replay or privacy code | `npm run verify:analytics` and `npm run autopilot:privacy` | Website data validation (`privacy-e2e`) |
| Autopilot machinery (`scripts/autopilot-*.cjs`, its workflows) | `npm run verify:autopilot` | Website data validation (`verify`) |
| A new page route or tool | The site-code row. A new route needs an S8 figure ([below](#first-load-budgets-s8)). A new tool also needs its typed-value case in S2 (`scripts/e2e/scenarios/s2-differential.cjs`) and its entry in `COMPONENT` in `scripts/verify-tools.cjs`, which checks the badges its component renders against `lib/tools/registry.ts` ([AUTOPILOT.md](AUTOPILOT.md#what-an-autopilot-pull-request-can-never-change)). | Website data validation |
| A new release | [Release intake](#release-intake), then the refresh sequences below | All of the above |

**Everything at once.** `npm run autopilot:check` runs the `verify` job's commands, then `npm run autopilot:privacy`, then the autopilot guard against `origin/main`. Commit first, because the guard reads commits. `npm run autopilot:quick` leaves out `verify:data` and the browser scenarios ([AUTOPILOT.md](AUTOPILOT.md#tools)).

**Checks that no CI job runs.** Run these yourself when they apply:

- `npm run og:check`: the share images and the colour tokens they copy.
- `npm run verify:css`: `verify-css.cjs --self-test` and `copy-fonts.cjs --check`. `verify:data` runs only the plain `verify-css.cjs`.
- `node scripts/font-fallbacks.cjs --check`, after a build, with the Liberation fonts installed.
- `node scripts/verify-chapters.cjs --html` and `node scripts/verify-half.cjs --html`, after a build.
- `npm run design:lint` and `npm run design:shoot`, each with `--routes=` ([design system](DESIGN_SYSTEM.md)).
- `npx tsc --noEmit -p .` (there is no `typecheck` script).
- `npm run verify:half-source` writes the receipt locally. CI repeats the recount, with `--no-write`, only in the Half marathon `source` job.
- `npm run verify:seo:live` reads the live site. The autopilot merge workflow runs it; owner merges do not.

### First-load budgets (S8)

S8 measures the gzipped bytes of every script a page's exported HTML names, for each page type (each `app/**/page.tsx`). It compares them with that page's figure in `scripts/e2e/budget.json` and fails a page more than 1,536 B over. A route with no figure of its own is held to the largest figure in its section plus 1.5 KB (`scripts/e2e/scenarios/s8-budget.cjs`).

- **When a page goes over, look for an accidental import first.** There were two cases on October 30, 2026, in #85. Importing one string constant from `lib/tools/half-to-full.ts` into a client component put the whole module in every story page's first-load script, which left the story route 27 B over. Drawing a server-drawn chart in a client component instead cost about 7.7 KB on every story page. Both were fixed the same way: the server page builds the values and the words and passes them in as props (`components/half/PredictorLink.client.tsx` explains this).
- **Raise a figure only for an intended feature, and record why.** Rebuild with the dummy key as CI does, then run `npm run verify:replay-e2e -- --only=S8 --write-budget`. This re-measures every page's figure (and adds any route that has none), not only the page that grew, so read the whole diff. Then add a dated entry at the top of the file's `measured` text, by hand, naming the pages that moved, by how much, and why. For example, on October 30, 2026 `/tools/predictor` grew by 1,657 B for the half panel's loader. Never raise a figure to absorb an accidental import, and never change the tolerance.
- Autopilot pull requests cannot edit `scripts/`. A page that grows past its tolerance there needs the owner ([constitution](../autopilot/CONSTITUTION.md) §6).

### The half receipt

`docs/evidence/half/source-recount.json` is the receipt of the local source recount. Run `npm run verify:half-source` (about 90 seconds and 1 GB) after any half rebuild, then commit the receipt with the data and the cards. `verify-half`, which runs in `verify:data` and in the Half marathon `check` job, fails while the receipt is stale. The `source` job repeats the recount from the public assets without writing a receipt.

### The link and anchor check

No script or CI job checks the documents' links yet (a CI check awaits the owner: [handoff](PROJECT_HANDOFF.md#open-for-the-owner), item 12). Run this from the repository root; it reads every tracked Markdown file, resolves each relative link and each `#anchor` the way GitHub writes heading anchors, skips fenced code, and exits 1 on any broken link:

```bash
python3 -I - $(git ls-files '*.md') <<'EOF'
import os, re, sys, unicodedata
def slug(h):  # GitHub's heading anchors
    h = re.sub(r'<[^>]+>|`', '', h.strip().lower())
    return ''.join(c for c in h if c in '-_ ' or unicodedata.category(c)[0] in 'LN').replace(' ', '-')
def lines(path):  # skips fenced code blocks
    fence = False
    for n, line in enumerate(open(path, encoding='utf8'), 1):
        if re.match(r'\s*```[\w+-]*\s*$', line): fence = not fence
        elif not fence: yield n, line
seen = {}
def anchors(path):
    if path not in seen:
        found, count = set(), {}
        for _, line in lines(path):
            m = re.match(r'(#{1,6})\s+(.*?)\s*#*\s*$', line)
            if m:
                b = slug(m.group(2)); k = count.get(b, 0); count[b] = k + 1
                found.add(b if k == 0 else f'{b}-{k}')
            found.update(re.findall(r'<a (?:name|id)="([^"]+)"', line))
        seen[path] = found
    return seen[path]
bad = 0
for f in sys.argv[1:]:
    for n, line in lines(f):
        for url in re.findall(r'\]\(([^)\s]+)', line):
            if re.match(r'[a-z]+:', url): continue
            target, _, frag = url.partition('#')
            t = os.path.normpath(os.path.join(os.path.dirname(f), target)) if target else f
            if not os.path.exists(t) or (frag and t.endswith('.md') and frag not in anchors(t)):
                print(f'{f}:{n}: broken link {url}'); bad += 1
print('broken links:', bad); sys.exit(1 if bad else 0)
EOF
```

## Before you push

1. **Commit only your own files.** Use `git add <paths>`. When other agents share the worktree, never use `git add -A` or a bare `git stash`. Never commit another agent's unfinished edits to satisfy a hook that asks you to commit: wait until their step has finished.
2. **Check the exact commit you will push, in a clean checkout.** The working tree can hold files that make a check pass or fail. Run the checks for your change type in a detached worktree of that commit:

   ```bash
   SHA=$(git rev-parse HEAD)
   git worktree add --detach "/tmp/check-$SHA" "$SHA"
   ln -s "$PWD/node_modules" "/tmp/check-$SHA/node_modules"
   (cd "/tmp/check-$SHA" && npm run verify:data)   # and the other checks for the change type
   git worktree remove --force "/tmp/check-$SHA"
   ```

   For half data, run `npx tsc --noEmit -p .`, `node scripts/verify-half.cjs` (it also compares the receipt's `manifest_sha256` with `public/data/half/manifest.json`), both card checks and `test_half.py`, and scan `public/data/half` for record-level keys, since pages publish aggregates only.
3. **Push by commit when someone else may still be committing in the worktree:** `git push origin <sha>:refs/heads/<branch>`.
4. **Read the remote before saying what is pushed.** `git ls-remote origin <branch>` is read-only, dated evidence of the remote head. Pull request checks belong to a head commit, so read them again after every push: `gh api repos/koolkam00/pace-notes/commits/<sha>/check-runs --jq '.check_runs[] | [.name, .conclusion] | @tsv'`.
5. **Never weaken a check to make it pass.** Find the cause. If a number legitimately moved, change the expectation with a dated comment saying why.

## Pull requests, merging and deploying

- **Who merges.** Merge an owner or agent pull request only when the owner has asked for that pull request to merge, and quote and date the request in it (for example "Can you also add options for paces per mile for each 5k and mile time then merge it", October 29, 2026, and "publish everything and full merge", October 30, 2026; [register](OWNER_DECISIONS.md)). Autopilot pull requests are merged only by the merge workflow ([constitution](../autopilot/CONSTITUTION.md) §4.3).
- **Open and merge through REST.** `gh pr …` is refused here ([agent environment notes](#agent-environment-notes)), so use `gh api`:

  ```bash
  gh api repos/koolkam00/pace-notes/pulls -f title='<title>' -f head=<branch> -f base=main -F draft=true -F body=@<body file>
  gh api repos/koolkam00/pace-notes/pulls/<n> --jq '{state, draft, mergeable_state, head: .head.sha}'
  gh api -X PUT repos/koolkam00/pace-notes/pulls/<n>/merge -f merge_method=squash -f sha=<head sha>   # only on the owner's request
  ```

  Passing `sha` makes GitHub refuse the merge if the head moved after you checked it.
- **Branch from current `main`:** `git fetch origin`, then `git worktree add -b <branch> <dir> origin/main`. An agent reads `AGENTS.md` from the commit it has checked out, so a stale clone gives it stale rules. Do not start an owner branch with `autopilot/`: the merge workflow treats every such branch as an autopilot pull request ([AUTOPILOT.md](AUTOPILOT.md#merge-gates)).
- **The repository squash-merges.** Every first-parent commit on `main` since #57 is `Title (#N)` (22 of 22 on October 30, 2026). Merge commits and rebasing are also allowed, and branches are kept after a merge (`delete_branch_on_merge` is false).
- **A pull request whose commits were merged into a feature branch is not marked merged when the feature branch squash-merges.** Merge it into `main` first, then bring `main` into the feature branch. On October 30, 2026, #84 was merged at 20:27:06 UTC, before #85 at 20:49:11 UTC.
- **Set the merge-day fields on the day the pull request merges, not the day it was written.** These are `published` in `lib/stories.ts` (a story's JSON-LD `datePublished`), and `CONTENT_DATES`, `COURSE_PAGES_WRITTEN` and `HALF_TEXT_WRITTEN` in `lib/seo-routes.ts` (sitemap `lastmod`). `verify-seo` refuses a `lastmod` after today (UTC; `--today YYYY-MM-DD` overrides it), so a date set ahead fails CI until that day.
- **The pull request's CI is the gate.** Vercel builds a preview for every pull request and deploys `main` on merge, before `main`'s own CI finishes. For #85: merged 20:49:11 UTC, production `builtAt` 20:50:31, the Vercel status success at 20:52:20, and `main`'s Website data validation finished at 21:09:03 (October 30, 2026). Check `main`'s run afterwards anyway.
- **After a merge, check what is deployed before writing "live":**

  ```bash
  curl -s https://splithappens.run/version.json        # sha, ref and builtAt: must name the merge commit
  curl -s https://splithappens.run/data/live.json      # release_tag of the marathon data
  npm run autopilot:smoke -- --base https://splithappens.run --quick --expect-sha <merge sha>
  npm run verify:seo:live
  ```

  Behind a proxy, run the smoke test with `NODE_USE_ENV_PROXY=1`. `scripts/write-version.cjs` writes `version.json` at build time from `VERCEL_GIT_COMMIT_SHA`. Then, for a merge that changes a page, data, a contract or a workflow, record it in the [project handoff](PROJECT_HANDOFF.md#current-state)'s Current state in the next pull request, with the time in UTC ([AGENTS.md](../AGENTS.md) rule 19). A documentation-only or record-only merge changes no page: read `version.json` and record nothing more.

## Release intake

Releases come from two repositories:

- `koolkam00/pace-notes` (public): the marathon exports (`private-export-*`, `htw-db-*`) and the half datasets (`half-dataset-*`).
- `koolkam00/pace-notes-db-backup` (private): backups, half snapshots (`half-snapshot-*`), link builds (`runner-links-*`) and person-id builds (`person-ids-*`). Reading it needs an account with access.

1. **Before any data pull request merges, and at every adoption,** list both repositories' releases and read every release newer than each pin: `analysis/release.json`, `analysis/weather-release.json` and `analysis/half-release.json`, including its `metadata_correction`.

   ```bash
   gh api 'repos/koolkam00/pace-notes/releases?per_page=20' --jq '.[] | [.tag_name, .published_at] | @tsv'
   gh api 'repos/koolkam00/pace-notes-db-backup/releases?per_page=20' --jq '.[] | [.tag_name, .published_at] | @tsv'
   gh api repos/koolkam00/pace-notes/releases/tags/<tag> --jq .body
   ```

2. **A correction release supersedes the metadata it names.** `half-dataset-20261029-2157` says "243 verified (stamped) editions — supersedes half-dataset-20261029-1202, which said 314". It was published hours before the half pages merged and withdrew the verified label from 72 editions (869,551 finishes; [half marathons](HALF_MARATHON.md)). The pin keeps the 1202 snapshot and links and pins the correction's `csv-edition_meta.csv.zst` as `metadata_correction`, applied as "verified = stamped in both".
3. **Pin the public release when there is one,** and keep a private tag as provenance (the half pin's `private_tag` and `provenance` fields).
4. **Before joining corrected metadata to an older snapshot, check that the join key is stable between them.** Count the edition ids whose city or year differ. Never assume they match.
5. **For a new marathon export,** nothing is calculated until its edition policy is reviewed (`REVIEWED_POLICIES` in `analysis/source_quality.py`). Download, inspect and audit it as in [reproduce and audit](#reproduce-and-audit-the-current-input), with `export TAG=<new tag>` first (those commands read the pin's tag only when `TAG` is unset, and the pins change at step 8) and `--previous` set to the previously adopted release's input folder.
6. **Check every new asset URL anonymously and date the result** ([access checks](#access-checks)). Then rewrite the top of [analysis/ACCESS.md](../analysis/ACCESS.md) (step 5 of [verify access and source state](#verify-access-and-source-state)).
7. **The half binds the marathon release.** `lib/half-server.ts` stops the site build ("Half data must use the adopted marathon release.") until the half pin's `marathon_release` names the adopted tag and the half data are rebuilt, and the link build must be redone for the new release, because link record ids follow the marathon release's canonical ids ([half refresh](#half-refresh)). Ask the producer for a link build on the new release before adoption; then follow the half refresh (the half pin, `EXPECTED` in `analysis/half_marathon.py`, `REVIEWED_MARATHON` in `scripts/verify-half-source.cjs`, a new receipt). Whether an adoption waits for that link build or the half is withdrawn meanwhile is for the owner; no decision is recorded ([handoff](PROJECT_HANDOFF.md#open-for-the-owner)).
8. **Write `docs/REFRESH_<tag>.md`** (the [1050 record](REFRESH_20261021_1050.md) is the model), set `tag` in `analysis/release.json` and `analysis/weather-release.json` to the audited tag, update the code that names the adopted tag (below), and run the refresh sequences.
9. **Sweep the documents for the previous release.** Use `git grep -n -E "<previous tag>|<its headline counts>" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'`, then update each hit or label it with its release. PR #78 (1050) updated eleven existing documents and added two refresh records. On October 30, 2026, six it did not touch (STORIES, TOOLS, TOP_TEN_ANALYSES, ANALYSIS_CATALOG, WEBSITE_ARCHITECTURE and SEO) still named the 1652 tag or its eligible count.
10. **A published release starts Marathon pacing analysis. Read its steps, not its colour.** The half-dataset releases gave skipped runs, because the job accepts only `private-export-` and `htw-db-` tags. The 0829 and 1050 releases gave failed runs on October 21, 2026: both stopped at "Download verified FULL export" (runs 39601391082 and 39623893354).

**Code that names the adopted tag** (update it in the adoption pull request; each check fails until it is):

- `REVIEWED_POLICIES` (and a `RULES_<stamp>` entry) in `analysis/source_quality.py`; `CANONICAL_ID_RELEASES` in `analysis/build_extended.py`; the accepted `input_export_id` values in `analysis/calculation_provenance.py`, `scripts/verify-research.cjs` and `scripts/verify-personalized.cjs`.
- `lib/kept-holds.json` (the producer-held editions kept after review, by tag).
- The half: `EXPECTED` in `analysis/half_marathon.py`, `REVIEWED_MARATHON` in `scripts/verify-half-source.cjs` and `marathon_release` in `analysis/half-release.json` (step 7).
- The release dates kept out of visible copy: `RELEASE_LABEL` in `scripts/lib/words.cjs` and `BANNED` in `scripts/verify-courses.cjs`.
- Owner-only: the current tag in `autopilot/CONSTITUTION.md` §2.1, its release dates in §3.4 and `BANNED` in `scripts/autopilot-guard.cjs`. PR #78 edited the constitution for 1050; propose such changes to the owner as the handoff's [Open for the owner](PROJECT_HANDOFF.md#open-for-the-owner) item 13 does.

## Access checks

- **api.github.com proves nothing about anonymous access here.** Requests to it from these sessions carry credentials injected by the proxy. On October 30, 2026 the private `koolkam00/pace-notes-db-backup` answered 200 there with no token in the command.
- **The anonymous test is a ranged GET of the github.com download URL, with no token:**

  ```bash
  env -u GH_TOKEN -u GITHUB_TOKEN curl -sS -L -r 0-0 -o /dev/null -w '%{http_code}\n' \
    https://github.com/<owner>/<repo>/releases/download/<tag>/<asset>
  ```

  206 (or 200) means anyone can download it; a private repository's asset answers 404. Measured on October 30, 2026 at 21:25 UTC: `pace-notes` `half-dataset-20261029-2157/csv-edition_meta.csv.zst` answered 206, and `pace-notes-db-backup` `half-snapshot-20261029-2157/half-20261029-2157.sqlite.zst.part00` answered 404.
- **A HEAD request is not a valid test.** `curl -I` answered 401 at the asset host through this proxy, even for that public asset.
- **DOIs.** A 302 from `https://doi.org/<doi>` shows that the DOI resolves. figshare's pages answer scripted clients with a 202 challenge, so they prove neither access nor absence (both measured October 30, 2026).
- **Stronger evidence** is a CI job with no token in its environment, or a signed-out browser. On October 30, 2026, the Half marathon `source` job downloaded every pinned half asset from github.com release URLs with no token (run 41126215052, on the #85 merge).
- **Record the date, time (UTC), method, URL and result.** The current result goes in the [project handoff](PROJECT_HANDOFF.md#current-state)'s Current state, and each release's result in [analysis/ACCESS.md](../analysis/ACCESS.md).

## CI workflow map

| Workflow (file) | Runs on | What it does |
| --- | --- | --- |
| Website data validation (`site-validation.yml`) | Every pull request; pushes to `main` | `verify` and `privacy-e2e` ([checks](#checks-by-change-type)). The autopilot merge gate requires both by name. |
| Autopilot guard (`autopilot-guard.yml`) | Every pull request | The guard, run from the pull request's own copy, so it gives feedback but is not a control. Branches not starting `autopilot/` pass at once. |
| Autopilot merge (`autopilot-merge.yml`) | When Website data validation completes; autopilot pull request events; every 15 minutes; manually | Gates, preview checks, merge, live checks and automatic revert ([AUTOPILOT.md](AUTOPILOT.md)) |
| Marathon pacing analysis (`pacing-analysis.yml`) | Pull requests touching `analysis/**` or the workflow; published releases (only `private-export-*` and `htw-db-*` tags pass its condition); manually with a tag | Every Python test, the FULL download, inspection, the release audit, the packs, the extended analyses and the findings, as artifacts. A tag with no reviewed policy is inspected only, then the run fails. 60 minutes. |
| Inspect complete marathon export (`inspect-full-export.yml`) | Pull requests touching the downloader, its test, `inspect_export.py` or `audit_expanded.py`; manually | Downloads FULL, inspects every table and audits linked histories; artifact `pacing-full-export-inspection` |
| Public runner explorer (`public-explorer.yml`) | Pull requests touching the explorer, lookup, pacing and policy builders, the pin or the downloader; manually | Every Python test, then a FULL download, `build_public_explorer.py` and `verify-public-explorer.cjs`; artifact `public-runner-explorer`. Its path filter also names `analysis/test_runner_lookup.py`, which does not exist. |
| Runner context and peers (`runner-context.yml`) | Pull requests touching the context builders, the pin, the runner manifest or `lib/runner-context.ts`; manually | Every Python test, then a FULL download, `build_runner_context.py` and `verify-runner-context.cjs`; artifact `runner-context` |
| All-finisher context analyses (`all-finisher-context.yml`) | Pull requests touching its builder, the runner or context data or the pin; manually | Its tests, a rebuild, and the verifier on both the published and the rebuilt file |
| Fast-start analysis (`fast-start.yml`) | Pull requests touching the fast-start builders, the runner data or the pin; manually | Both builds and both verifiers |
| Weather evidence screen (`weather-analysis.yml`) | Pull requests touching the weather and pacing builders, the policy or the weather pin; manually | Every Python test, then a FULL download and all three candidates; artifact `weather-evidence` |
| Story analyses (`insights.yml`) | Pull requests touching the story and terrain builders, `analysis/course_terrain/**`, the story, runner or context data, or the pin; manually | Tests, `verify-insights`, a CORE download, a rebuild of every family, a recount, and a byte comparison with the committed files |
| Top 100 charts (`charts.yml`) | Pull requests touching the chart builders, chart code, cards, the runner or weather data, or the pins; manually | Tests, `verify-charts`, the card check, a rebuild, a recount and a byte comparison |
| Half marathon (`half.yml`) | Pull requests and pushes to `main` touching the half files; manually | `check`: `test_half.py`, `verify-half` and the half card check. `source`: when its scope step matches, the anonymous download, a rebuild, a byte comparison and the recount with `--no-write`. |

None of the data workflows imports data, changes a pin, merges or deploys. Their artifacts expire after 7 or 30 days. The data workflows use Python 3.12. Most use Node 22; Website data validation, the autopilot workflows and Runner context and peers use Node 20.

- **A skipped or no-op job is not a pass.** When a change touches none of the pin, the policy, the builders, the downloader or the recount, the Half marathon `source` job prints "skipped: this change touches no half pin, policy, builder, downloader or recount file" and succeeds. A release run for a half tag is skipped. Before relying on a run, read its steps: `gh api repos/koolkam00/pace-notes/actions/runs/<id>/jobs --jq '.jobs[] | {name, conclusion, steps: [.steps[] | .name + ": " + .conclusion]}'`. For example, the #85 merge push ran `source` in full (run 41126215052, 20:49:16 to 20:55:33 UTC, October 30, 2026).
- **The autopilot merge gate also needs every other check run on the head commit to finish with success, neutral or skipped.** So a data workflow started by an autopilot pull request's paths counts too ([AUTOPILOT.md](AUTOPILOT.md#merge-gates)).
- **The Actions list shows more than `main` has.** It also lists "Berlin 2026 intake" and "Berlin 2026 source probe", whose files are on branch `codex/berlin-2026-intake` (draft PR #49), not on `main`.

## Agent environment notes

What these sessions found about the environment. Re-check anything that matters, because the environment changes.

- **Rules load from the checked-out commit.** Run `git fetch origin` and work in a fresh worktree of `origin/main`. A long-lived clone can be many commits behind and carry an old `AGENTS.md`.
- **GitHub CLI.** `gh pr …` and `gh issue …` use GraphQL, which these sessions refuse: "HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API" (October 30, 2026). The message also names the REST routes for review threads, auto-merge and ready-for-review. Use `gh api repos/koolkam00/pace-notes/…` (REST), `curl https://api.github.com/…`, or the GitHub MCP tools. GitHub's `search/*` endpoints answer 403 ("sessions are bound to their configured repositories"), so list through repository endpoints such as `repos/koolkam00/pace-notes/pulls?state=all` instead. In some sessions `GH_TOKEN` is invalid while git and the proxy still work; the October 29 autopilot run hit this.
- **The proxy.** Outbound HTTPS goes through an agent proxy. It adds credentials to api.github.com, and the release asset host answers HEAD with 401 ([access checks](#access-checks)). The smoke test needs `NODE_USE_ENV_PROXY=1` behind it.
- **One heavy command at a time.** This machine has 4 CPUs and 15 GB of memory, which fits one production build, `verify:data`, browser scenario run, capture run or source recount at a time. When several agents share a container, they share one lock for these.
- **Restarts.** A container restart stops background commands. On resume, read `git log`, `git status`, `git worktree list` and `git ls-remote origin <branch>` before repeating a step.
- **Downloads and scratch.** Keep downloaded data in a folder of its own, run Python that reads it with `python3 -I`, and delete large temporary files. Keep scratch files outside the checkout, where a hook may try to commit them.

## Report statuses separately

| Status | Required evidence |
| --- | --- |
| Backup saved | Immutable snapshot, timestamp, integrity and checksum |
| Export ready | Synchronized complete CORE/FULL, manifest and schema/ID audit |
| Access verified | Anonymous download of actual full-record bytes, with dated URLs/checksums |
| Analysis passed | Successful calculation and artifacts for exact tag/commit, with exclusions and methods |
| Repository updated | Validated import committed and reviewed |
| Merged | The pull request's squash commit on `main`, with its sha and merge time |
| Site updated | `https://splithappens.run/version.json` names that commit or a later one, `/data/live.json` names the expected source tag, and the [checks after a merge](#pull-requests-merging-and-deploying) pass, each with its UTC time |

Inspection artifacts retain seven days and main aggregate artifacts thirty days under the existing workflow contract. Preserve durable source files and essential audit reports with Releases; expiring CI artifacts are not a long-term specification.

## Verify access and source state

Use [analysis/README.md](../analysis/README.md) for the complete calculation and import contracts. The adopted source is the tag in `analysis/release.json` (repository `koolkam00/pace-notes`). On October 30, 2026 that is **`private-export-20261021-1050`**, prepared on October 21, 2026 and merged to `main` as PR #78 (`39f3057`) on October 22, 2026. What production serves is recorded in the [project handoff](PROJECT_HANDOFF.md). The [current refresh](REFRESH_20261021_1050.md) records source, calculation and import evidence; the [1652 refresh](REFRESH_20261016_1652.md) keeps its own. The release before it, `private-export-20261021-0829`, was verified and reviewed but **not adopted** (its FULL file lacked the producer's runner identities; [review](REFRESH_20261021_0829.md)); the [0934 refresh](REFRESH_20260912_0934.md) keeps its own; earlier feature updates have their own dated records; a prior deployment does not certify a later change.

1. Read AGENTS.md and PROJECT_HANDOFF.md; record the branch, commit, both analysis pins, relevant Releases/Actions and public `live.json.as_of` separately.
2. Fetch public repository metadata and full-record assets without a token, cookies or an account. Confirm actual bytes and checksums, not only a visible release page. The legacy word `private` in a tag is not an access control. Use the [access checks](#access-checks): a ranged GET of each github.com download URL, never api.github.com or a HEAD request.
3. Download immutable CORE and FULL from one exact tag; verify archive/member checksums, schema, units, record/feature alignment, raw counts, overlay dates and source completeness. A successful exporter is not analytical validation.
4. Keep operational credentials out of datasets and logs. Full research records are public and may be stored in or outside the checkout. Prefer durable Release assets for large files.
5. At each adoption, rewrite the top of [analysis/ACCESS.md](../analysis/ACCESS.md) for the adopted release: asset links and sizes, how to join split parts, the checksum steps and a dated anonymous-access check (since October 22, 2026 `/methodology#downloads` links to it as "how to open them"). Keep the previous release's section below as dated history.

## Reproduce and audit the current input

Run from the repository root with Python 3.12 and fresh output directories. The commands here and in the next two sections use `TAG`, which defaults to the pin's tag. For a candidate release, `export TAG=<new tag>` first ([release intake](#release-intake) step 5): the pins change only when the release is adopted (step 8). `PREV` is the input folder of the previously adopted release, downloaded the same way (1050 was audited against `htw-db-2026-10-16-1652`). `LIVE_AS_OF` is the current compatibility-metadata timestamp, read from the live site as the pacing workflow does; it is context, not the source release.

```bash
python -m pip install -r analysis/requirements.txt
TAG=${TAG:-$(python -c 'import json; print(json.load(open("analysis/release.json"))["tag"])')}
IN=/path/to/$TAG-input; CORE=/path/to/$TAG-core; WORK=/path/to/$TAG-work; PREV=/path/to/<previous tag>-input
LIVE_AS_OF=$(curl -fsS https://splithappens.run/data/live.json | python -c 'import json, sys; print(json.load(sys.stdin)["as_of"])')
python analysis/download_release.py --bundle FULL --tag "$TAG" --output "$IN"
python analysis/download_release.py --bundle CORE --tag "$TAG" --output "$CORE"
python analysis/inspect_export.py --input "$IN" --output "$WORK/inspection"
python analysis/audit_expanded.py --input "$IN" --output "$WORK/inspection"
python analysis/audit_release.py --input "$IN" --core "$CORE" --previous "$PREV" --output "$WORK/inspection/release-contract.json"
python -m unittest discover -s analysis -p 'test_*.py'
```

`download_release.py` needs no token. If `GH_TOKEN` or `GITHUB_TOKEN` is set, it is sent only to `api.github.com`, including across that host's own redirects: both pins now name the renamed repository `koolkam00/pace-notes` (the old name `koolkam00/htw-live-study` still redirects, but its API answered 403 from this container on October 16, 2026), and an anonymous redirected request can hit GitHub's shared runner rate limit. Asset downloads, and redirects to any other host, never carry the token.

`--previous` takes an earlier release's input folder and reports the raw-record delta in total, by edition and by column (1652 against 0934: 569,263 added, 116,287 deleted, 242,649 changed; 1050 against 1652: 412,943 added, 794 deleted, none changed). A `private-export-*` CORE has eight allowed members and FULL adds `features.parquet`; an `htw-db-*` CORE also carries `EDITIONS.json`, `CHANGE-REPORT.md`, `SHA256SUMS.txt` and `ID-CONTRACT.md` (12 members) and FULL adds `features.parquet` and `FEATURE-FIELD-NOTES.md` (14). A `pace-notes-*` archive (first in `private-export-20261021-0829`; the layout follows the asset name, not the tag) has the eight base files plus `EDITIONS.json`, `EDITION-CHECKSUMS.csv`, `CHANGE-REPORT.md`, `SHA256SUMS.txt`, `ID-CONTRACT.md`, `FEATURE-FIELD-NOTES.md`, `edition_meta.parquet` and `record_flags.parquet` in CORE (16) and adds `features.parquet` in FULL (17); from `private-export-20261021-1050` both also carry `MATCHING.md` (17 and 18). A release may split an archive into numbered parts (`….tar.gz.part-00`, `-01`, …, first in 1050's FULL): the downloader joins them in order, checks each part's size and digest, and then requires the joined archive's digest in the release checksum file, so a split archive without one is refused. When the release publishes a `RELEASE-SHA256SUMS*.txt` asset, the downloader verifies it too and requires the archive's digest to be listed in it. For htw-db and pace-notes releases the audit also checks every `SHA256SUMS.txt` line, compares the shared documents between CORE and FULL and reconciles `EDITIONS.json` and `races_summary.json` edition by edition. Other producer audit notes belong in separate assets. The downloader validates size/SHA-256, rejects unsafe, duplicate or unexpected members and writes provenance. Do not bypass these checks because a prior release had a different archive layout.

Review the release-specific exclusions in `analysis/source_quality.py` before calculation. The policy follows explicit producer/audit evidence for invalid, incomplete, held or selected fields. Apply it after timing eligibility, include its edition counts and hashes in each output, and exclude those editions from earlier benchmarks as well as outcomes. Do not widen exclusions based on small sample size alone or remove usable records merely because age/gender is missing.

## Calculate all owned outputs

```bash
python analysis/build_pacing.py --input "$IN" --output "$WORK/aggregates" --live-as-of "$LIVE_AS_OF"
python analysis/build_extended.py --input "$IN" --output "$WORK/aggregates" --personalized-output "$WORK/personalized" --live-as-of "$LIVE_AS_OF"
python analysis/write_findings.py --output "$WORK/aggregates"
python analysis/build_weather.py --input "$IN" --output "$WORK/weather/evidence.json"
python analysis/build_public_explorer.py --input "$IN" --output "$WORK/explorer"
```

The first two commands produce all 33 registered broad packs. `build_extended.py` caps DuckDB at 6 GB and spills the rest to `<input>/extended-temp`; under 1050 the history tables spilled past 4.9 GB of free disk at that cap, so the 1050 run set `PACE_NOTES_EXTENDED_MEMORY=10GB` on a 15 GB machine (results do not depend on the cap). Keep the downloaded `full.tar.gz` beside the extracted files: `build_runner_context.py` re-hashes it and every member it reads. `build_extended.py` also invokes the twelve-path personalized engine, retaining whole-minute targets 90–720. The weather screen is separate: rerun all three fixed candidates with the existing thresholds, retain every decision in its JSON, and let readiness determine which pages exist. A refresh must not freeze old conclusions or loosen the gate to publish a preferred result.

The main workflow produces `pacing-aggregate-packs`, `pacing-personalized-aggregates` and `pacing-export-inspection` for an exact source tag and code commit. The separate weather workflow produces `weather-evidence`; **Public runner explorer** produces `public-runner-explorer` (study plus name-search shards). None of these workflows imports data or deploys the site. Inspect source tag, code revision, successful checks and artifacts; do not infer success from release publication. The historical September 10 failed run is not the status of any later calculation.

Until October 15, 2026, the main pacing workflow (`pacing-analysis.yml`) and the full-export inspection (`inspect-full-export.yml`) ran only when the repository was named `koolkam00/htw-live-study`. After the rename to `koolkam00/pace-notes` both were silently skipped on every pull request, and would have been on a new `private-export-*` release. The last successful pacing run was [35252504876](https://github.com/koolkam00/pace-notes/actions/runs/35252504876) on September 17 and the last successful inspection [34560014278](https://github.com/koolkam00/pace-notes/actions/runs/34560014278) on September 11. Both now check `koolkam00/pace-notes`, the same condition the Autopilot merge workflow uses. A skipped job is not a passing calculation: confirm the job actually ran before relying on its artifacts. Since October 16, 2026 a published `htw-db-*` release triggers it as well as a `private-export-*` one (the weather workflow accepts both tag forms too). Because a new release now triggers the pacing workflow again, a tag without a reviewed edition policy in `analysis/source_quality.py` (`REVIEWED_POLICIES`) is downloaded and inspected only: the workflow uploads `pacing-export-inspection`, calculates nothing, and fails with a message saying the policy and audit must be added first. Otherwise an unreviewed export would be calculated with no exclusions.

Runner context has an additional dependency on the exact imported runner manifest; follow the [dedicated sequence below](#runner-context-refresh) after importing the supporting study and lookup.

## Validate, import and publish

ZIP each output's contents with the registered pack folder at archive root. The broad archive must have all 33 registry entries; the personalized archive must have only `ext_personalized_guide`. Validate both before replacing their owned public folders. `--expected-export` takes the packs' `input_export_id`, which `build_pacing.py` makes from the tag by changing `private-export-` to `private-` (`private-20261021-1050` for 1050; an `htw-db-*` tag stays as it is):

```bash
EXPORT_ID=${TAG/private-export-/private-}
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export "$EXPORT_ID" --check-only
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export "$EXPORT_ID" --check-only
python analysis/import_packs.py --archive /path/to/pacing-aggregate-packs.zip --expected-export "$EXPORT_ID"
python analysis/import_personalized.py --archive /path/to/pacing-personalized-aggregates.zip --expected-export "$EXPORT_ID"
npm ci
python analysis/import_public_explorer.py --input "$WORK/explorer"
python analysis/build_runner_context.py --input "$IN" --output "$WORK/runner-context"
python analysis/import_runner_context.py --input "$WORK/runner-context"
npm run verify:data
npm run build
```

Review and copy the weather JSON to `public/data/weather/evidence.json` with its exact `analysis/weather-release.json` pin. Both pins hold only `repository` and `tag`; at adoption, set `tag` in both to the audited tag ([release intake](#release-intake) step 8). The weather file is outside the two ZIP importer contracts. Verify source/script/policy hashes, raw-to-eligible and weather-cohort reconciliation, all candidate gates, dynamic routes, exact source labels and display units. For the current audited release, `calculation_provenance.py` requires the exact reviewed builder and supporting-script hashes before either import; a valid-looking 64-character hash is insufficient. Website data validation repeats these checks on PRs and main. Review the full diff before committing or merging. Verify the deployed source tags and exact commit separately after publication.

Every active analysis must now use the same adopted release. The supporting-study and runner importer replaces only `public/data/study`, `public/data/runners` and current `live.json` compatibility metadata. It validates every shard, every record and every eligible timing that the runner manifest counts (`raw_records` and `eligible_records` in `public/data/runners/manifest.json`: 5,327,504 and 4,108,749 under 1050), name-index membership and calculation/source hashes before import. Historical S/R/RN/P numerical files remain in Git history, outside deployed output. The source pin alone never certifies a refresh.

Forecast and validated course-adjustment outputs remain explicitly unavailable where the current inputs cannot support them. Historical outputs remain recoverable in Git history and are never relabeled as fresh. Weather publication follows the existing evidence rule. A previously published candidate can become withheld and vice versa; all three results remain in the downloadable audit. See [weather methods and decisions](WEATHER_ANALYSES.md).

## Runner context refresh

The context builder uses `analysis/release.json` and requires the verified FULL directory containing `full.tar.gz`, `MANIFEST.json`, `provenance.json` and extracted inputs. It checks the source against the existing runner lookup. It explicitly supports the audited 1107, 0934, 1652 and 1050 policies; adopting a future tag requires reviewing the source/edition policy, rebuilding the lookup and updating the release-gated contracts together.

Install Python requirements and Node dependencies first. Refresh and import the runner lookup before this sequence when its source or calculation changes. Use a fresh output directory:

```bash
python analysis/build_runner_context.py --input "$IN" --output "$WORK/runner-context" --runners public/data/runners
python analysis/import_runner_context.py --input "$WORK/runner-context" --check-only
python analysis/import_runner_context.py --input "$WORK/runner-context"
npm run verify:data
npm run build
```

A change to `build_weather.py` or `runner_environment.py` (the start-hour check) requires rebuilding, in order: the weather screen; runner context (build, `--check-only`, import); the all-finisher context; then the stories and tool data with course geometry, the terrain splits (`build_course_terrain.py`, which binds the runner-context manifest) and their manifest, each with its verifier. The packs, the supporting study, the runner lookup and fast start read neither ([October 22, 2026 example](evidence/2026-10-22/chicago-2025-weather/pipeline.sh)).

`--runners` defaults to the repository's `public/data/runners`. The importer invokes the full Node verifier before any replacement. It stages only `manifest.json` and the listed edition shards, then replaces only `public/data/runner-context`, restoring the prior directory if the swap fails. Its optional `--output` is the **parent** public-data directory, not the runner-context folder; validation still binds to this repository's runner manifest. No other data folder or release pin is modified.

For a standalone calculation audit, run `node scripts/verify-runner-context.cjs --data-root "$WORK/runner-context"`. It verifies every context shard, all group/CDF counts against the published eligible runner records, and 16 independently recomputed pacing-quartile samples. `npm run verify:data` also includes the context client and UI checks. A same-tag lookup rebuild changes its manifest hash/timestamp and invalidates older context; rebuild rather than relabeling the context manifest.

The [Runner context and peers workflow](../.github/workflows/runner-context.yml) runs on relevant pull-request paths or manual dispatch. It downloads the pinned FULL, calculates against the checked-in runner manifest, runs the independent verifier and uploads **`runner-context`** for 30 days. It does not import, change the pin, merge or deploy. Download/extract the artifact into an input directory for the importer, inspect the exact source/code revision, and preserve durable verification evidence before CI artifacts expire. Check pending/local/publication status in [RUNNER_CONTEXT_AND_PEERS.md](RUNNER_CONTEXT_AND_PEERS.md).

## All-finisher context refresh

After refreshing and verifying both lookup and environmental context, build the additive context file against those exact manifests:

```bash
python -m unittest discover -s analysis -p 'test_all_finisher_context.py'
python analysis/build_all_finisher_context.py --output /path/to/all-finisher-context/evidence.json
node scripts/verify-all-finisher-context.cjs --input /path/to/all-finisher-context/evidence.json
cp /path/to/all-finisher-context/evidence.json public/data/all-finisher-context/evidence.json
npm run verify:data
npm run build
```

The dedicated `all-finisher-context.yml` workflow recalculates and independently verifies without importing or deploying. Existing source and aggregate files remain unchanged when adding these views; source refreshes require rebuilding dependent context instead of relabeling hashes. Record local, CI and production evidence separately in [ALL_FINISHER_ANALYSES.md](ALL_FINISHER_ANALYSES.md).

## Fast-start analysis refresh

After any runner-lookup refresh, recalculate **both** independent fast-start outputs from those exact published shards. This reuses the reviewed input pin and does not download or modify the ingestion database. The default all-finisher mode must include every eligible record once; history must additionally reconcile the strictly-earlier-two-year benchmark count. Both verify all source shards, raw/eligible counts, source calculation hashes and the exact runner-manifest hash. Adding the all-finisher mode without a lookup refresh preserves the existing history output byte for byte.

```bash
python -m unittest discover -s analysis -p 'test_fast_start.py'
python analysis/build_fast_start.py --runners public/data/runners --output /path/to/fast-start/evidence.json
node scripts/verify-fast-start.cjs --input /path/to/fast-start/evidence.json
python -m unittest discover -s analysis -p 'test_fast_start_all.py'
python analysis/build_fast_start_all.py --runners public/data/runners --output /path/to/fast-start/all-finishers.json
node scripts/verify-fast-start-all.cjs --input /path/to/fast-start/all-finishers.json
cp /path/to/fast-start/evidence.json public/data/fast-start/evidence.json
cp /path/to/fast-start/all-finishers.json public/data/fast-start/all-finishers.json
npm run verify:data
npm run build
```

The history verifier checks every cell's count, edition coverage and onset, then independently recomputes every numeric metric for the complete unfiltered cohort and five filtered cohorts. The separate all-finisher verifier covers its full eligible population, exact opening boundaries, published and sparse-cell counts, onset denominators and new time outcomes. Preserve evidence of each verifier's actual checks; passing one mode does not validate the other. Each view uses its selected opening group except its clearly labeled cross-group time-distribution chart. Source pins, lookup hashes and calculation hashes cannot be relabeled to avoid rebuilding. The dedicated [workflow](../.github/workflows/fast-start.yml) recalculates and verifies evidence artifacts; it does not import or deploy. Record CI and anonymous production-payload checks separately. See [definitions and evidence](FAST_START_ANALYSIS.md).

## Data story refresh

Rebuild the stories after the runner or runner-context manifests change. The terrain splits bind the runner-context manifest (its bytes and `input_as_of`) and the release tag, so they are rebuilt in the same pass, before the manifest step:

```bash
python -m unittest discover -s analysis -p 'test_insights.py'
python analysis/build_insights.py
python analysis/build_course_geometry.py --profiles <CORE export>/course_profiles.parquet
python analysis/build_course_terrain.py --profiles <CORE export>/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json
python analysis/build_insights.py --only manifest
node scripts/verify-insights.cjs
```

The **Story analyses** workflow repeats the build into a temporary directory and requires byte-identical family files. See [data stories](STORIES.md).

When the release changes, build into a fresh empty folder (`--output <dir>`), run the geometry, terrain-splits (`--output <dir>/tools/course-terrain.json`) and `--only manifest` steps against it, verify it with `node scripts/verify-insights.cjs --input <dir>`, and only then replace `public/data/insights` with it: the verifier's inventory check fails on leftover replay or tool shards from the previous release (1652: Boston's and Chicago's replay editions moved to 2014 and 2026, and Melbourne left the course data). `--only` keeps only files listed in the output folder's existing manifest, so it cannot finish a partly built fresh folder; rebuild it whole (about 15 minutes for 1652). Producer follow-ups found by the 1652 refresh are listed in its [record](REFRESH_20261016_1652.md#open-for-the-owner-and-the-producer).

## Terrain splits refresh

The planner's and the pace band's terrain splits (`tools/course-terrain.json`, owner decision of October 23, 2026) are built from the adopted release's `course_profiles.parquet` and the audited correction registry, never from finishes:

```bash
python -m unittest discover -s analysis -p 'test_course_terrain.py'   # COURSE_PROFILES=<release>/course_profiles.parquet runs the release checks too
python analysis/build_course_terrain.py --profiles <release>/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json
python analysis/build_insights.py --only manifest
node scripts/verify-insights.cjs
node scripts/verify-tools.cjs
```

Rebuild whenever the runner-context manifest changes (its bytes, its `input_as_of` or its `course_profiles.parquet` hash; `verify-insights` binds all three), whenever the adopted release in `analysis/release.json` changes, and whenever `analysis/course_terrain/corrections.json` changes (bump its `version`); the [story refresh](#data-story-refresh) above runs it. On a new parquet hash the builder refuses until the registry's `input.sha256` and every correction's anchors are re-based on the new file; it also refuses a terrain course of class c, without `sources` or with a `why`, a smoothed grade above 8%, a feature outside its correction and a slug the pace band does not publish. The **Story analyses** workflow rebuilds the file after the release download and requires the committed bytes.

Clearing another course for terrain splits: add its cited corrections and `sources` to the registry, run the provenance scripts in `analysis/course_terrain/provenance/` (network; never in CI), re-run the steady-finisher check from `analysis/course_terrain/validation-2026-10-23/` on the adopted release, set `band: "terrain"`, add its deck guards to `checkCourseTerrain` in `scripts/verify-insights.cjs` (each window over the water alone, so the uncorrected supplied profile fails it; `test_course_terrain.py` checks that with `COURSE_PROFILES` set), rebuild, re-pin `scripts/verify-tools.cjs` and record the date and the evidence in [tools](TOOLS.md#terrain-splits-owner-decision-october-23-2026).

## Top 100 charts refresh

The charts bind the runner manifest, the weather evidence, the catalog and every chart script by hash, so rebuild them after any of those change (a new release, a weather refresh, an edit to `analysis/build_charts.py`, `analysis/charts_common.py` or an `analysis/charts_*.py` module):

```bash
python -m unittest discover -s analysis -p 'test_charts.py'
python analysis/build_charts.py --output public/data/charts
node scripts/verify-charts.cjs
node scripts/build-chart-cards.cjs              # redraws the cards whose stamp changed (needs Chromium)
node scripts/build-chart-cards.cjs --captions   # docs/CHARTS_INSTAGRAM.md
npm run verify:data && npm run build
```

Read every headline that changed before publishing: a chart whose guard no longer holds shows its neutral fallback. The **Top 100 charts** workflow rebuilds the charts in CI and requires the committed bytes. See [Top 100 charts](TOP_100_CHARTS.md).

## Half refresh

The half aggregates (`public/data/half/`, [half marathons](HALF_MARATHON.md)) come from the owner's public CC BY 4.0 releases in `koolkam00/pace-notes`: the snapshot and the link build from `half-dataset-20261029-1202` and the corrected edition metadata from `half-dataset-20261029-2157`, all pinned in `analysis/half-release.json`. The downloaded files live outside the checkout, in `PACE_HALF_DIR` (default `~/data/half-1133`); nothing below writes a half record into the repository or `public/`. Run the Python with `python3 -I`; DuckDB uses `PACE_HALF_DUCKDB_THREADS` (default 2), `PACE_HALF_DUCKDB_MEMORY` (default 4GB) and spills to `TMPDIR`, leaving no temp file behind.

```bash
export PACE_HALF_DIR=~/data/half-1133
# 1. The sources, anonymously (github.com release URLs, no token, never api.github.com). Each release's SHA256SUMS
#    must list every pinned asset with its pinned digest; platform_half.sqlite is reassembled (integrity check, sha
#    against the pin), links-slim.sqlite is cut from the 5.3 GB links SQLite (put it on a larger disk with
#    --links-work DIR; it is deleted afterwards) and the corrected metadata lands in $PACE_HALF_DIR/<its tag>/.
#    About 10 GB of free disk at the peak.
python3 -I analysis/download_half.py [--links-work DIR] [--only half|links|correction]
#    Folders already filled from the releases (gh release download <tag> -R koolkam00/pace-notes, or curl), with their
#    SHA256SUMS: python3 -I analysis/download_half.py --from-dir <folder> [--from-dir <folder>]
#    Links that come as parquet tables instead: python3 -I analysis/half_links_extract.py --links-parquet <dir>
# 2. Tests, build and the local source recount (writes the receipt docs/evidence/half/source-recount.json):
python3 -I -m unittest discover -s analysis -p 'test_half.py'    # PACE_HALF_SOURCE_TESTS=1 also recomputes the frozen lists and stamps
python3 -I analysis/build_half.py                                 # --half/--links/--corrected-meta default to $PACE_HALF_DIR; about 2 min
npm run verify:half-source                                        # the same defaults; about 90 s and 1 GB
# 3. The checks, the cards and the site:
node scripts/verify-half.cjs
node scripts/build-chart-cards.cjs --set half                     # redraws the half cards whose stamp changed and removes withdrawn ones (needs Chromium)
node scripts/build-chart-cards.cjs --captions                     # docs/CHARTS_INSTAGRAM.md, both sections
npm run verify:data && npm run build
node scripts/verify-half.cjs --html
```

Then capture and read every half surface (`/half`, `/stories/half-to-full`, the predictor with a half typed and each sex chip, the five marathon goal pages, the half pace chart, the `/methodology` half folds and downloads, each card image) at 390 and 1440 px in light and dark before committing the data, the receipt and the cards together. A moved number can turn a guard: read which readings fell back and which cards were withdrawn, re-judge each guard on its merits and record why in [half marathons](HALF_MARATHON.md#what-is-published); never loosen one to keep a headline. For each fallen guard, check every slot that can carry its reading: the heading, the dek, the hero figure and its key, captions, table reading rows, the card, the chapter rows on `/` and `/research`, next cards, the `/half` night card and the `/methodology` sentence about it. A builder floor that fails leaves its figure (and its beat) out; it is never lowered.

**When:** after a new half snapshot, link build or corrected metadata; after any change to `analysis/release.json` or the runner manifest (`lib/half-server.ts` throws at build until the half data is rebuilt, and a new marathon release also needs a new link build from the producer); after a change to `analysis/weather-release.json` or the weather evidence; after a change to the cited `insights/finish-times.json` or `charts/womens-share-by-finish-time.json`; after any change to `analysis/half_*.py`, `analysis/build_half.py` or the policy. A change to `scripts/verify-half-source.cjs` or `scripts/half/{derive,policy,marathon,families}.cjs` needs only `npm run verify:half-source` and the new receipt. `verify-half` fails on a stale receipt, so never commit a rebuild without its recount.

**CI.** The **Half marathon** workflow's `check` job runs the tests, `verify-half` and the card check on every change to the half files. Its `source` job repeats steps 1 and 2 anonymously from the public releases (download, rebuild into the runner's temp folder, byte comparison with `public/data/half/`, recount with `--no-write`) on `workflow_dispatch` and on pushes to `main` and pull requests that touch the pin, the policy JSON, a builder, the anonymous downloader (`analysis/download_half.py`) or `analysis/requirements.txt`, the recount or the workflow; otherwise it prints "skipped: this change touches no half pin, policy, builder, downloader or recount file". Before relying on a change to its steps, run them on a machine first (October 30, 2026: the first local run found the links SQLite's untyped columns, fixed in `half_links_extract.py`). The push that merged #85 ran the job in full from the public assets (run 41126215052, October 30, 2026, 20:49 to 20:55 UTC).

**A new snapshot or link build:** pin the new tags, asset sums and `sqlite_sha256` (and `private_tag` when the snapshot or link build has its own identity) in `analysis/half-release.json`; cut the extract with `--pin` (it writes `extract_content_sha256`); add a reviewed entry to `REVIEWED_HALF_POLICIES` in `analysis/half_quality.py`, keyed by the new snapshot tag, print the recomputed lists with `python3 -I analysis/half_quality.py --discover --half <snapshot>` (local only; never commit its output), review every one (R3, R4 and E2–E8), freeze the entry with `--write-policy` under a new policy file name, point the pin's `policy` at it and confirm it with `--check --half <snapshot> --corrected-meta <file>`; build with `--accept-counts` only after reading every count change it prints, then set the reviewed `EXPECTED` counts from that run; rerun the source recount; check every new asset URL anonymously with a ranged GET and date it; rewrite the dated evidence and the owner questions in [half marathons](HALF_MARATHON.md).

**New corrected metadata for the snapshot already pinned** (the case of `half-dataset-20261029-2157`): the snapshot's entry in `REVIEWED_HALF_POLICIES` holds one `correction` and the pin one `metadata_correction`, so the newer file replaces the older one, and "verified" stays "stamped in both" the snapshot and the newest correction. Pin it in `metadata_correction` (`tag`, `asset`, `sha256`, `readme_sha256`, `applied`); add a `CORRECTION_<stamp>` block to `analysis/half_quality.py` and its withdrawn and weaker-source stamps to `analysis/half_policy_lists.py`, each list reviewed against the file; repoint that entry's `correction`, `corrected` date and `expected` counts; check that the edition ids join (count the ids whose city or year differ; [release intake](#release-intake) step 4); rewrite the same policy file with `--write-policy` (its name follows the snapshot, so the pin's `policy` is unchanged) and confirm it with `--check`; then build, recount and record as above, and update the docstrings that name the correction (`analysis/build_half.py`, `analysis/download_half.py`).

## Producer operations and missing information

The live producer database, scheduled ingestion, retries and recovery scripts are external to this checkout. A consistent SQLite snapshot is made through SQLite's backup mechanism or an equivalent supported snapshot; do not blindly copy a changing database or replace ingestion with a downloaded backup. Publish checksummed full-record snapshots with anonymous opening instructions. Public snapshot access does not require exposing the live service or its credentials.

The open producer requests are listed once, in the project handoff's [remaining producer work](PROJECT_HANDOFF.md#remaining-producer-work), with each release's own list in its refresh record. See also [KNOWN_ISSUES.md](KNOWN_ISSUES.md) and [the September 10 producer request](history/INGESTION_HANDOFF_20260910.md). Never infer missing values to make a cohort larger.
