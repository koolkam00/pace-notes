---
name: pace-notes-autopilot
description: Run one cycle of the Pace Notes self-improving loop. Read PostHog behaviour data and the live site, judge earlier changes against their pre-registered rules, choose the single most valuable change, build and verify it, and open an `autopilot` pull request that the merge workflow ships. Use for scheduled autopilot runs, or when asked to "run the autopilot".
---

# Pace Notes autopilot: run procedure

You are the product team for https://splithappens.run, a free site where runners explore pacing patterns from millions of recorded marathon finishes. You get about two runs a week. Each run should leave the site measurably better, or leave behind a clear reason why it didn't.

**Read first, every run, in full:**
- `AGENTS.md`;
- `autopilot/CONSTITUTION.md`, which overrides this file;
- `autopilot/metrics.md`;
- `autopilot/LEARNINGS.md`;
- `autopilot/backlog.md`;
- `autopilot/ledger.jsonl`: the last 10 lines, and every entry still `proposed` or `shipped`;
- `docs/DESIGN_SYSTEM.md`, before any UI work;
- `docs/AUTOPILOT.md`, for how merges and reverts work.

**Tools:**
- **GitHub:** the `mcp__github__*` tools; load them with ToolSearch. The repo is `koolkam00/pace-notes`.
- **PostHog:** `mcp__PostHog__exec`, project 614669 "Pace Notes". Run `info <tool>` before the first `call` of each tool. Typical calls:
  - `call execute-sql {"query": "..."}` for metrics;
  - `query-session-recordings-list` to find recordings;
  - `annotation-create` for annotations.
- **Vercel:** the `mcp__Vercel__*` tools, project `prj_nWED6tB51by87n3Xdhjvk8G4mHYR`, team `team_ltDKovHYx4pftBtChGJNjYuY`. Some reads may be refused by the permission classifier; if so, use `https://splithappens.run/version.json` and the GitHub deployment statuses instead.
- **Subagents:** the Agent and Workflow tools, when they are available.

**Where things live:**
- The log issue is the open issue labelled `autopilot-log`, titled "Autopilot log".
- Today's date comes from `date -u +%F`. Use US Eastern for anything you tell the owner.

---

## 0. Bootstrap (if the scheduled prompt didn't already do it)
1. Run `add_repo` (koolkam00/pace-notes, access "push"), run the clone command it returns into `/home/user/pace-notes`, then run `register_repo_root`.
2. `cd /home/user/pace-notes && npm ci`.
3. Playwright uses Chromium from `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` when it is present. Otherwise run `npx playwright install chromium`.
4. Keep scratch files outside the checkout, for example in `/tmp/autopilot/`.

## 1. Preflight: stop, finish or recover before starting anything new
1. **Kill switch.** Is any open issue labelled `autopilot:paused`?
   - If it is an incident issue opened by `github-actions[bot]`, go to step 2.
   - Otherwise, comment once on the log issue: "Run skipped: paused by #N". Don't repeat the comment if the latest one already says this. Then stop.
2. **Incidents.** Is any `autopilot-incident` issue open? While one is, nothing merges, a revert PR included, and the run ships no new feature.
   - Read it and confirm the live state with `npm run autopilot:smoke -- --base https://splithappens.run`.
   - When the cause is understood, a fix or revert is live and smoke passes, close the incident with a short explanation. If it is the second incident in 30 days, leave it open for the owner and stop.
   - If the site is still broken and no revert is live, open a revert PR (see §5.6) and mark it ready once CI is green. It cannot merge while the incident is open, so put "close incident #N so that revert PR #M can merge" under **Needs you**. Nor can it merge while another autopilot PR is open, so close that one first and record it as in step 1.3. Only the owner closes such an incident; never remove its pause label.
   - Use a Vercel `request_rollback` to the previous production deployment only for a hard outage (the site is down, or key pages crash), and follow up with `request_promote` once fixed.
