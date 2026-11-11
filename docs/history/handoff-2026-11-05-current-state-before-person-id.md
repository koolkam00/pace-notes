# Handoff current state, November 5, 2026 (after #89, before the person_id identity)

Moved November 5, 2026 from `docs/PROJECT_HANDOFF.md` at `3bc2b26e` (`main`), word for word: the Current state block (lines 6–22), checked at 13:20 UTC after #89 merged, replaced on branch `feat/person-id-identity` after #90 merged.

## Current state


**Checked 2026-11-05, 13:20 UTC**, after #89 merged. Keep four facts apart: release notes, measured results, repository state and deployed state. Never write "live" for anything without reading `/version.json` again. After a merge that changes a page, data, a contract or a workflow, replace this block, with its date, in the next pull request ([AGENTS.md](../../AGENTS.md) rule 19). The block checked at 06:21 UTC, before #89 merged, is in [history](handoff-2026-11-05-current-state-before-89.md).

| Fact | Value | How it was checked |
| --- | --- | --- |
| `main` | `b35789b8`, "Adopt master-20261103b for every analysis and the site; half pages on person links v4 (#89)", squash-merged 2026-11-05 07:59 UTC | `git ls-remote origin refs/heads/main` |
| Production | `b35789b8`, built 2026-11-05T08:00:13Z | `curl -s https://splithappens.run/version.json` (08:00 and 13:20 UTC) |
| Production data | `release_tag` `master-20261103b` (`as_of` 2026-11-04T14:30:12Z), 4,222,246 eligible finishes; `/data/half/manifest.json` names `half-dataset-20261030-1904`, set B 58,597 pairs | `curl -s https://splithappens.run/data/live.json` and the half manifest |
| Production smoke | PASS: 54 of 54 page checks, old Safari 26 of 26, no third-party requests; home lab LCP 1.0 s, CLS 0.147, TBT 258 ms; `verify:seo:live` 21 of 21 | `npm run autopilot:smoke -- --base https://splithappens.run --quick --expect-sha b35789b8…` and `npm run verify:seo:live`, run after 08:00 UTC |
| Releases | `koolkam00/pace-notes`: `master-20261103b` (2026-11-03 23:10 UTC) is the newest and is the adopted pin; `koolkam00/pace-notes-db-backup`: nothing after `person-ids-v4-20261030-1150` | GitHub REST `releases` |
| Open pull requests | the distance label (`feat/cross-distance-label`, draft, this branch), #77 (draft, `data/release-0829`), #49 (draft, `codex/berlin-2026-intake`), #29 (`codex/qa-coverage-mobile`) | GitHub REST `pulls?state=open` |
| Autopilot | Paused (issue #59, `autopilot:paused` since 2026-10-15); the scheduled task is described in the [October 30 block](handoff-2026-10-30-to-11-04-current-state.md) | not re-read |

- **The marathon on `master-20261103b`** (owner, 2026-11-04: "I just uploaded new data can you make sure all the analyses and site are full updated as well"; how it is adopted is the lead's Default, [register](../OWNER_DECISIONS.md#defaults-not-owner-decisions)): live. [`analysis/release.json`](../../analysis/release.json) `layout: master`, read through `analysis/adapt_master.py`, with weather and routes from `dataset-20261103-0706`; edition policy `RULES_MASTER_20261103B`; **4,222,246 eligible finishes in 218 editions and 27 cities, 1,298,524 sustained slowdowns (30.75%)** ([refresh record](../REFRESH_20261103b.md)). The six workflows that adapt the release pin Python 3.13.16 (the adapter records the interpreter in its manifest digest).
- **The half on the person IDs v4** (owner, 2026-10-31T02:20:30Z: "Yes you should adopt v4"): live on snapshot `half-dataset-20261030-1904`, person IDs `person-ids-v4-20261030-1150`, policy `analysis/half-policy-20261030-1904.json`, bound to `master-20261103b` ([half marathons](../HALF_MARATHON.md)).
- **The owner's answers of November 5, 2026** ([register](../OWNER_DECISIONS.md)): keep the half-to-marathon pairs, each labelled a comparison between distances, never one statistic of both (the label is on `feat/cross-distance-label`, not merged); and the producer answers for New York 2026 and the export, measured against the release the same day ([refresh record](../REFRESH_20261103b.md#producer-answers-november-5-2026)).
- **Anonymous access** (2026-11-05, 06:20:02–06:20:21 UTC): every asset of `master-20261103b` and `dataset-20261103-0706` and 1050's CORE archive answered a ranged GET with no token with 206 ([analysis/ACCESS.md](../../analysis/ACCESS.md)).
