# Runner lookup and incomplete results

Updated September 17, 2026. Starting main commit: `9204b25f74bd77727a0cbfdcca65e9fe25c5acdd`. Input then was `private-export-20260912-0934`.

**1652 (October 16, 2026; branch `feat/release-1652`, not deployed).** A scan of every rebuilt `htw-db-2026-10-16-1652` profile shard (7,881 shards) found, with the same name normalization:

| Records | Searchable name | No usable name | Total |
| --- | ---: | ---: | ---: |
| Eligible for pacing analysis | 3,871,694 | 73 | 3,871,767 |
| Ineligible for pacing analysis | 1,043,519 | 69 | 1,043,588 |
| All records | 4,915,213 | 142 | 4,915,355 |

The tables and prose below are the September 17 (0934) evidence and are historical.

## Verified coverage

The lookup builder retains all raw records with a left join to analytical eligibility. Name indexing filters only unusable normalized names, not incomplete timings, missing demographics or held editions. The complete-data verifier checks each profile record and every expected name alias.

A scan of every checked-in profile shard found:

| Records | Searchable name | No usable name | Total |
| --- | ---: | ---: | ---: |
| Eligible for pacing analysis | 3,517,262 | 74 | 3,517,336 |
| Ineligible for pacing analysis | 944,975 | 68 | 945,043 |
| All records | 4,462,237 | 142 | 4,462,379 |

These are source records, not unique people. The 142 records without usable names remain in the profile data and complete export; no invented name makes them discoverable by name search. Shared names and supplied identity links still require the visitor to choose which races belong together.

## Presentation change

The search page explicitly includes every named record and explains that incomplete results remain available. “View selected races” opens recorded results whether or not a pacing comparison is supported. A selection containing only ineligible records shows race/name, recorded age and gender where supplied, original finish and checkpoint readings, and each quality reason. A mixed selection retains its limited-analysis records below the eligible-race summary.

Missing or inconsistent readings stay missing or inconsistent. No pace, fastest eligible finish, percentile or progression is derived from an ineligible result. Weather/terrain and peer-analysis behavior for eligible results is unchanged. Search normalization, pagination, candidate grouping, source pins and all published data bytes are unchanged; no calculation or context rebuild is required.

## Validation and publication

`scripts/verify-runner-search.cjs` covers a candidate containing only held/missing-split records through verified compressed name search, profile loading and the selected-record view. It also checks mixed selections, original source formatting, miles/kilometres, and that a faster held time never replaces the eligible best. The repository's full `npm run verify:data` and production `npm run build` remain required.

Deployment and anonymous production checks are recorded in the PR. This document alone does not certify that a commit has reached production.
