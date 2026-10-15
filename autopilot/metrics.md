# Pace Notes autopilot: metrics (owner-set; protected)

These definitions are fixed so that every run measures the same way. If a definition has to change, add a new version (`@v2`) next to the old one. Keep evaluating entries registered on `@v1` with `@v1`. Only the owner edits this file.

Data source: PostHog project 614669. Analytics fires only on `splithappens.run` and `www.splithappens.run` (and `htw-live-study.vercel.app`, which redirects). Run every query through `mcp__PostHog__exec` → `call execute-sql {"query": "..."}`. Replace `{start}` and `{end}` with UTC timestamps such as `'2026-10-01 00:00:00'`, end exclusive.

**Units.**
- A **visit** is one `$session_id` with at least one `$pageview`. The site uses per-tab anonymous IDs, so never count "people" or "users".
- Treat each share as an observed share of visits.
- Report n every time.

**Windows.**
- Use whole UTC days.
- The standard windows are the last 7 days, the last 28 days and the 28 days before that.
- Ledger entries use the windows written into the entry.

## 1. Definitions

| Metric | Definition | Direction |
|---|---|---|
| `answered_visit_rate@v1` (**north star**) | Share of visits with at least one answer signal (listed below this table). | Higher is better. |
| `one_page_no_action_rate@v1` (guardrail) | Share of visits with exactly 1 `$pageview` and no answer signal. | Lower is better. Must not rise by more than 5 points with P(worse) ≥ 0.9. |
| `quick_exit_rate@v1` (guardrail) | Of visits that recorded a page duration: share with 1 page view, no answer signal, and the longest recorded `$prev_pageview_duration` under 10 s. | Lower is better. |
| `error_visit_rate@v1` (guardrail) | Share of visits with at least one `site_error`. | Must stay ≤ 1%, and must not double. |
| `web_vitals_p75@v1` (guardrail) | p75 of `$web_vitals_LCP_value` (ms), `$web_vitals_INP_value` (ms) and `$web_vitals_CLS_value` on phones (`$device_type = 'Mobile'`), across all page views in the window. | LCP ≤ 2500, INP ≤ 200, CLS ≤ 0.1. Must not get worse by more than 10%. |
| `no_match_search_rate@v1` (guardrail) | `runner_search_completed` with `outcome = 'no_matches'` ÷ all `runner_search_completed`. | Lower is better. |
| `home_continuation_rate@v1` | Of visits that land on `/`: share with at least 2 page views, or at least 1 answer signal. | Higher is better. |
| `home_depth@v1` | Of visits that land on `/`: the distribution of how many distinct `chapter-*` sections they saw (`section_viewed`). | Higher is better. |
| `story_completion_rate@v1` | Of story page views (`$prev_pageview_pathname` starting `/stories/` on a `$pageleave` or the next `$pageview`): share with `$prev_pageview_max_scroll_percentage` ≥ 0.9. | Higher is better. |
| `tool_engagement_rate@v1` | Of visits that view any `/tools/<tool>` page: share with at least one `tool_used`. | Higher is better. |
| `feedback_yes_share@v1` | `page_feedback` with `answer = 'yes'` ÷ all `page_feedback`, by `$pathname`. | Higher is better. Only report it at n ≥ 20. |

**Answer signals** (`@v1`): a visit has one if any of these happened:
- `analysis_filters_applied`;
- `runner_profile_opened`;
- `race_comparison_opened`;
- `data_download_clicked`;
- `tool_used` (any action);
- `page_feedback` with `answer = 'yes'`;
- a story read to the end: `$prev_pageview_pathname` starting with `/stories/` and `$prev_pageview_max_scroll_percentage` ≥ 0.9;
- at least 3 distinct home chapters seen: `section_viewed` on `$pathname = '/'` with `section` starting `chapter-`.

## 2. Scorecard query (all visit-level metrics in one pass)

