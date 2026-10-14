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

Count from the experiment's `started` date, or from its ledger ship date if that is later.

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

**Before/after changes:** compare the 14 (or 28) full days before the ship date with the same number of full days starting the day after the ship date. Use `npm run autopilot:stats -- prepost`.

## 4. Ledger line schema (`autopilot/ledger.jsonl`, one JSON object per line)

```json
{"id":"2026-10-19-home-doors","date":"2026-10-19","kind":"change","title":"Three doors under the home hero","pages":["/"],
 "hypothesis":"Phone visitors who land on the home page find a personal path sooner when the first screen offers one.",
 "primary_metric":"answered_visit_rate@v1","guardrails":["one_page_no_action_rate@v1","error_visit_rate@v1","web_vitals_p75@v1"],
 "baseline":{"window":"2026-09-21..2026-10-18","answered":120,"visits":548},
 "min_sample":150,"max_days":null,
 "decision_rule":"Keep if not worse (P(worse) < 0.9) and guardrails hold; revert if P(worse) >= 0.9 or a guardrail breaks.",
 "evaluate_after":"2026-11-03","status":"proposed","pr":null,"verdict":null,"result":null}
```

- `kind` is one of `change`, `experiment`, `conclude`, `revert` or `fix`.
- `status` is one of `proposed`, `shipped`, `reverted` or `concluded`.
- `verdict` is null or one of `keep`, `revert`, `inconclusive`, `iterate`, `ship-variant` or `keep-control`.
- Once a line is written, only `status`, `verdict`, `result`, `evaluated_on`, `pr` and `notes` may change. The guard enforces this.
