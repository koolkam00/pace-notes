# The autopilot repair: earlier text (to November 9, 2026)

> Moved here word for word on November 10, 2026 from the files named in each heading at `main`'s commit `068b6c37`, when the autopilot repair of November 9, 2026 (branch `claude/site-review-autopilot-fix`, pull request #92) rewrote those lines. The line numbers are that commit's. Every line the repair replaced or removed is here; two passages are kept whole, unchanged lines included, so that they read as they stood, and their headings say so. Lines that stood inside a code block are shown in one. Branch, merge and deploy states are as they were written; the current state is in the [project handoff](../PROJECT_HANDOFF.md#current-state). Relative links are re-pointed for this folder.

## Autopilot skill: the PostHog and Vercel tool lines (`.claude/skills/pace-notes-autopilot/SKILL.md`, lines 23 and 27)

- **PostHog:** `mcp__PostHog__exec`, project 614669 "Pace Notes". Run `info <tool>` before the first `call` of each tool. Typical calls:

- **Vercel:** the `mcp__Vercel__*` tools, project `prj_nWED6tB51by87n3Xdhjvk8G4mHYR`, team `team_ltDKovHYx4pftBtChGJNjYuY`. Some reads may be refused by the permission classifier; if so, use `https://splithappens.run/version.json` and the GitHub deployment statuses instead.

## Autopilot skill: bootstrap, steps 1, 2 and 5 (`.claude/skills/pace-notes-autopilot/SKILL.md`, lines 37–38 and 41)

1. Run `add_repo` (koolkam00/pace-notes, access "push"), run the clone command it returns into `/home/user/pace-notes`, then run `register_repo_root`.
2. `cd /home/user/pace-notes && npm ci`.

5. If `add_repo`, `register_repo_root`, or the GitHub or PostHog tools are missing, the run cannot check the pause label, read PostHog or push. Make no change: send the owner a push notification naming what is missing and how to add it, then stop. (The run of 2026-10-29 was blocked this way; the prerequisites are in `docs/AUTOPILOT.md`, "Setup and prerequisites".)

## Autopilot skill: observe, the scorecard step and its device split (`.claude/skills/pace-notes-autopilot/SKILL.md`, lines 71 and 76)

1. **Scorecard.** Run every query in `autopilot/metrics.md` §2 for each window:

   Split by phone versus desktop where the query allows. Note the sample size with every number.

## Autopilot skill: observe, the segments that matter (`.claude/skills/pace-notes-autopilot/SKILL.md`, lines 99–102 and 104)

7. **Segments that matter here** (the 2026-10-14 diagnosis, about 510 visits in 30 days; a 2026-10-22 survey of 2026-09-17..10-22 found 76% of sessions on phones and 79% landing on `/`; this run's scorecard is the current figure):
   - 78% of visits are on phones, many in Instagram's in-app browser;
   - 83% land on the home page;
   - most traffic is direct or from Instagram.

   Design for a phone held in one hand, arriving from an Instagram post.

## Autopilot skill: the principle "Be bold, not random" (`.claude/skills/pace-notes-autopilot/SKILL.md`, line 147)

- **Be bold, not random.** At about 18 visits a day (the 2026-10-14 diagnosis), only effects of roughly 30% relative or more can be detected. Prefer changes that could plausibly move the answered-visit rate a lot: entry points, the first screen, clarity, speed, removing friction, making the personal "how do runners like me pace?" path obvious. Avoid tiny tweaks, and don't stack many unrelated edits.

## Autopilot skill: pre-registration, the entry's metric, guardrails, baseline, window and decision rule (`.claude/skills/pace-notes-autopilot/SKILL.md`, lines 164–166 and 168–169)

   - the primary metric: a name copied exactly from the table in `autopilot/metrics.md` §1, version included (normally `answered_visit_rate@v1`, or the page-level metric that matches). The guard refuses any other name;
   - the guardrails: at least one name, again copied exactly from §1 (a `fix`, `revert` or `conclude` entry may have none). If no defined metric fits, don't invent a name: open an `autopilot:needs-owner` issue that proposes one. An experiment's readout (`autopilot/metrics.md` §3) computes the answered-visit, one-page-no-action and error-visit rates by variant, so use those for an experiment;
   - the baseline, measured from the scorecard before you write the entry: for a `change` or `experiment`, `window` (`"YYYY-MM-DD..YYYY-MM-DD"`, 7 to 56 whole UTC days ending on or before the entry's date), `visits` (or `n`), the visits in that window, and the numbers behind the primary metric, such as `answered`. A `fix`, `revert` or `conclude` may record any object, such as `{"note": "…"}`;

   - for a `change`, `window_days`: 14 or 28, the full days in each before/after window;
   - the decision rule, in plain words (never blank either);

## Autopilot skill: ship, step 4 (`.claude/skills/pace-notes-autopilot/SKILL.md`, line 205)

4. When CI is green on the latest commit and steps 5.4 and 5.5 are done, with every real finding fixed, mark the PR ready for review. The "Autopilot merge" workflow then merges it once every gate passes, at least 15 minutes after it is ready. It smoke-tests the Vercel preview first, then deploys and checks the live site. If the live checks fail, it reverts automatically and opens an incident.

## Autopilot skill: the report's scorecard line (`.claude/skills/pace-notes-autopilot/SKILL.md`, line 225)

```
**Scorecard** (28 days vs the 28 before; n = visits): answered-visit rate X% (n) vs Y% (n) · one-page-no-action X% · error visits X% · phone LCP p75 X s · CLS p75 X · no-match searches X%
```

## Autopilot metrics: the scorecard's all-device note and the home depth label (`autopilot/metrics.md`, lines 87 and 113)

The `ROLLUP` row whose `device` is null is the all-device total.

**Home depth** (landings on `/`):

## Autopilot metrics: the ledger example and the `primary_metric` row (`autopilot/metrics.md`, lines 208, 211 and 222)

Each entry is a single line; the example below is one line too (scroll sideways):

```json
{"id":"2026-10-19-home-doors","date":"2026-10-19","kind":"change","title":"Three doors under the home hero","pages":["/"],"hypothesis":"Phone visitors who land on the home page find a personal path sooner when the first screen offers one.","primary_metric":"answered_visit_rate@v1","guardrails":["one_page_no_action_rate@v1","error_visit_rate@v1","web_vitals_p75@v1"],"baseline":{"window":"2026-09-21..2026-10-18","answered":120,"visits":548},"min_sample":150,"window_days":14,"max_days":null,"decision_rule":"Keep if not worse (P(worse) < 0.9) and guardrails hold; revert if P(worse) >= 0.9 or a guardrail breaks.","evaluate_after":"2026-11-03","status":"proposed","pr":null,"shipped_on":null,"verdict":null,"result":null}
```

| `primary_metric` | one name from the §1 table, exactly, version included (`answered_visit_rate@v1`) | same | same |

## Autopilot: the schedule rows of "What runs when" and the timer note (`docs/AUTOPILOT.md`, lines 13–14 and 18)

| **Pace Notes autopilot** (Claude session) | Mondays and Thursdays at 7:56 a.m. US Eastern | A scheduled task in Claude. It reads PostHog, writes a run note on the "Autopilot log" issue, and opens at most one pull request. It is told never to merge; see [What the machinery cannot stop](../AUTOPILOT.md#what-the-machinery-cannot-stop). |
| **Autopilot merge** workflow | Every 15 minutes, whenever "Website data validation" finishes, and when an autopilot pull request is labelled, unlabelled, marked ready, reopened or gets new commits | `.github/workflows/autopilot-merge.yml`, always from `main` |

GitHub can start scheduled workflows a few minutes late, and turns them off after 60 days without any activity in the repository.

## Autopilot: the merge workflow's gate job (`docs/AUTOPILOT.md`, line 22)

1. **gate** checks every gate below and picks at most one pull request;

## Autopilot: the gate "Ready long enough" (`docs/AUTOPILOT.md`, line 63)

| Ready long enough | At least 15 minutes since the later of: the pull request being marked ready (or opened, if it was opened ready), and the head commit arriving (the first check suite GitHub created for it; commit dates are not used, since anyone can set them). |

## Autopilot: how to stop it, steps 1 and 4 (`docs/AUTOPILOT.md`, lines 126 and 129)

1. **Add the label `autopilot:paused` to any open issue**, for example the "Autopilot log" issue. Merges stop within 15 minutes, and the scheduled session sees the label and skips its run. The label is checked again just before merging, so it also stops a run that is already under way. Remove the label, or close the issue, to resume. (Cancelling a run of the workflow before its merge step also stops that one merge.)

4. **Turn off the "Pace Notes autopilot" scheduled task in Claude.** No new sessions run.

## Autopilot: what the machinery cannot stop, a merge by anyone but the workflow (`docs/AUTOPILOT.md`, line 158)

- an autopilot pull request merged by anyone but the workflow is noticed within 15 minutes and opens a paused incident, so nothing else merges until you have looked;

## Autopilot: setup and prerequisites, as checked on October 30, 2026 (`docs/AUTOPILOT.md`, lines 165–175, the whole list)

Checked on October 30, 2026. A scheduled run can only work when all of these hold:

1. **The scheduled task exists and is enabled.** "Pace Notes autopilot" is a scheduled task in Claude, created on October 15, 2026, with the schedule `CRON_TZ=America/New_York 56 7 * * 1,4` (Mondays and Thursdays at 7:56 a.m. US Eastern). Its prompt has the session attach the repository, read `AGENTS.md`, the constitution and the skill, follow the skill from step 0 to step 7, never merge, and post on the log issue even when the run is skipped, blocked or failed.
2. **The session can attach the repository with push access.** It needs the `add_repo` (owner `koolkam00`, repo `pace-notes`, access `push`) and `register_repo_root` tools, and the repository must be in the task's authorized set. Without them the git proxy refuses the repository (403) and nothing can be pushed.
3. **The connectors are attached to the task.** It needs the GitHub tools (issues, labels, pull requests) and PostHog (project 614669). On October 30, 2026 the task stored no connectors.
4. **The labels exist.** On October 30, 2026 only `autopilot-log` and `autopilot:paused` did. The session must add `autopilot` to its pull request, and the gates read `autopilot:needs-owner` and `do-not-merge`, so create those three (and `autopilot-incident`) as in [optional hardening](../AUTOPILOT.md#optional-hardening-owner-steps). The open "Autopilot log" issue is #59, labelled `autopilot-log`.
5. **A browser for the smoke test.** The skill's step 0 uses Playwright's Chromium from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` when it is there, and otherwise installs it.
6. **The owner lifts the pause.** `autopilot:paused` has been on #59 since 2026-10-15T21:28:44Z, set while the StoryBrand redesign was built. Before removing it, the owner:
   - decides whether the metrics need `@v2` definitions. The answer signal "at least 3 distinct home chapters" counts `chapter-*` sections, and the home page has sent none since the StoryBrand home (`b7a675c`, #65; see `TRACKED_SECTIONS` in `lib/analytics-policy.ts`). That signal feeds `answered_visit_rate@v1` (the north star), `one_page_no_action_rate@v1` and `home_continuation_rate@v1`, and `home_depth@v1` counts the sections directly, so a before/after window across that change mixes two definitions. Only the owner edits `autopilot/metrics.md`. This has been open since October 16, 2026 ([record](handoff-2026-10-14-to-17.md#storybrand-series-what-is-live-and-what-is-open-october-16-2026));
   - adds `report` to PostHog's recording URL blocklist (the site already never records `/report`; same record);
   - fixes items 2 to 4.

## Autopilot: optional hardening, creating the labels (`docs/AUTOPILOT.md`, line 185)

- **Create the labels** `autopilot`, `autopilot:paused`, `autopilot:needs-owner`, `autopilot-incident`, `autopilot-log` (the session finds the "Autopilot log" issue by it) and `do-not-merge` ahead of time (the workflow creates the incident and pause labels itself if they are missing).

## Autopilot: tools, the dry-run row (`docs/AUTOPILOT.md`, line 199)

| `node scripts/autopilot-merge.cjs evaluate --dry-run [--pr <n>]` | The merge gate's view of open autopilot pull requests (or of one pull request), writing nothing. Without `GITHUB_TOKEN` it reads the public API anonymously and cannot read review threads. `reconcile --dry-run` lists autopilot merges without a live-check record. |

## Operations runbook: the Autopilot merge row of the workflow table (`docs/OPERATIONS.md`, line 199)

| Autopilot merge (`autopilot-merge.yml`) | When Website data validation completes; autopilot pull request events; every 15 minutes; manually | Gates, preview checks, merge, live checks and automatic revert ([AUTOPILOT.md](../AUTOPILOT.md)) |

## Project handoff: Current state, as checked on November 5, 2026 at 19:00 UTC (`docs/PROJECT_HANDOFF.md`, lines 7–22, the whole block)

**Checked 2026-11-05, 19:00 UTC**, after #90 merged. Keep four facts apart: release notes, measured results, repository state and deployed state. Never write "live" for anything without reading `/version.json` again. After a merge that changes a page, data, a contract or a workflow, replace this block, with its date, in the next pull request ([AGENTS.md](../../AGENTS.md) rule 19). The block checked at 13:20 UTC, after #89 merged, is in [history](handoff-2026-11-05-current-state-before-person-id.md).

| Fact | Value | How it was checked |
| --- | --- | --- |
| `main` | `3bc2b26e`, "Label each half-to-marathon pair a comparison between distances; record the owner's producer answers (#90)" | `git ls-remote origin refs/heads/main` (16:15 UTC) |
| Production | `3bc2b26e`, built 2026-11-05T14:58:29Z | `curl -s https://splithappens.run/version.json` (16:15 UTC) |
| Production data | `release_tag` `master-20261103b` (`as_of` 2026-11-04T14:30:12Z), 4,222,246 eligible finishes; the marathon still keyed by the v1 `runner_id` | `curl -s https://splithappens.run/data/live.json` |
| Releases | unchanged from the [13:20 block](handoff-2026-11-05-current-state-before-person-id.md) | not re-read |
| Open pull requests | the person_id identity (`feat/person-id-identity`, draft, this branch), #77, #49, #29 | GitHub |
| Autopilot | Paused (issue #59) | not re-read |

- **The marathon's cross-race identity on `person_id`** (owner, 2026-11-05: "Everywhere (Recommended)" and, for New York 2026, "Use them, labelled"): on `feat/person-id-identity`, not merged. Every history-based output is rebuilt on the producer's `person_id` (adapter version 2); New York 2026's preliminary links are used and marked "Preliminary link" in the runner search. Profiles 4,257,513 → 3,631,904, earlier-year benchmarks 662,539 → 986,580, three Top 100 guards re-judged ([refresh record](../REFRESH_20261103b.md#marathon-identity-person_id-november-5-2026)).
- **The marathon on `master-20261103b`**: live since #89 ([refresh record](../REFRESH_20261103b.md)); 4,222,246 eligible finishes in 218 editions, 1,298,524 sustained slowdowns (30.75%), unchanged by the identity switch.
- **The half on the person IDs v4**: live on `half-dataset-20261030-1904`, bound to `master-20261103b`; the v4 extract and set B (58,597 pairs) are unchanged by the marathon identity switch ([half marathons](../HALF_MARATHON.md)).
- **The half-to-marathon pair label** (owner, November 5): live since #90.
- **Anonymous access** (2026-11-05, 06:20 UTC): every asset of `master-20261103b` and `dataset-20261103-0706` answered a no-token ranged GET with 206 ([analysis/ACCESS.md](../../analysis/ACCESS.md)).

## Project handoff: owner item 1, Autopilot (`docs/PROJECT_HANDOFF.md`, line 26)

1. **Autopilot.** Before removing `autopilot:paused` from issue #59: give the scheduled task the repository `koolkam00/pace-notes` with push access and the GitHub and PostHog connectors (the 2026-10-29 run, [October 30 block](handoff-2026-10-30-to-11-04-current-state.md)); add @v2 definitions to `autopilot/metrics.md`, because `answered_visit_rate@v1` (the north star), `one_page_no_action_rate@v1`, `home_continuation_rate@v1` and `home_depth@v1` count `chapter-*` sections on `/`, which the home page has not sent since `b7a675c` (#65, October 16; `lib/analytics-policy.ts`); and add `report` to the PostHog recording URL blocklist if it is not there yet ([analytics](../ANALYTICS.md), configuration step 2; not verified here).

## Project handoff: the Autopilot row of the subsystem index (`docs/PROJECT_HANDOFF.md`, line 62)

| Autopilot | [autopilot](../AUTOPILOT.md), `autopilot/CONSTITUTION.md` | — | `verify:autopilot`, `autopilot-guard`, `autopilot-smoke` | `autopilot-guard.yml`, `autopilot-merge.yml` |

## Website analytics: the home page has no `chapter-*` sections (`docs/ANALYTICS.md`, line 129)

**The home page has no `chapter-*` sections** (since the StoryBrand home page, #65, October 16, 2026). `autopilot/metrics.md` defines `home_depth@v1` as the distinct `chapter-*` sections a home landing saw, and counts "at least 3 distinct home chapters" (`section_viewed` on `/` with a `chapter-*` id) as an answer signal in `answered_visit_rate@v1`, `one_page_no_action_rate@v1` and `home_continuation_rate@v1`. Since then `home_depth@v1` no longer applies to `/` (every home landing reads 0), and home landings can no longer earn that answer signal: `answered_visit_rate@v1` and `home_continuation_rate@v1` fall and `one_page_no_action_rate@v1` rises for that reason alone, against this change, never in its favour. The new ids are deliberately not `chapter-*`: three short sections would have made the signal nearly automatic. Only the owner can add `@v2` definitions (for instance counting `section_viewed` `result` on `/tools/plan`); the measurement plan is in [the project handoff](handoff-2026-10-14-to-17.md#storybrand-home-page-navigation-and-research-hub-october-16-2026).