```sql
WITH v AS (
  SELECT
    `$session_id` AS sid,
    countIf(event = '$pageview') AS pageviews,
    argMinIf(properties.$pathname, timestamp, event = '$pageview') AS landing,
    argMinIf(properties.$device_type, timestamp, event = '$pageview') AS device,
    countIf(event IN ('analysis_filters_applied', 'runner_profile_opened', 'race_comparison_opened', 'data_download_clicked', 'tool_used')
      OR (event = 'page_feedback' AND properties.answer = 'yes')
      OR (event IN ('$pageview', '$pageleave')
          AND startsWith(toString(properties.$prev_pageview_pathname), '/stories/')
          AND toFloat(properties.$prev_pageview_max_scroll_percentage) >= 0.9)) AS action_events,
    uniqIf(toString(properties.section), event = 'section_viewed' AND properties.$pathname = '/' AND startsWith(toString(properties.section), 'chapter-')) AS home_chapters,
    maxIf(toFloat(properties.$prev_pageview_duration), event IN ('$pageview', '$pageleave')) AS max_duration,
    countIf(event IN ('$pageview', '$pageleave') AND properties.$prev_pageview_duration IS NOT NULL) AS duration_events,
    countIf(event = 'site_error') AS errors
  FROM events
  WHERE timestamp >= toDateTime({start}) AND timestamp < toDateTime({end})
    AND notEmpty(toString(`$session_id`))
  GROUP BY sid
  HAVING pageviews > 0
)
SELECT
  device,
  count() AS visits,
  countIf(action_events > 0 OR home_chapters >= 3) AS answered,
  round(answered / visits, 4) AS answered_visit_rate,
  countIf(pageviews = 1 AND action_events = 0 AND home_chapters < 3) AS one_page_no_action,
  round(one_page_no_action / visits, 4) AS one_page_no_action_rate,
  countIf(duration_events > 0) AS visits_with_duration,
  countIf(duration_events > 0 AND pageviews = 1 AND action_events = 0 AND home_chapters < 3 AND max_duration < 10) AS quick_exits,
  round(quick_exits / nullIf(visits_with_duration, 0), 4) AS quick_exit_rate,
  countIf(errors > 0) AS error_visits,
  round(error_visits / visits, 4) AS error_visit_rate,
  countIf(landing = '/') AS home_landings,
  countIf(landing = '/' AND (pageviews >= 2 OR action_events > 0 OR home_chapters >= 3)) AS home_continued,
  round(home_continued / nullIf(home_landings, 0), 4) AS home_continuation_rate
FROM v
GROUP BY ROLLUP(device)
ORDER BY device
```

The `ROLLUP` row whose `device` is null is the all-device total.

**Web vitals p75** (phones):
```sql
SELECT
  count() AS samples,
  quantileIf(0.75)(toFloat(properties.$web_vitals_LCP_value), properties.$web_vitals_LCP_value IS NOT NULL) AS lcp_p75_ms,
  quantileIf(0.75)(toFloat(properties.$web_vitals_INP_value), properties.$web_vitals_INP_value IS NOT NULL) AS inp_p75_ms,
  quantileIf(0.75)(toFloat(properties.$web_vitals_CLS_value), properties.$web_vitals_CLS_value IS NOT NULL) AS cls_p75
FROM events
WHERE event = '$web_vitals' AND properties.$device_type = 'Mobile'
  AND timestamp >= toDateTime({start}) AND timestamp < toDateTime({end})
```

**Errors by category, searches, feedback:**
```sql
SELECT event, toString(properties.category) AS category, toString(properties.outcome) AS outcome,
       toString(properties.results) AS results, toString(properties.answer) AS answer,
       toString(properties.reason) AS reason, count() AS n
FROM events
WHERE event IN ('site_error', 'runner_search_completed', 'page_feedback', 'page_feedback_reason')
  AND timestamp >= toDateTime({start}) AND timestamp < toDateTime({end})
GROUP BY event, category, outcome, results, answer, reason
ORDER BY event, n DESC
```