3. **Open autopilot PR from an earlier run** (still open, with a branch starting `autopilot/`, with or without the label, or with the `autopilot` label: the PRs the merge gate counts)? Make that this run's job:
   - Read the sticky comment `<!-- autopilot-merge-status -->`, which lists the merge gates and which one blocks.
   - Fix whatever blocks it:
     - red CI: fix the code;
     - behind `main`: merge `main` into the branch;
     - review threads: address and resolve them;
     - Codex or other bot findings: verify each one and fix the real ones;
     - preview smoke failed: reproduce it locally.
   - If it has been stuck more than 7 days or its premise is gone, close it with a comment. Its ledger line never reached `main`, so record it as a new line: its entry with `status: "reverted"`, `verdict: "inconclusive"`, `shipped_on`, `result` and `evaluated_on` null, its `pr` and a note saying why it closed (the guard refuses the line without its `pr` number or a non-empty `notes`). (If its line is on `main` after all, mark that line the same way instead of adding one.) Such a record never gains a `shipped_on`, `result` or `evaluated_on` later. Put that change in this run's PR, or in a bookkeeping PR (step 1.4).
   - If more than one is open, none of them can merge until all but one are closed. Keep the one worth finishing and close the others as above.
   - Only start a new change once no autopilot PR is open.
4. **Bookkeeping.** A ledger line reaches `main` only with its PR, so every entry on `main` still `proposed` belongs to a PR that has merged. Mark each one `shipped`, with `pr` and `shipped_on`, the PR's `merged_at` date (UTC), which is never before the entry's `date` or after today. The guard checks `shipped_on` against the commit that put the line on `main` (the squash merge), so it is that day, never the day of the bookkeeping. If a line no longer parses (a hand edit broke it), repair it as it last parsed on `main`, changing only the fields bookkeeping may change. Leave `evaluate_after` as it is: it never changes, and the due date in step 2.3 allows for a late ship. Find the PR by its branch, `autopilot/<id>`, or search merged PRs for the id.
   - These edits, verdicts (§3) and the backlog and `LEARNINGS.md` updates (§7) go in this run's PR.
   - If this run opens no other PR, put them in a bookkeeping PR: branch `autopilot/<date>-ledger`, label `autopilot`, changing only existing ledger lines (and appending the records of PRs that closed unmerged, step 1.3), `autopilot/backlog.md` and `autopilot/LEARNINGS.md`. It needs no new ledger line and goes through the normal pipeline.
5. **Streak check.** Do the last two `change` or `experiment` entries that shipped (those with a `shipped_on` date) both have verdict `revert`? If so, add `autopilot:paused` to the log issue, explain why in a comment, and stop.

## 2. Observe
Collect evidence. Keep a private working note in `/tmp/autopilot/notes.md`; the public output is aggregates only.

1. **Scorecard.** Run every query in `autopilot/metrics.md` §2 for each window:
   - the last 7 days;
   - the last 28 days;
   - the 28 days before that.

   Split by phone versus desktop where the query allows. Note the sample size with every number.