**Home depth** (landings on `/`):
```sql
WITH v AS (
  SELECT `$session_id` AS sid,
    argMinIf(properties.$pathname, timestamp, event = '$pageview') AS landing,
    uniqIf(toString(properties.section), event = 'section_viewed' AND properties.$pathname = '/' AND startsWith(toString(properties.section), 'chapter-')) AS chapters
  FROM events
  WHERE timestamp >= toDateTime({start}) AND timestamp < toDateTime({end}) AND notEmpty(toString(`$session_id`))
  GROUP BY sid
)
SELECT chapters, count() AS visits FROM v WHERE landing = '/' GROUP BY chapters ORDER BY chapters
```

**Story completion and tool engagement:**
```sql
SELECT
  toString(properties.$prev_pageview_pathname) AS page,
  count() AS views_closed,
  countIf(toFloat(properties.$prev_pageview_max_scroll_percentage) >= 0.9) AS read_to_end,
  round(read_to_end / views_closed, 3) AS completion,
  quantile(0.5)(toFloat(properties.$prev_pageview_duration)) AS median_seconds
FROM events
WHERE event IN ('$pageview', '$pageleave') AND properties.$prev_pageview_pathname IS NOT NULL
  AND timestamp >= toDateTime({start}) AND timestamp < toDateTime({end})
GROUP BY page HAVING views_closed >= 10 ORDER BY views_closed DESC
```
```sql
WITH v AS (
  SELECT `$session_id` AS sid,
    countIf(event = '$pageview' AND startsWith(toString(properties.$pathname), '/tools/')) AS tool_views,
    countIf(event = 'tool_used') AS uses
  FROM events
  WHERE timestamp >= toDateTime({start}) AND timestamp < toDateTime({end}) AND notEmpty(toString(`$session_id`))
  GROUP BY sid
)
SELECT countIf(tool_views > 0) AS tool_visits, countIf(tool_views > 0 AND uses > 0) AS engaged,
       round(engaged / nullIf(tool_visits, 0), 4) AS tool_engagement_rate
FROM v
```

**Landing pages and sources** (context for choosing work):
```sql
WITH v AS (
  SELECT `$session_id` AS sid,
    argMinIf(properties.$pathname, timestamp, event = '$pageview') AS landing,
    argMinIf(properties.$referring_domain, timestamp, event = '$pageview') AS ref,
    argMinIf(toString(properties.utm_content), timestamp, event = '$pageview') AS utm_content
  FROM events
  WHERE event = '$pageview' AND timestamp >= toDateTime({start}) AND timestamp < toDateTime({end})
  GROUP BY sid
)
SELECT landing, ref, utm_content, count() AS visits FROM v GROUP BY landing, ref, utm_content ORDER BY visits DESC LIMIT 40
```

## 3. Experiment readout

For an experiment `<key>` whose `pages` are listed in `lib/experiments.ts`:
- Exposed visits are those with a `$pageview` on one of those pages that carries `$feature/<key>`.
- The primary metric is the answered-visit rate among exposed visits, by variant.
- The guardrails are the one-page-no-action rate and the error-visit rate, by variant.

Count from the experiment's start, its `started` date or its ledger entry's `shipped_on` if that is later, for at most `max_days` days: `{end}` is the start + `max_days`, however late it is judged. The pull request that registers the experiment sets its `started`, `variants` and `weights`, and they never change while it runs (§4).

```sql
WITH v AS (
  SELECT `$session_id` AS sid,
    argMinIf(toString(properties['$feature/<key>']), timestamp, event = '$pageview' AND properties.$pathname IN (<pages>) AND properties['$feature/<key>'] IS NOT NULL) AS variant,
    countIf(event = '$pageview') AS pageviews,
    countIf(event IN ('analysis_filters_applied', 'runner_profile_opened', 'race_comparison_opened', 'data_download_clicked', 'tool_used')
      OR (event = 'page_feedback' AND properties.answer = 'yes')
      OR (event IN ('$pageview', '$pageleave') AND startsWith(toString(properties.$prev_pageview_pathname), '/stories/') AND toFloat(properties.$prev_pageview_max_scroll_percentage) >= 0.9)) AS action_events,
    uniqIf(toString(properties.section), event = 'section_viewed' AND properties.$pathname = '/' AND startsWith(toString(properties.section), 'chapter-')) AS home_chapters,
    countIf(event = 'site_error') AS errors
  FROM events
  WHERE timestamp >= toDateTime({start}) AND timestamp < toDateTime({end}) AND notEmpty(toString(`$session_id`))
  GROUP BY sid
)
SELECT variant, count() AS visits,
  countIf(action_events > 0 OR home_chapters >= 3) AS answered,
  countIf(pageviews = 1 AND action_events = 0 AND home_chapters < 3) AS one_page_no_action,
  countIf(errors > 0) AS error_visits
FROM v WHERE notEmpty(variant) GROUP BY variant ORDER BY variant
```

Then run `npm run autopilot:stats -- ab --a <answered>/<visits of control> --b <answered>/<visits of variant>`.

**Defaults** for a new experiment unless its ledger entry says otherwise:
- minimum 150 exposed visits per arm;
- maximum 42 days;
- decision rule: ship the variant at P(variant better) ≥ 0.90 with guardrails intact, keep control at P ≤ 0.10, otherwise inconclusive at the maximum.

**Before/after changes:** compare the entry's `window_days` (14 or 28) full days before its `shipped_on` date with the same number of full days starting the day after it. Use `npm run autopilot:stats -- prepost`. Each window needs at least the entry's `min_sample` visits; with fewer, the verdict is `inconclusive`.

## 4. Ledger line schema (`autopilot/ledger.jsonl`, one JSON object per line)

Each entry is a single line; the example below is one line too (scroll sideways):

```json
{"id":"2026-10-19-home-doors","date":"2026-10-19","kind":"change","title":"Three doors under the home hero","pages":["/"],"hypothesis":"Phone visitors who land on the home page find a personal path sooner when the first screen offers one.","primary_metric":"answered_visit_rate@v1","guardrails":["one_page_no_action_rate@v1","error_visit_rate@v1","web_vitals_p75@v1"],"baseline":{"window":"2026-09-21..2026-10-18","answered":120,"visits":548},"min_sample":150,"window_days":14,"max_days":null,"decision_rule":"Keep if not worse (P(worse) < 0.9) and guardrails hold; revert if P(worse) >= 0.9 or a guardrail breaks.","evaluate_after":"2026-11-03","status":"proposed","pr":null,"shipped_on":null,"verdict":null,"result":null}
```

**Fields, by kind.** Every field a later step reads is registered here, so none can be missing, blank, out of range or at odds with another field when the entry is written. The guard checks every new entry, every edited line and every repaired line against this table (`LEDGER_SCHEMA` in `scripts/autopilot-guard.cjs`, which has the same rules). "Date + N" means N days after the entry's `date`. "Today" is the UTC day of the check: the head commit's, or the clock's if that is earlier, since anyone can set a commit's date.