2. **Experiments.** For each experiment marked `running` in `lib/experiments.ts`, run the readout query in §3 and compute the comparison with `npm run autopilot:stats -- ab --a x/n --b x/n`.
3. **Due evaluations.** Ledger entries with `status: "shipped"` and `verdict: null` (after the bookkeeping in step 1.4) whose due date is today or earlier. The due date is the later of `evaluate_after` and:
   - for a `change`, `shipped_on` + `window_days` + 1 day, the first day after its after-window;
   - for an `experiment`, its start (`shipped_on`, or the registry's `started` date if later) + `max_days`.

   So a change that shipped late is judged on its full windows, never on too little data. Run each one's pre-registered comparison (see §3). A running experiment whose readout (step 2) already meets its stopping rule is judged in §3 too, before its due date.
4. **Behaviour.**
   - Look at the newest recordings since the last run with `query-session-recordings-list`. Choose up to about 20 across the important groups:
     - home landings that left within 30 s;
     - phone visits from Instagram;
     - visits with rage or dead clicks;
     - visits with `site_error`;
     - long, engaged visits, to learn what works.
   - Read their summaries and activity, and Replay Vision summaries if they are available and the credit budget allows.
   - Also query `posthog.session_replay_features`, the table of per-recording behaviour metrics: scroll depth, clicks and rage clicks.
   - Write down patterns, not people.
5. **Feedback.** Look at the `page_feedback` and `page_feedback_reason` counts by page. A run of `numbers_look_wrong` or `something_broke` on one page is a bug report: reproduce it.
6. **Site health.**
   - Run `npm run autopilot:smoke -- --base https://splithappens.run --json /tmp/autopilot/smoke.json`.
   - Note lab LCP, CLS and total blocking time for the home page.
   - Check broken links if you changed navigation recently.
   - Check web vitals p75 and the `site_error` rate from the scorecard.
7. **Segments that matter here:**
   - 78% of visits are on phones, many in Instagram's in-app browser;
   - 83% land on the home page;
   - most traffic is direct or from Instagram.

   Design for a phone held in one hand, arriving from an Instagram post.

## 3. Evaluate earlier changes (judge by the rule set in advance)
For each due ledger entry:
1. Use exactly the metric, windows and decision rule recorded in its line. Don't change them now.
2. **Experiments.** Compare the arms, counting only visits exposed to the experiment.
   - Ship the variant when every one of these holds:
     - P(variant > control) ≥ 0.90;
     - each arm has at least the pre-registered minimum sample;
     - no guardrail is worse beyond its threshold.
   - Keep control when P ≤ 0.10, or a guardrail is broken.
   - Otherwise wait, up to the experiment's maximum duration (its due date, step 2.3), and count only its first `max_days` days from its start (`autopilot/metrics.md` §3). At the maximum, record `inconclusive` and choose with judgement:
     - keep the simpler option;
     - or keep the variant if it fixes a documented usability problem and is neutral or better.

     Say which you chose and why.
3. **Before/after changes.** Run `npm run autopilot:stats -- prepost` on the pre-registered windows: the entry's `window_days` full days before its `shipped_on`, and as many starting the day after it.
   - Revert when a guardrail is clearly broken, or the primary metric is worse with P(worse) ≥ 0.90.
   - Keep when the change is better or neutral.
   - Use `inconclusive` for samples below the entry's minimum. Before/after comparisons are confounded by traffic mix and seasonality, so call them evidence, not proof.
4. **Write the verdict.** Set the entry's `verdict`, `result` (numbers with n), `evaluated_on` and `notes`, and move its `status` to `concluded`. A verdict is one its kind can reach: for a `change`, `keep`, `revert`, `inconclusive` or `iterate`; for an `experiment`, `ship-variant`, `keep-control`, `inconclusive` or `revert`; for a `fix`, `revert` or `conclude`, `keep`, `revert` or `inconclusive`. For a `revert` verdict the status becomes `reverted` instead, in the PR that reverts the change (§5.6); until that PR, leave the entry `shipped` with verdict null, so the next run judges it again (the guard refuses a concluded `revert`). The guard also refuses a `change` concluded, or reverted as `inconclusive`, before its due date (step 2.3): before then a shipped change leaves the queue only with a `revert` verdict, when it is rolled back. These edits go in this run's PR, or in a bookkeeping PR (step 1.4). Only `status`, `verdict`, `result`, `evaluated_on`, `pr`, `shipped_on` and `notes` may change, and `verdict`, `result`, `evaluated_on`, `pr` and `shipped_on` only once.
5. **Learn.** Add a dated line to `autopilot/LEARNINGS.md` saying what this taught us about these visitors. Example: "Phone visitors from Instagram rarely scroll past chapter 2; entry points above the fold beat deeper links."
6. **Concluding an experiment is a change in its own right.**
   - Remove the losing variant's code.
   - Make the winner the default.
   - Set the experiment's `status` to `paused`, or remove it from the registry.
   - Record a `conclude` ledger entry.

## 4. Choose this run's change (exactly one)
Priority:
1. **Broken things.** Errors, crashes, a guardrail breach, live smoke failures, broken links, wrong numbers, accessibility failures.
2. **Due conclusions.** Experiments that have reached a verdict, and changes that the evaluation says should be reverted.
3. **The best opportunity in `autopilot/backlog.md`.** Re-rank the backlog every run against the new evidence, and add new items from what you observed. Score each one:
   - reach: the share of visits it touches;
   - expected effect on the north star;
   - strength of evidence;
   - confidence that it is safe;
   - effort.

   Choose the highest score that fits one run.

**Principles:**
- **Be bold, not random.** At about 18 visits a day, only effects of roughly 30% relative or more can be detected. Prefer changes that could plausibly move the answered-visit rate a lot: entry points, the first screen, clarity, speed, removing friction, making the personal "how do runners like me pace?" path obvious. Avoid tiny tweaks, and don't stack many unrelated edits.
- **Respect the reader.** The site's value is trustworthy, beautiful explanation. Don't trade clarity or honesty for clicks: no dark patterns, no modal pop-ups, no fake urgency.
- **Experiment or ship?** Use an A/B experiment when all three hold:
  - the page gets at least 100 landings a week;
  - there's real uncertainty;
  - the change is easy to show alongside the current version.

  Ship directly, with a before/after evaluation, when the change is a fix, a clear improvement such as speed or accessibility, or the page has too little traffic.
- **Needs the owner?** If the best idea needs a protected path (a new analytics event, a data change, a new dependency, a deleted route), a new tool (its privacy test and verifier entry live in `scripts/`), or more initial JavaScript on a page than its budget allows (S8 in `autopilot:check` fails it: 1.5 KB past its figure in `scripts/e2e/budget.json`, or, for a new page, past the largest figure in its section; give the S8 numbers), open an issue labelled `autopilot:needs-owner`. Give it a concrete proposal, the expected value and the evidence, then pick the next item. Don't open a duplicate if one is already open.
- **Design alternatives.** For anything visual or structural, sketch two or three distinct approaches. If subagents are available, ask one per approach for a short design, then choose against the evidence and `docs/DESIGN_SYSTEM.md`.

## 5. Build
1. Start a branch from the latest `main`: `git checkout -B autopilot/$(date -u +%F)-<slug> origin/main`. The slug is lowercase words joined by hyphens.
2. Implement the change. Match the surrounding code and the design system, keep text server-rendered where it is today, and keep pages fast. Experiments use `lib/experiments.ts` (registry) and the `Variant` component and `useVariant` hook from `components/Experiment.tsx`. Never hide content from search engines in a way that changes a page's meaning.
   - `AGENTS.md` asks for handoff documents to be updated; that does not apply to autopilot runs. They never edit `docs/PROJECT_HANDOFF.md`, `AGENTS.md`, `docs/AUTOPILOT.md` or `docs/ANALYTICS.md` (all protected). The ledger, `LEARNINGS.md` and the log issue are the record.
3. **Pre-register.** Append one line to `autopilot/ledger.jsonl`: one JSON object on one line, with `id` equal to the branch name without `autopilot/`, `date` today (`date -u +%F`), `status: "proposed"`, and `pr`, `verdict`, `result` and `shipped_on` null. The schema, field by field for each kind, is in `autopilot/metrics.md` §4; the guard refuses a line that breaks it. It must include:
   - the hypothesis, in plain words (the guard refuses a blank one);
   - the primary metric: a name copied exactly from the table in `autopilot/metrics.md` §1, version included (normally `answered_visit_rate@v1`, or the page-level metric that matches). The guard refuses any other name;
   - the guardrails: at least one name, again copied exactly from §1 (a `fix`, `revert` or `conclude` entry may have none). If no defined metric fits, don't invent a name: open an `autopilot:needs-owner` issue that proposes one. An experiment's readout (`autopilot/metrics.md` §3) computes the answered-visit, one-page-no-action and error-visit rates by variant, so use those for an experiment;
   - the baseline, measured from the scorecard before you write the entry: for a `change` or `experiment`, `window` (`"YYYY-MM-DD..YYYY-MM-DD"`, 7 to 56 whole UTC days ending on or before the entry's date), `visits` (or `n`), the visits in that window, and the numbers behind the primary metric, such as `answered`. A `fix`, `revert` or `conclude` may record any object, such as `{"note": "…"}`;
   - the minimum sample, `min_sample`: a positive whole number of visits that each before/after window (or each experiment arm) needs. A `change` or `experiment` must have it; a `fix`, `revert` or `conclude` needs none;
   - for a `change`, `window_days`: 14 or 28, the full days in each before/after window;
   - the decision rule, in plain words (never blank either);
   - `evaluate_after`: for a `change`, 14 to 90 days after the entry's date, and at least `window_days` (normally the expected ship date + `window_days` + 1); for an `experiment`, 7 days (or `max_days`, if shorter) to `max_days` + 1 day after it (normally `max_days` + 1, its planned end; a later ship moves its due date, not this); for a `fix`, `revert` or `conclude`, null. It never changes once written;
   - for experiments, also the maximum duration (`max_days`, at most 42 days), the registry `experiment` key, and canonical `pages` with optional `area`. Follow the data-only registry and occupancy contract in `autopilot/metrics.md` §4: at most two active reservations/running keys, with no overlapping page areas; an omitted area reserves the whole page. A running key keeps the pages and area of its latest experiment entry, even after that entry is concluded; to change them, register a new experiment. Another kind of entry, or the record of a pull request that closed unmerged, does not change them. This PR also sets the registry entry's run: `started` (required: today, `date -u +%F`, on or after the entry's date and not after today; the readout counts from the later of `started` and `shipped_on`), `variants` and `weights`. They never change while this registration stands, whether the key runs or is paused, so don't edit them later: pause or remove the key, or register a new experiment.

   Move the backlog item to "In flight" and link it.
4. **Verify. All of these are required:**
   - Commit first: the guard checks commits, not the working tree, and fails while tracked files have uncommitted changes.
   - `npm run autopilot:quick`: the guard first (it fails in under a second on a protected path, a forbidden pattern or a ledger mistake), then the analytics, older-browser, build, SEO and autopilot self-test checks, about 6 minutes. It must pass in full before you push; fix the cause of any failure, never the check.
   - Then push the branch and open the draft PR at once (§6 steps 1–3), so CI runs the two slow suites while you do the rest of this step and step 5: `verify:data` (CI's `verify` check) and the browser privacy tests (`privacy-e2e`), both required by the merge gate. Push fixes as new commits. To reproduce a CI failure locally, run the command that failed, or `npm run autopilot:check` (everything, about 25 minutes).
   - Screenshots before and after of every changed page at 390×844 and 1366×900, plus any experiment variant (set its `sessionStorage` key `pace-notes-exp:<key>` with a Playwright init script). Look at them. Check spacing, wrapping, contrast, focus states and the first phone screen.
   - Keyboard navigation and visible focus on anything interactive you added. Respect reduced motion.
   - Copy: read every new sentence against the constitution's §2 and §3.
5. **Adversarial review.** If subagents are available, start at least two reviewers who have not seen your reasoning. Give them the diff and the constitution.
   - **Privacy and constitution reviewer:** could anything typed, searched or personal reach a URL, event or recording? Is any number invented or misread? Is any copy banned or causal?
   - **Visitor reviewer:** on a phone, does this make the site clearer and faster or not? Is there a better version? What breaks?

   Fix every real finding. If subagents are unavailable, do both passes yourself, in writing, before shipping.
6. **Reverting a change** (an incident whose automatic revert was not pushed, or a `revert` verdict):
   - Branch `autopilot/<date>-revert-<slug>` from `origin/main`, then run `git revert --no-edit <merge sha>`.
   - Run `git checkout origin/main -- autopilot/ledger.jsonl autopilot/LEARNINGS.md`. The revert would delete the change's ledger line and its learnings, and neither file ever loses a line.
   - If the change paused or removed an experiment (a conclusion), keep that key as `origin/main` has it: when the change started none, run `git checkout origin/main -- lib/experiments.ts`. A concluded experiment never runs again, and the guard refuses to restart it; the automatic revert does the same.
   - Set the original entry's `status` to `reverted`, its `verdict` to `revert` if it is still null, its `pr`, `shipped_on` (the merge's UTC day, as in step 1.4) and `evaluated_on` (today) if they are still null, and add a note saying why (the note it already had does not count). The guard accepts `reverted` only with verdict `revert` or `inconclusive`; an entry already judged anything else keeps its status. Then append a `revert` entry (`evaluate_after: null`). With the entry marked so, the guard accepts the lines the revert puts back where the merge deleted them, even owner code it would refuse as new (browser storage, an address on another host).
   - If the change added a page, reverting it deletes that page, which only the owner may do: open an `autopilot:needs-owner` issue instead.

## 6. Ship
1. Push the branch: `git push -u origin <branch>`, as soon as `npm run autopilot:quick` passes (step 5.4).
2. Open the PR, but never a second autopilot PR while one is open (step 1.3). While two are open, the merge workflow merges neither of them. A PR counts as an autopilot PR if its branch starts with `autopilot/`, with or without the label, or if it has the `autopilot` label. It starts as a draft per the session rules. Title it "Autopilot: <what changes, in plain words>". The body contains:
   - **Why:** the evidence, as aggregates with n;
   - **What changed:** short;
   - **Screens:** describe what you saw at each width;
   - **Hypothesis and decision rule:** copied from the ledger;
   - **Checks:** each one with its result;
   - **Risk and rollback.**

   End with the attribution lines the session requires.
3. Add the `autopilot` label and subscribe to PR activity.
4. When CI is green on the latest commit and steps 5.4 and 5.5 are done, with every real finding fixed, mark the PR ready for review. The "Autopilot merge" workflow then merges it once every gate passes, at least 15 minutes after it is ready. It smoke-tests the Vercel preview first, then deploys and checks the live site. If the live checks fail, it reverts automatically and opens an incident.
5. Drive the PR to green under the session's PR rules:
   - fix red CI;
   - answer and resolve review comments, including the Codex bot's after you verify them;
   - merge `main` in if the PR falls behind.

   Never merge it yourself.
6. **After the merge:**
   - Confirm `https://splithappens.run/version.json` shows the merge commit.
   - Run the live smoke test yourself.
   - Create a PostHog annotation at the merge time: "autopilot: <title> (#<PR>)".
   - Don't edit the ledger now: the next run's bookkeeping (step 1.4) marks the entry `shipped`, with `pr` and `shipped_on`.

   If the session must end before the merge, say in the log that the merge is pending. The next run picks it up: in step 1.3 while the PR is open, and in step 1.4 once it has merged.

## 7. Report: one comment on the "Autopilot log" issue per run
Use this shape. Keep it short, specific and honest, with aggregate numbers only and no recording links:

```
## Run <YYYY-MM-DD, Mon/Thu> · <one-line outcome>
**Scorecard** (28 days vs the 28 before; n = visits): answered-visit rate X% (n) vs Y% (n) · one-page-no-action X% · error visits X% · phone LCP p75 X s · CLS p75 X · no-match searches X%
**Experiments:** <key>: control X% (n) vs variant Y% (n), P(variant better) = Z; <status>
**Evaluated:** <entry>: <verdict> because <rule result>
**This run:** <change> — why (evidence) — PR #N — status (merged and live / waiting on <gate> / blocked: <reason>)
**Watching next:** the top 3 backlog items, one line each
**Needs you:** <only if something truly needs the owner, else "nothing">
```

Update the backlog and `LEARNINGS.md` in this run's PR before it is marked ready, or in a bookkeeping PR (step 1.4) if this run opens no other. If nothing was shipped, the log still says what was learned and why nothing shipped.

## 8. Don'ts that are easy to get wrong
- Don't count people. Each visit is one browser tab (per-tab IDs). Count visits and page views, and call shares "observed shares".
- Don't trust a single day or a tiny n. With n < 100 per group, say "too few visits to tell".
- Don't put a visitor's typed time or search into an event property. The page's own query string is fine, because analytics strips it.
- Don't reuse a branch from a merged PR. Start fresh from `main`.
- Don't leave scratch files in the checkout. The stop hook will try to commit them.
- Don't use `pkill -f` or `killall` with a pattern. Kill by PID.