| Field | `change` | `experiment` | `fix`, `revert`, `conclude` |
|---|---|---|---|
| `id` | `YYYY-MM-DD-slug`, unique: a new or repaired line never takes an id another line uses. A new entry's is its branch name without `autopilot/`, so its pull request can be found later | same | same |
| `kind` | a before/after change, judged later | an A/B experiment, judged later | a fix, a revert, or the conclusion of an experiment: not judged later |
| `date` | the UTC day the entry is written (`date -u +%F`): within 2 days of the branch date, and not after today | same | same |
| `title`, `hypothesis`, `decision_rule` | text, never blank | same | same |
| `primary_metric` | one name from the §1 table, exactly, version included (`answered_visit_rate@v1`) | same | same |
| `guardrails` | a list of §1 names, at least one | at least one | may be empty |
| `baseline` | measured before the entry: `window`, `"YYYY-MM-DD..YYYY-MM-DD"`, 7 to 56 whole UTC days counting both ends, ending on or before `date`; `visits` (or `n`; if both, the same), the visits in that window, a positive whole number; any other numbers non-negative and finite. Text, and lists and objects of numbers and text, are fine; leave out a number you do not have | measured, as for a change | any object, such as `{"note": "…"}` |
| `min_sample` | the fewest visits each before/after window needs, a positive whole number | the fewest exposed visits each arm needs, a positive whole number | null or left out (or a positive whole number) |
| `window_days` | `14` or `28`: the full days in each before/after window (§3) | null or left out | null or left out |
| `max_days` | null or left out | the maximum duration, a whole number from 1 to 42 | null or left out |
| `evaluate_after` | date + 14 to date + 90, and at least date + `window_days` | its planned end: date + 7 (or + `max_days`, if shorter) to date + `max_days` + 1 (a day to ship; a later ship moves the due date instead) | null: nothing registers windows or a sample to judge it on |
| `experiment` | optional: a registry key it names | its key in `lib/experiments.ts` (lower-case words joined by hyphens) | optional, as for a change |
| `pages`, `area` | optional, as for an experiment | `pages`: nonempty, unique canonical paths (`/`, `/tools`) or `"*"` for all pages; `area`: optional, a lower-case hyphenated slug or `"*"`. An omitted area reserves the whole page | optional, as for an experiment |
| `status` | `proposed`, `shipped`, `reverted` or `concluded` (see below) | same | same |
| `pr` | null or the pull request's number | same | same |
| `shipped_on` | null, or the UTC day its pull request merged: on or after `date`, and not after today (a day of slack for clocks). Set on a line already on `main`, it is the UTC day of the commit that put the line there (its merge) | same | same |
| `verdict` | null, or `keep`, `revert`, `inconclusive` or `iterate` | null, or `ship-variant`, `keep-control`, `inconclusive` or `revert` | null, or `keep`, `revert` or `inconclusive` |
| `result` | null, or an object with the numbers and their n (never `{}`) | same | same |
| `evaluated_on` | null, or the day it was judged: on or after `date` and `shipped_on`, and not after today (a day of slack). Once concluded, on or after its due date (below), and so is today | null, or the day it was judged: on or after `date` and `shipped_on`, and not after today (a day of slack) | as for an experiment |
| `notes` | optional text | same | same |

**What each status needs**, so that no entry drops out of the evaluation:

| Status | Must be set | Must still be null |
|---|---|---|
| `proposed` | (nothing more) | `shipped_on`, `verdict`, `result`, `evaluated_on` |
| `shipped` | `pr`, `shipped_on` | `verdict`, `result`, `evaluated_on` (the evaluation picks shipped entries whose verdict is null) |
| `concluded` | `pr`, `shipped_on`, `verdict` (never `revert`), `result`, `evaluated_on` | (nothing) |
| `reverted` | when an entry moves there: verdict `revert` or `inconclusive`, `pr` and a new note; with verdict `revert`, also `shipped_on` and `evaluated_on`. A new closed-unmerged record: step 4 below | |

**When an entry is due.** The evaluation waits for the data, whatever `evaluate_after` says: an entry is due on the later of `evaluate_after` and, for a `change`, `shipped_on` + `window_days` + 1 day (the first day after its after-window); for an `experiment`, its start (`shipped_on`, or the registry's `started` date if later) + `max_days`. `evaluate_after` never changes, so a change that ships late is judged later, never on shorter windows. The guard refuses a `change` concluded before its due date (its `evaluated_on`, and today, are on or after it). Before its due date, an experiment's stopping rule may still decide it (the skill's §3), and any entry may be reverted sooner.

- `primary_metric` and `guardrails` in a new entry must be names from the §1 table, written exactly as there. The guard refuses any other name, such as a name without its version or one that only appears outside the §1 table. To measure something new, the owner adds it to §1 first. An experiment's readout (§3) computes the answered-visit, one-page-no-action and error-visit rates by variant, so those are its natural primary metric and guardrails.
- A line already on `main` that breaks a rule about a field that is fixed once written (such as a missing `min_sample`, `window_days` or `max_days`, a blank hypothesis or decision rule, an unmeasured baseline, an `evaluate_after` that is missing or out of range, a `shipped_on` before its date, a verdict its kind cannot reach, or a conclusion before its due date), because the rule is newer than the line or the owner wrote it so, only gets a warning, also when it is shipped, concluded or reverted, because those fields can never be filled in or changed. Its other problems must be fixed when the line is edited. Two lines already sharing an id only warn too. A broken line that is repaired meets the whole schema, and keeps an id of its own.

**Lifecycle.**
1. **Proposed:** the change's pull request appends the entry with `status: "proposed"` and `pr`, `shipped_on`, `verdict` and `result` null.
2. **Shipped:** once that pull request has merged, the next run sets `status: "shipped"`, `pr` and `shipped_on` (the merge's UTC day: the guard checks it against the commit that put the line on `main`).
3. **Concluded or reverted:** when judged (a change on or after its due date), the entry gets `verdict`, `result`, `evaluated_on` and `notes`, and `status: "concluded"`, or `"reverted"` for a `revert` verdict, in the pull request that reverts the change; until then it stays `shipped` with verdict null. An entry that moves to `reverted` needs verdict `revert` or `inconclusive`, its `pr` and a note saying why (added to any note it already had); with verdict `revert` (it shipped and was rolled back) it also needs `shipped_on` and `evaluated_on`. So an entry judged anything else cannot be marked reverted; a later revert of it is recorded by its `revert` entry. An automatic revert by the merge workflow marks the entry `reverted` itself, with verdict `revert`, `pr`, `shipped_on`, `evaluated_on` (the day of the revert) and a dated note.
4. **Closed unmerged:** a pull request that closed without merging never put its line on `main`. It is recorded as a new line, in the run's pull request or a bookkeeping one: `status: "reverted"`, `verdict: "inconclusive"` (or null), `shipped_on` and `result` null, its `pr` (the number of the pull request that closed) and `notes` saying why it closed; the guard refuses the line without either. Its date and id stay those of the original change. A line already on `main` whose pull request closed unmerged is marked the same way, with verdict `inconclusive`.

Once a line is written, only `status`, `verdict`, `result`, `evaluated_on`, `pr`, `shipped_on` and `notes` may change. `verdict`, `result`, `evaluated_on`, `pr` and `shipped_on` change only once, from null. The status only moves forward. The guard enforces all of this on autopilot pull requests. Entries the owner adds in a pull request of their own follow the same schema; one that has already shipped carries its `pr` and `shipped_on`.


**Experiment registry and occupancy.** Before starting experiments, the measurement framework must provide `lib/experiments.ts`. It is a data-only file: one `export const EXPERIMENTS = [literal entries]`, optionally followed by `as const` and a semicolon. Comments, single/double quotes, nested literal data and trailing commas are supported; imports, type declarations, spreads, expressions and later mutations are not. Keep types and runtime helpers in the protected experiment framework. The privileged guard parses git objects without importing or executing this file. Alternate `lib/experiments.*` implementations and directory indexes are protected, and the registry file cannot be removed; pause or remove its entries instead.

Each registry entry has a unique `key` and `status` (`running` or `paused`). A running entry keeps the `pages` and optional `area` of its registration: the latest `experiment` entry in the ledger whose `experiment` is its key, whatever that entry's status. Entries of other kinds that name the key do not count, and neither does a closed-unmerged record (reverted, never shipped). A concluded or reverted entry still fixes the scope of a key that keeps running; to run on other pages or another area, register a new experiment. The pull request that registers an experiment also sets its run: `started` (if given, on or after the registration's `date` and not after today, a day of slack aside), `variants` and `weights`. While that registration is the latest for the key, they never change, whether the key runs or is paused; the key may be removed, but not added again under it. To run it differently, register a new experiment. The guard checks every running key whenever a pull request changes the registry or the ledger; a mismatch already on `main` is only a warning. For example:

```ts
export const EXPERIMENTS = [
  { key: 'home-hero', status: 'running', pages: ['/'], area: 'hero', started: '2026-10-19' },
] as const;
```

The union of proposed/shipped ledger experiments and running registry keys may contain at most two keys, with no overlap on the same page area. A matching ledger/registry key counts once; a concluded or reverted ledger record still occupies a slot if its registry entry runs. Pausing the registry alone does not release a proposed/shipped reservation. A newly running or resumed key requires active pre-registration. Missing or ambiguous occupancy blocks a new experiment until repaired; the guard does not guess from incomplete history. Ordinary changes and bookkeeping do not require a registry when it is unchanged.
