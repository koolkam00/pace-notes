# The state sweep of November 20, 2026, before the merge of #101: replaced lines

> Moved here word for word on November 20, 2026 from the files named in each heading, as the branch `claude/release-20261113` of pull request #101 held them at `d5c8e9221`, when the sweep (branch `claude/release-20261113-sweep`) replaced those lines. The line numbers are that commit's. Each entry gives the line as it stood and the line as the sweep left it. Only the targets of relative links are re-pointed, so that they resolve from this folder. A table row or a list item stands here without its neighbours. Counts belong to the release they name; do not quote them as current.

Why the lines were replaced: on November 20, 2026, at about 17:15 UTC, the owner asked for the merge of #101 ("Merge all"; [register](../OWNER_DECISIONS.md)). The release intake's step 9 ([operations](../OPERATIONS.md#release-intake)) sweeps for the branch, since a sentence such as "on branch X, not merged" becomes false when the branch merges. The grep, run at `d5c8e9221`:

```
git grep -n -E "claude/release-20261113|not merged|not deployed|draft #101|draft pull request #?101|until it merges" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'
```

It matched 55 lines in 22 files; a case-insensitive search for "draft pull request #101" and "the go" found three more lines of the same kind (`docs/HALF_MARATHON.md` 161, `docs/KNOWN_ISSUES.md` 11, `docs/PROJECT_HANDOFF.md` 32), and three neighbours of a hit said the same state in other words (`docs/DATA_ARCHITECTURE.md` 139, `docs/OWNER_DECISIONS.md` 43, `docs/PROJECT_HANDOFF.md` 20). Each line that would be false or misleading on `main` once #101 merges was reworded so that it is true before and after the merge: a state such as "on the branch of draft #101, not merged, not deployed" became "in pull request #101", "since pull request #101" or a dated reading. No line says that #101 is merged or deployed; that record, with the merge commit, its time and the read of production, belongs to the next pull request (`AGENTS.md` rule 19). The lines left as they were: text inside a file's own History section, quoted owner decisions, dated evidence that stays true as dated, and general wording of the procedures. 46 lines in 22 files were replaced; two blocks were added and are not listed below: the first bullet of the handoff's Current state and the register's row of 2026-11-20.

## AGENTS.md

Line 9 of `AGENTS.md` at `d5c8e9221`.

**Line 9**

As it stood:

3. The checks for each kind of change are in [operations: checks by change type](../OPERATIONS.md#checks-by-change-type); calculation, import and per-release contracts are in [analysis/README.md](../../analysis/README.md); the adopted release's record is the newest `docs/REFRESH_<tag>.md` ([docs/REFRESH_20261113_1113.md](../REFRESH_20261113_1113.md), on the branch of draft #101 until it merges).

Now:

3. The checks for each kind of change are in [operations: checks by change type](../OPERATIONS.md#checks-by-change-type); calculation, import and per-release contracts are in [analysis/README.md](../../analysis/README.md); the adopted release's record is the newest `docs/REFRESH_<tag>.md` ([docs/REFRESH_20261113_1113.md](../REFRESH_20261113_1113.md)).

## analysis/ACCESS.md

Lines 3, 95 of `analysis/ACCESS.md` at `d5c8e9221`.

**Line 3**

As it stood:

Updated November 20, 2026 for **`pace-notes-marathon-half-20261113-1113`**, the release both pins name on the branch `claude/release-20261113` (draft pull request #101; not merged, not deployed). Production still serves `master-20261103b` (read 2026-11-20 00:26 UTC; what production serves is recorded in the [project handoff](../PROJECT_HANDOFF.md#current-state)); that release's section is [below](../../analysis/ACCESS.md#the-master-20261103b-release-november-5-2026-historical). Full source records, recorded names, overlays and the producer's documents are public research material. Files are compressed or plain, never encrypted.

Now:

Updated November 20, 2026 for **`pace-notes-marathon-half-20261113-1113`**, the release both pins name since pull request #101 (the adoption of the combined release; the owner asked for its merge on November 20, 2026). Production served `master-20261103b` when read on 2026-11-20 at 00:26 UTC (what production serves is recorded in the [project handoff](../PROJECT_HANDOFF.md#current-state)); that release's section is [below](../../analysis/ACCESS.md#the-master-20261103b-release-november-5-2026-historical). Full source records, recorded names, overlays and the producer's documents are public research material. Files are compressed or plain, never encrypted.

**Line 95**

As it stood:

**Production's half pin, superseded on the branch (November 20, 2026).** On `claude/release-20261113` (draft pull request #101) `analysis/half-release.json` (schema 4) names `pace-notes-marathon-half-20261113-1113` and reads the half from the same assets as the marathon ([above](../../analysis/ACCESS.md#pace-notes-marathon-half-20261113-1113-adopted-on-the-branch); [half marathon](../HALF_MARATHON.md#sources-and-access)). The text below describes the pin `main` and production still use.

Now:

**The half pin before pull request #101 (November 20, 2026).** Since pull request #101 `analysis/half-release.json` (schema 4) names `pace-notes-marathon-half-20261113-1113` and reads the half from the same assets as the marathon ([above](../../analysis/ACCESS.md#pace-notes-marathon-half-20261113-1113-adopted-on-the-branch); [half marathon](../HALF_MARATHON.md#sources-and-access)). The text below describes the pin `main` held before it.

## analysis/README.md

Lines 15, 141 of `analysis/README.md` at `d5c8e9221`.

**Line 15**

As it stood:

On the branch of draft pull request #101 (`claude/release-20261113`; not merged, not deployed) the three pins name **`pace-notes-marathon-half-20261113-1113`** in `koolkam00/pace-notes`, a combined release read through `analysis/adapt_combined.py` ([below](../../analysis/README.md#combined-release-adapted-input-identity-record-status-and-cohort)); its source, calculation and import evidence is in the [refresh record](../REFRESH_20261113_1113.md). `main` and production keep `master-20261103b` (since #89, `b35789b8`, squash-merged November 5, 2026; [refresh record](../REFRESH_20261103b.md)), whose pin is kept as `release-master-20261103b.json`. A pin selects an input. It does not certify a calculation, an import or a deployment: what production serves is a separate fact, recorded in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). The half-marathon pages read their own pin, `half-release.json` ([below](../../analysis/README.md#half-marathons-public-source-pages-show-aggregates)), which names the same release. Source files, calculations and output metadata keep metric units; miles and per-mile paces are website display conversions.

Now:

Since pull request #101 (the adoption of the combined release; the owner asked for its merge on November 20, 2026) the three pins name **`pace-notes-marathon-half-20261113-1113`** in `koolkam00/pace-notes`, a combined release read through `analysis/adapt_combined.py` ([below](../../analysis/README.md#combined-release-adapted-input-identity-record-status-and-cohort)); its source, calculation and import evidence is in the [refresh record](../REFRESH_20261113_1113.md). The release before it is `master-20261103b` (on `main` since #89, `b35789b8`, squash-merged November 5, 2026; [refresh record](../REFRESH_20261103b.md)), whose pin is kept as `release-master-20261103b.json`. A pin selects an input. It does not certify a calculation, an import or a deployment: what production serves is a separate fact, recorded in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). The half-marathon pages read their own pin, `half-release.json` ([below](../../analysis/README.md#half-marathons-public-source-pages-show-aggregates)), which names the same release. Source files, calculations and output metadata keep metric units; miles and per-mile paces are website display conversions.

**Line 141**

As it stood:

Written November 14, 2026, on branch `claude/release-20261113` (not merged, not deployed). Counts are of `pace-notes-marathon-half-20261113-1113`, measured November 14, 2026; the run is recorded in [pipeline-m2c.sh](../evidence/2026-11-14/release-20261113-1113/pipeline-m2c.sh). A combined release holds marathons and half marathons in one set of files. Four pipeline files stand between it and every builder, each frozen by digest, and no builder derives what one of them states:

Now:

Written November 14, 2026, for pull request #101. Counts are of `pace-notes-marathon-half-20261113-1113`, measured November 14, 2026; the run is recorded in [pipeline-m2c.sh](../evidence/2026-11-14/release-20261113-1113/pipeline-m2c.sh). A combined release holds marathons and half marathons in one set of files. Four pipeline files stand between it and every builder, each frozen by digest, and no builder derives what one of them states:

## docs/ALL_FINISHER_ANALYSES.md

Lines 31, 88, 143 of `docs/ALL_FINISHER_ANALYSES.md` at `d5c8e9221`.

**Line 31**

As it stood:

The source on the adoption branch is `pace-notes-marathon-half-20261113-1113` (November 19, 2026; not deployed): **7,820,442 raw records** and **4,124,026 eligible finishes** across **201 counted editions**; the context's weather covers 189 of them (3,955,561 finishes) and its terrain 178 (3,788,391 finishes).

Now:

The source since pull request #101 is `pace-notes-marathon-half-20261113-1113` (built November 19, 2026): **7,820,442 raw records** and **4,124,026 eligible finishes** across **201 counted editions**; the context's weather covers 189 of them (3,955,561 finishes) and its terrain 178 (3,788,391 finishes).

**Line 88**

As it stood:

**`pace-notes-marathon-half-20261113-1113` (November 19, 2026, adoption branch, not deployed).** Built on the marathon cohort (manifest `a812fa41…`) and the runner context bound to it (`69839b08…`). `public/data/all-finisher-context/evidence.json` (`as_of` 2026-11-19T16:42:42Z) is 14,431,916 bytes, SHA-256 `667550fdacd95214914b5904a64a81c9fbe56ed9f38af8226c6a131afa77952d`, with 1,520 filter rows and 23,141 supported groups (8,872 sparse groups omitted); `verify-all-finisher-context` recounted every group from the cohort.

Now:

**`pace-notes-marathon-half-20261113-1113` (November 19, 2026, pull request #101).** Built on the marathon cohort (manifest `a812fa41…`) and the runner context bound to it (`69839b08…`). `public/data/all-finisher-context/evidence.json` (`as_of` 2026-11-19T16:42:42Z) is 14,431,916 bytes, SHA-256 `667550fdacd95214914b5904a64a81c9fbe56ed9f38af8226c6a131afa77952d`, with 1,520 filter rows and 23,141 supported groups (8,872 sparse groups omitted); `verify-all-finisher-context` recounted every group from the cohort.

**Line 143**

As it stood:

Until October 18, 2026 seven research-archive routes (`/packs/r01_banking_time`, `r02_recover_slow_start`, `r34_pacing_risk_reward`, `r13_great_day_vs_consistency`, `r35_course_adaptation`, `r15_weather_penalty_who` and `s5_pacing_vs_difficult_day`, with their aliases) showed these broader views by default. The redesign closed the archive (branch state, not deployed; [SEO](../SEO.md#moved-addresses-october-18-2026)): those addresses are stubs that forward to `/methodology#downloads`, and the calculation data they read is unchanged.

Now:

Until October 18, 2026 seven research-archive routes (`/packs/r01_banking_time`, `r02_recover_slow_start`, `r34_pacing_risk_reward`, `r13_great_day_vs_consistency`, `r35_course_adaptation`, `r15_weather_penalty_who` and `s5_pacing_vs_difficult_day`, with their aliases) showed these broader views by default. The redesign (#71, merged October 20, 2026) closed the archive ([SEO](../SEO.md#moved-addresses-october-18-2026)): those addresses are stubs that forward to `/methodology#downloads`, and the calculation data they read is unchanged.

## docs/ANALYTICS.md

Line 87 of `docs/ANALYTICS.md` at `d5c8e9221`.

**Line 87**

As it stood:

- The race filters (November 19, 2026, on the branch of draft #101): the "Every marathon" finder on `/courses` (`components/races`, `RaceFinder`) and the finder on `/half/races` (`components/half/HalfRacesAll.client.tsx`) carry `ph-no-capture` on their roots, since the rows a typed filter leaves spell out what was typed; neither sends an event, changes the address or calls analytics (`verify-analytics` requires the class and the absence of analytics or address calls on the `/half/races` finder; the `/courses` finder has no such check yet). The results pages added to `/courses/<slug>` keep their path through `COURSE_SLUGS`, and `/half/races` through the literal page list in `lib/analytics-policy.ts`.

Now:

- The race filters (November 19, 2026, pull request #101): the "Every marathon" finder on `/courses` (`components/races`, `RaceFinder`) and the finder on `/half/races` (`components/half/HalfRacesAll.client.tsx`) carry `ph-no-capture` on their roots, since the rows a typed filter leaves spell out what was typed; neither sends an event, changes the address or calls analytics (`verify-analytics` requires the class and the absence of analytics or address calls on the `/half/races` finder; the `/courses` finder has no such check yet). The results pages added to `/courses/<slug>` keep their path through `COURSE_SLUGS`, and `/half/races` through the literal page list in `lib/analytics-policy.ts`.

## docs/DATA_ARCHITECTURE.md

Lines 5, 139, 140 of `docs/DATA_ARCHITECTURE.md` at `d5c8e9221`.

**Line 5**

As it stood:

**Adopted on the branch: `pace-notes-marathon-half-20261113-1113`** (draft pull request #101, branch `claude/release-20261113`; not merged, not deployed), a combined release for both distances with the person links v5.1, read through `analysis/adapt_combined.py` (7,820,442 written marathon records in 2,688 editions, 4,124,026 counted finishes in 201 editions; [refresh record](../REFRESH_20261113_1113.md)). [analysis/release.json](../../analysis/release.json), [analysis/weather-release.json](../../analysis/weather-release.json) and [analysis/half-release.json](../../analysis/half-release.json) name it in `tag`. **On `main` and in production: `master-20261103b`** (since #89, `b35789b8`, squash-merged November 5, 2026; [refresh record](../REFRESH_20261103b.md)). What production's `/data/live.json` names now is checked, with its date, in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). Earlier sources are in the [release history](../DATA_ARCHITECTURE.md#release-history).

Now:

**Adopted: `pace-notes-marathon-half-20261113-1113`**, in pull request #101 (the adoption of the combined release; the owner asked for its merge on November 20, 2026), a combined release for both distances with the person links v5.1, read through `analysis/adapt_combined.py` (7,820,442 written marathon records in 2,688 editions, 4,124,026 counted finishes in 201 editions; [refresh record](../REFRESH_20261113_1113.md)). [analysis/release.json](../../analysis/release.json), [analysis/weather-release.json](../../analysis/weather-release.json) and [analysis/half-release.json](../../analysis/half-release.json) name it in `tag`. **The release before it: `master-20261103b`** (on `main` since #89, `b35789b8`, squash-merged November 5, 2026; [refresh record](../REFRESH_20261103b.md)). What production's `/data/live.json` names now is checked, with its date, in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). Earlier sources are in the [release history](../DATA_ARCHITECTURE.md#release-history).

**Line 139**

As it stood:

| `master-20261103b` | November 3 | 5,388,605 (CORE) | 299 | 4,222,246 | Adopted (#89, merged November 5); current on `main`; through `analysis/adapt_master.py`, overlays from `dataset-20261103-0706` | [master record](../REFRESH_20261103b.md) |

Now:

| `master-20261103b` | November 3 | 5,388,605 (CORE) | 299 | 4,222,246 | Adopted (#89, merged November 5); current on `main` before #101; through `analysis/adapt_master.py`, overlays from `dataset-20261103-0706` | [master record](../REFRESH_20261103b.md) |

**Line 140**

As it stood:

| `pace-notes-marathon-half-20261113-1113` | November 13 | 7,820,442 (written marathon rows) | 2,688 (201 counted) | 4,124,026 | On the branch of draft #101 (not merged); through `analysis/adapt_combined.py` | [combined record](../REFRESH_20261113_1113.md) |

Now:

| `pace-notes-marathon-half-20261113-1113` | November 13 | 7,820,442 (written marathon rows) | 2,688 (201 counted) | 4,124,026 | Adopted in pull request #101 (its merge requested November 20); through `analysis/adapt_combined.py` | [combined record](../REFRESH_20261113_1113.md) |

## docs/DESIGN_SYSTEM.md

Lines 3, 60, 143 of `docs/DESIGN_SYSTEM.md` at `d5c8e9221`.

**Line 3**

As it stood:

The site's design system: how a page is built, how it ends, its type, colour, space, components and copy rules, how it is checked, and how a visual change is reviewed. It describes the code on `main`. Until draft #101 merges, the [tier and link labels](../DESIGN_SYSTEM.md#tier-and-link-labels) section (the tier module, with the record words of decision D49 and the edition tables' key of D48) and the edition tables' phone stacking describe the branch `claude/release-20261113` (head `414cd4fcc` on November 20, 2026), not `main`. The redesign that set it merged as `c6744791` (#71) on October 20, 2026; later work (the Top 100 charts, the terrain splits, the half marathon) follows it. What is deployed is in the [project handoff](../PROJECT_HANDOFF.md#current-state).

Now:

The site's design system: how a page is built, how it ends, its type, colour, space, components and copy rules, how it is checked, and how a visual change is reviewed. It describes the code on `main`. The [tier and link labels](../DESIGN_SYSTEM.md#tier-and-link-labels) section (the tier module, with the record words of decision D49 and the edition tables' key of D48) and the edition tables' phone stacking came with pull request #101 (the adoption of the combined release; the owner asked for its merge on November 20, 2026). The redesign that set it merged as `c6744791` (#71) on October 20, 2026; later work (the Top 100 charts, the terrain splits, the half marathon) follows it. What is deployed is in the [project handoff](../PROJECT_HANDOFF.md#current-state).

**Line 60**

As it stood:

Added November 14, 2026 with the adoption of `pace-notes-marathon-half-20261113-1113`, on the adoption branch `claude/release-20261113`; it is not on `main` or the live site until that branch merges. In that release every edition (one race in one year) has a verification tier, a split tier and a timing basis, and every link between a runner's results has a confidence. One module says them, so no page writes a badge or its words by hand (lead decision D16).

Now:

Added November 14, 2026 with the adoption of `pace-notes-marathon-half-20261113-1113`, in pull request #101 (the owner asked for its merge on November 20, 2026). In that release every edition (one race in one year) has a verification tier, a split tier and a timing basis, and every link between a runner's results has a confidence. One module says them, so no page writes a badge or its words by hand (lead decision D16).

**Line 143**

As it stood:

`node scripts/verify-tiers.cjs` fails when the module's words, codes, forms or anchors differ from the tables above; when a tier, split tier, timing-basis text or link confidence in the pinned release's checked-in files (the release contract and the edition directory in its evidence folder, and the marathon cohort manifest) has no words and no class; when the timing classes differ from the linked-records module's (`analysis/linked_common.py`, once the tree holds it; `--linked=<file>` before that) or the identity reasons from `analysis/build_identity.py`; when a function accepts what it should refuse; when a label does not render as a link to its anchor and as a bare label; when `/methodology` lacks one of the two ids, a label's meaning, or types a number in those definitions; when the styles drift from the evidence badge's and the scope chip's declarations, use a token those do not (the quiet words alone take `--ink-3`), or stop wrapping; and when any other file under `app/`, `components/` or `lib/` writes a phrase or a label class. The uses that stood before the module are the verifier's `BASELINE`, each listed with its file, counted and printed on every run, and a new use or a stale entry fails. `--list` prints every use it finds, `--self-test` checks the checker against planted mistakes, and `--source=<folders>` recounts the codes from the release's own files (the edition table, `EDITION-TIERS.csv`, the link file and the identity file; it needs Python with DuckDB). It runs in `npm run verify:data` (on the branch of draft #101, read November 20, 2026), and since November 20, 2026 it also holds the record words (decision D49) to the table under "What one result offers" and finds each beside its meaning under `#edition-tiers`. `scripts/verify-tools.cjs` also fails a tool file that names a label class.

Now:

`node scripts/verify-tiers.cjs` fails when the module's words, codes, forms or anchors differ from the tables above; when a tier, split tier, timing-basis text or link confidence in the pinned release's checked-in files (the release contract and the edition directory in its evidence folder, and the marathon cohort manifest) has no words and no class; when the timing classes differ from the linked-records module's (`analysis/linked_common.py`, once the tree holds it; `--linked=<file>` before that) or the identity reasons from `analysis/build_identity.py`; when a function accepts what it should refuse; when a label does not render as a link to its anchor and as a bare label; when `/methodology` lacks one of the two ids, a label's meaning, or types a number in those definitions; when the styles drift from the evidence badge's and the scope chip's declarations, use a token those do not (the quiet words alone take `--ink-3`), or stop wrapping; and when any other file under `app/`, `components/` or `lib/` writes a phrase or a label class. The uses that stood before the module are the verifier's `BASELINE`, each listed with its file, counted and printed on every run, and a new use or a stale entry fails. `--list` prints every use it finds, `--self-test` checks the checker against planted mistakes, and `--source=<folders>` recounts the codes from the release's own files (the edition table, `EDITION-TIERS.csv`, the link file and the identity file; it needs Python with DuckDB). It runs in `npm run verify:data` (since pull request #101, read November 20, 2026), and since November 20, 2026 it also holds the record words (decision D49) to the table under "What one result offers" and finds each beside its meaning under `#edition-tiers`. `scripts/verify-tools.cjs` also fails a tool file that names a label class.

## docs/FAST_START_ANALYSIS.md

Line 17 of `docs/FAST_START_ANALYSIS.md` at `d5c8e9221`.

**Line 17**

As it stood:

Both committed files bind `pace-notes-marathon-half-20261113-1113` and the marathon cohort (manifest `a812fa41…`), built on November 19, 2026 on the adoption branch (not deployed).

Now:

Both committed files bind `pace-notes-marathon-half-20261113-1113` and the marathon cohort (manifest `a812fa41…`), built on November 19, 2026 for pull request #101.

## docs/HALF_MARATHON.md

Lines 130, 161 of `docs/HALF_MARATHON.md` at `d5c8e9221`.

**Line 130**

As it stood:

- **Repository state.** Integrated on `claude/release-20261113`, the head of draft pull request #101 (opened 2026-11-19, base `main`, not merged), from the half branch `claude/release-20261113-half` (`0e679c034`) and the integration's ordered rebuild (stories, then charts, then the half; `43af698ca`, `be2f2ef05`). The pin `analysis/half-release.json` names `pace-notes-marathon-half-20261113-1113` (key and tag), the identity file of person links v5.1 and the marathon cohort of the same release; the policy is `analysis/half-policy-20261113-1113.json`. The rules, floors and guards below were written in the section above before any build (commit `4d61be1c6`) and none changed after it.

Now:

- **Repository state.** Integrated in pull request #101 (opened 2026-11-19, base `main`; the owner asked for its merge on November 20, 2026), from the half branch `claude/release-20261113-half` (`0e679c034`) and the integration's ordered rebuild (stories, then charts, then the half; `43af698ca`, `be2f2ef05`). The pin `analysis/half-release.json` names `pace-notes-marathon-half-20261113-1113` (key and tag), the identity file of person links v5.1 and the marathon cohort of the same release; the policy is `analysis/half-policy-20261113-1113.json`. The rules, floors and guards below were written in the section above before any build (commit `4d61be1c6`) and none changed after it.

**Line 161**

As it stood:

- **Deployed state.** Not deployed: the owner's instruction holds the site until he gives the go. Production serves the build of `half-dataset-20261030-1904`; its last dated reads are in [the October 31 status](../HALF_MARATHON.md#status-october-31-2026) (now in History). Read `/version.json` and `/data/half/manifest.json` before calling any build live.

Now:

- **Deployed state.** The owner's instruction held the site until his go; he asked for the merge of #101 on November 20, 2026 ([register](../OWNER_DECISIONS.md)), and what production serves from then on is recorded in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). Before it, production served the build of `half-dataset-20261030-1904`; its last dated reads are in [the October 31 status](../HALF_MARATHON.md#status-october-31-2026) (now in History). Read `/version.json` and `/data/half/manifest.json` before calling any build live.

## docs/KNOWN_ISSUES.md

Lines 7, 11 of `docs/KNOWN_ISSUES.md` at `d5c8e9221`.

**Line 7**

As it stood:

Updated October 30, 2026; source line November 20, 2026. The source on `main` is `master-20261103b` (#89, merged as `b35789b8` on November 5, 2026); on the branch of draft #101 (not merged, not deployed) it is `pace-notes-marathon-half-20261113-1113` ([refresh record](../REFRESH_20261113_1113.md)); what production serves is in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). A row measured in 1050 or earlier was not re-measured under it unless the row says so. The [current refresh record](../REFRESH_20261103b.md) separates source, calculation, import and production evidence; the [1050 record](../REFRESH_20261021_1050.md), the [1652 record](../REFRESH_20261016_1652.md), the [0934 record](../REFRESH_20260912_0934.md) and the other implementation records remain dated historical evidence. **Measured in** names the release or source each row's evidence comes from: a row measured in an earlier release was not re-measured unless it says so. Site issues are in [their own table](../KNOWN_ISSUES.md#site).

Now:

Updated October 30, 2026; source line November 20, 2026. The source is `pace-notes-marathon-half-20261113-1113` since pull request #101 (the adoption of the combined release; the owner asked for its merge on November 20, 2026; [refresh record](../REFRESH_20261113_1113.md)); before it, `main` held `master-20261103b` (#89, merged as `b35789b8` on November 5, 2026); what production serves is in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). A row measured in 1050 or earlier was not re-measured under a later release unless the row says so. The [combined record](../REFRESH_20261113_1113.md) and the [master record](../REFRESH_20261103b.md) separate source, calculation, import and production evidence; the [1050 record](../REFRESH_20261021_1050.md), the [1652 record](../REFRESH_20261016_1652.md), the [0934 record](../REFRESH_20260912_0934.md) and the other implementation records remain dated historical evidence. **Measured in** names the release or source each row's evidence comes from: a row measured in an earlier release was not re-measured unless it says so. Site issues are in [their own table](../KNOWN_ISSUES.md#site).

**Line 11**

As it stood:

| Open, on the branch (November 20, 2026) | Every owned output rebuilt from `pace-notes-marathon-half-20261113-1113` | `pace-notes-marathon-half-20261113-1113` | The adapter, policy, identity and cohort, every marathon family, the half and the new families built and verified at `9aa61af43`: `verify:data` 35 of 35, build 327 pages, privacy 103 of 104 ([refresh record](../REFRESH_20261113_1113.md#checks-and-receipts)) | The owner's go; then the merge-ready commit removes the two `vercel.json` entries |

Now:

| Open, on the branch (November 20, 2026) | Every owned output rebuilt from `pace-notes-marathon-half-20261113-1113` | `pace-notes-marathon-half-20261113-1113` | The adapter, policy, identity and cohort, every marathon family, the half and the new families built and verified at `9aa61af43`: `verify:data` 35 of 35, build 327 pages, privacy 103 of 104 ([refresh record](../REFRESH_20261113_1113.md#checks-and-receipts)) | The owner asked for the merge on November 20, 2026 ([register](../OWNER_DECISIONS.md)); the merge-ready commit removes the two `vercel.json` entries, and the merge and the read of production are recorded in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state) |

## docs/LINKED_RECORDS.md

Lines 3, 17 of `docs/LINKED_RECORDS.md` at `d5c8e9221`.

**Line 3**

As it stood:

The family `public/data/linked/` follows marathon records that the producer's person links (v5.1) join to one runner: how the same linked runners finished in different years of one race and at different races, how often a recorded marathon was the runner's best so far, how the finish time changes per year of age in the same runner, and one matched comparison of being seen again after a sustained slowdown. It is built by `analysis/build_linked.py` from the adapted marathon input, verified by `scripts/verify-linked.cjs` (part of `npm run verify:data`) and tested by `analysis/test_linked.py` and `analysis/test_linked_build.py`. This document is the contract: what is pinned, the rules in words, the floors, the guards, what is published, what may be said and what must never be printed. Four stories read it on the branch of draft #101 (chapter 10, "Over the years"; `lib/linked-server.ts`), and `/methodology#linked-records` states its methods (November 20, 2026).

Now:

The family `public/data/linked/` follows marathon records that the producer's person links (v5.1) join to one runner: how the same linked runners finished in different years of one race and at different races, how often a recorded marathon was the runner's best so far, how the finish time changes per year of age in the same runner, and one matched comparison of being seen again after a sustained slowdown. It is built by `analysis/build_linked.py` from the adapted marathon input, verified by `scripts/verify-linked.cjs` (part of `npm run verify:data`) and tested by `analysis/test_linked.py` and `analysis/test_linked_build.py`. This document is the contract: what is pinned, the rules in words, the floors, the guards, what is published, what may be said and what must never be printed. Four stories read it since pull request #101 (chapter 10, "Over the years"; `lib/linked-server.ts`), and `/methodology#linked-records` states its methods (November 20, 2026).

**Line 17**

As it stood:

- **Repository state.** Branch `claude/release-20261113-linked`, cut from `claude/release-20261113`. Not merged, no pull request. The family in `public/data/linked/` is built on the adoption's final inputs (release branch commit `99d760bed`) with both additions and every ruling above, and `verify-linked` passes (November 19, 2026; [Measured](../LINKED_RECORDS.md#measured)).

Now:

- **Repository state.** Built on the branch `claude/release-20261113-linked`, cut from `claude/release-20261113` and integrated into pull request #101. The family in `public/data/linked/` is built on the adoption's final inputs (release branch commit `99d760bed`) with both additions and every ruling above, and `verify-linked` passes (November 19, 2026; [Measured](../LINKED_RECORDS.md#measured)).

## docs/OPERATIONS.md

Lines 185, 271 of `docs/OPERATIONS.md` at `d5c8e9221`.

**Line 185**

As it stood:

9. **Sweep the documents for the previous release.** Use `git grep -n -E "<previous tag>|<its headline counts>" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'`, then update each hit or label it with its release. PR #78 (1050) updated eleven existing documents and added two refresh records. On October 30, 2026, six it did not touch (STORIES, TOOLS, TOP_TEN_ANALYSES, ANALYSIS_CATALOG, WEBSITE_ARCHITECTURE and SEO) still named the 1652 tag or its eligible count. Sweep for the branch as well (`git grep -n -E "<branch>|not merged|not deployed"` over the same paths): a sentence such as "on branch X, not merged" becomes false when the branch merges. On November 9, 2026, a review found 31 such lines in fifteen documents after #89, #90 and #91; they were swept on November 11, 2026 ([record](state-sweep-2026-11-11.md)).

Now:

9. **Sweep the documents for the previous release.** Use `git grep -n -E "<previous tag>|<its headline counts>" -- '*.md' ':!docs/history' ':!docs/REFRESH_*' ':!docs/evidence'`, then update each hit or label it with its release. PR #78 (1050) updated eleven existing documents and added two refresh records. On October 30, 2026, six it did not touch (STORIES, TOOLS, TOP_TEN_ANALYSES, ANALYSIS_CATALOG, WEBSITE_ARCHITECTURE and SEO) still named the 1652 tag or its eligible count. Sweep for the branch as well (`git grep -n -E "<branch>|not merged|not deployed"` over the same paths): a sentence such as "on branch X, not merged" becomes false when the branch merges. On November 9, 2026, a review found 31 such lines in fifteen documents after #89, #90 and #91; they were swept on November 11, 2026 ([record](state-sweep-2026-11-11.md)). The branch of #101 was swept on November 20, 2026, after the owner asked for its merge ([record](state-sweep-2026-11-20-merge.md)).

**Line 271**

As it stood:

Use [analysis/README.md](../../analysis/README.md) for the complete calculation and import contracts. The adopted source is the tag in `analysis/release.json` (repository `koolkam00/pace-notes`). On the branch of draft pull request #101 it is **`pace-notes-marathon-half-20261113-1113`**, adopted there on November 14–20, 2026 and not merged; `main` and production keep **`master-20261103b`** (merged as #89, `b35789b8`, on November 5, 2026). What production serves is recorded in the [project handoff](../PROJECT_HANDOFF.md#current-state). The [combined refresh](../REFRESH_20261113_1113.md) records source, calculation and import evidence; the [master refresh](../REFRESH_20261103b.md), the [1050 refresh](../REFRESH_20261021_1050.md) and the [1652 refresh](../REFRESH_20261016_1652.md) keep their own; `private-export-20261021-0829` was reviewed and **not adopted** ([review](../REFRESH_20261021_0829.md)).

Now:

Use [analysis/README.md](../../analysis/README.md) for the complete calculation and import contracts. The adopted source is the tag in `analysis/release.json` (repository `koolkam00/pace-notes`). Since pull request #101 (the adoption of the combined release; the owner asked for its merge on November 20, 2026) it is **`pace-notes-marathon-half-20261113-1113`**, adopted there on November 14–20, 2026; before it, `main` held **`master-20261103b`** (merged as #89, `b35789b8`, on November 5, 2026). What production serves is recorded in the [project handoff](../PROJECT_HANDOFF.md#current-state). The [combined refresh](../REFRESH_20261113_1113.md) records source, calculation and import evidence; the [master refresh](../REFRESH_20261103b.md), the [1050 refresh](../REFRESH_20261021_1050.md) and the [1652 refresh](../REFRESH_20261016_1652.md) keep their own; `private-export-20261021-0829` was reviewed and **not adopted** ([review](../REFRESH_20261021_0829.md)).

## docs/OWNER_DECISIONS.md

Lines 42, 43, 44 of `docs/OWNER_DECISIONS.md` at `d5c8e9221`.

**Line 42**

As it stood:

| 2026-11-13 | New data, at about 02:00 UTC, verbatim: "Update site with new data update analyses as needed  The new Pace Notes release is on the public repo koolkam00/pace-notes (use the newest release tag). It has the marathon CORE data in the same layout as last time, plus person_id v5.1 as a separate file that links each runner across races. Every edition has a tier: stamped, weaker-stamped (verified against a weaker source like MarathonGuide), partial, REVIEW, or unverified. Only stamped editions get the "verified" badge. Show weaker-stamped as verified with a weaker-source label, and finish-time-only editions as their own tier. Each person_id link has a confidence tier, including the new low_carryover and low_city_pace. Show the tier, and don't present low-confidence links as certain. Keep half-marathon and marathon stats separate unless a chart is explicitly comparing them. Don't infer sex from names or label anyone a wheelchair entrant by name. Use the README, data card and change report in the release for counts and caveats." (line breaks shown as spaces in this table). Read as adopting `pace-notes-marathon-half-20261113-1113`, published at 23:21 UTC that day. | — | the tier module and `verify-tiers`; the identity rule (`analysis/identity.json`); the edition policy; `AGENTS.md` rules 4 and 10 | [refresh record](../REFRESH_20261113_1113.md) (draft #101) |

Now:

| 2026-11-13 | New data, at about 02:00 UTC, verbatim: "Update site with new data update analyses as needed  The new Pace Notes release is on the public repo koolkam00/pace-notes (use the newest release tag). It has the marathon CORE data in the same layout as last time, plus person_id v5.1 as a separate file that links each runner across races. Every edition has a tier: stamped, weaker-stamped (verified against a weaker source like MarathonGuide), partial, REVIEW, or unverified. Only stamped editions get the "verified" badge. Show weaker-stamped as verified with a weaker-source label, and finish-time-only editions as their own tier. Each person_id link has a confidence tier, including the new low_carryover and low_city_pace. Show the tier, and don't present low-confidence links as certain. Keep half-marathon and marathon stats separate unless a chart is explicitly comparing them. Don't infer sex from names or label anyone a wheelchair entrant by name. Use the README, data card and change report in the release for counts and caveats." (line breaks shown as spaces in this table). Read as adopting `pace-notes-marathon-half-20261113-1113`, published at 23:21 UTC that day. | — | the tier module and `verify-tiers`; the identity rule (`analysis/identity.json`); the edition policy; `AGENTS.md` rules 4 and 10 | [refresh record](../REFRESH_20261113_1113.md) (pull request #101) |

**Line 43**

As it stood:

| 2026-11-14 | The rebuild, at about 01:00 UTC, verbatim: "Review this and rebuild and make as many new analyses you want or can. Work until your proud of the output and the new work. You have full creative freedom to change anything l the site with new data be creative with think of new interesting analysis and you can rebuild the site form the ground up as needed is as many tokens as you need work long and hard iterate until it's work your proud of and other people would value and use our of." It came with the release's intake note for the site builder, which the owner attached; that note names the owner in the third person and ends: "Don't deploy or turn the site back on (splithappens.run / live.json) until Andrew gives the go. Build and preview privately." | — | `vercel.json` switches deployments off for `claude/release-20261113*` until the merge-ready commit; `AGENTS.md` rule 24 | [refresh record](../REFRESH_20261113_1113.md) (draft #101) |

Now:

| 2026-11-14 | The rebuild, at about 01:00 UTC, verbatim: "Review this and rebuild and make as many new analyses you want or can. Work until your proud of the output and the new work. You have full creative freedom to change anything l the site with new data be creative with think of new interesting analysis and you can rebuild the site form the ground up as needed is as many tokens as you need work long and hard iterate until it's work your proud of and other people would value and use our of." It came with the release's intake note for the site builder, which the owner attached; that note names the owner in the third person and ends: "Don't deploy or turn the site back on (splithappens.run / live.json) until Andrew gives the go. Build and preview privately." | Its hold on deploying is lifted by the go of 2026-11-20 (below) | `vercel.json` switches deployments off for `claude/release-20261113*` until the merge-ready commit; `AGENTS.md` rule 24 | [refresh record](../REFRESH_20261113_1113.md) (pull request #101) |

**Line 44**

As it stood:

| 2026-11-19 | Three choices of the combined release, at about 22:30 UTC, verbatim: "Do you whatever you recommend you have full control", in answer to whether to (1) keep London 2026's three podium rows against the intake note's rule 7, (2) keep the counted-edition rule (verified, weaker-source, or partial within 5% of the official count) rather than verified tiers only, and (3) let medium-confidence links join a runner's races, with the lead's recommendation to keep all three as built. So the lead's decisions D33, D3 (with rulings R3 to R5) and D4 stand on the owner's approval. It does not lift the intake note's hold on deploying: a merge still needs the owner's request for the pull request | Answers three of the lead's defaults of 2026-11-14 ([below](../OWNER_DECISIONS.md#defaults-not-owner-decisions)) | `analysis/reviewed-row-exceptions.json`; `analysis/edition-policy-20261113-1113.json`; `analysis/identity.json` | [refresh record](../REFRESH_20261113_1113.md) (draft #101) |

Now:

| 2026-11-19 | Three choices of the combined release, at about 22:30 UTC, verbatim: "Do you whatever you recommend you have full control", in answer to whether to (1) keep London 2026's three podium rows against the intake note's rule 7, (2) keep the counted-edition rule (verified, weaker-source, or partial within 5% of the official count) rather than verified tiers only, and (3) let medium-confidence links join a runner's races, with the lead's recommendation to keep all three as built. So the lead's decisions D33, D3 (with rulings R3 to R5) and D4 stand on the owner's approval. It does not lift the intake note's hold on deploying: a merge still needs the owner's request for the pull request | Answers three of the lead's defaults of 2026-11-14 ([below](../OWNER_DECISIONS.md#defaults-not-owner-decisions)) | `analysis/reviewed-row-exceptions.json`; `analysis/edition-policy-20261113-1113.json`; `analysis/identity.json` | [refresh record](../REFRESH_20261113_1113.md) (pull request #101) |

## docs/PROJECT_HANDOFF.md

Lines 14, 20, 21, 22, 32, 88, 90 of `docs/PROJECT_HANDOFF.md` at `d5c8e9221`.

**Line 14**

As it stood:

| The adoption | `claude/release-20261113` at `9aa61af43`, the head of draft pull request #101 (opened 2026-11-19, base `main`): **not merged, not deployed**. `vercel.json` switches deployments off for `claude/release-20261113` and `claude/release-20261113*`; the two entries leave only in the merge-ready commit, after the owner's go | `git ls-remote` and the pull request (00:33 UTC); `vercel.json` read |

Now:

| The adoption | `claude/release-20261113` at `9aa61af43`, the head of draft pull request #101 (opened 2026-11-19, base `main`): not merged and not deployed at that read. `vercel.json` switches deployments off for `claude/release-20261113` and `claude/release-20261113*`; the two entries leave only in the merge-ready commit, after the owner's go | `git ls-remote` and the pull request (00:33 UTC); `vercel.json` read |

**Line 20**

As it stood:

- **The combined release, on the branch** ([refresh record](../REFRESH_20261113_1113.md)): every marathon analysis and the half rebuilt from `pace-notes-marathon-half-20261113-1113` through `analysis/adapt_combined.py`, under a new edition policy (201 counted editions in 28 race labels; 4,124,026 finishes; 1,288,216 sustained slowdowns, 31.24%, against production's 4,222,246 and 30.75% on `master-20261103b`), one identity rule over both distances on the person links v5.1, and the names-free marathon cohort that every analysis binds. New on the branch: edition tiers on every page that names an edition, runner lookup v2 for both distances, the race directory (`/courses`: 804 marathons, 28 course pages and 35 results pages), `/half/races`, how halves are paced, and four linked-records stories (chapter 10 of 12). Top 100 charts: 94 published, 6 in fallback. None of it is on `main` or in production. The owner's decision of 2026-11-19 ("Do you whatever you recommend you have full control") approved three of its choices ([register](../OWNER_DECISIONS.md)); it is not a go to merge or deploy.

Now:

- **The combined release, in #101** ([refresh record](../REFRESH_20261113_1113.md)): every marathon analysis and the half rebuilt from `pace-notes-marathon-half-20261113-1113` through `analysis/adapt_combined.py`, under a new edition policy (201 counted editions in 28 race labels; 4,124,026 finishes; 1,288,216 sustained slowdowns, 31.24%, against production's 4,222,246 and 30.75% on `master-20261103b`), one identity rule over both distances on the person links v5.1, and the names-free marathon cohort that every analysis binds. New in #101: edition tiers on every page that names an edition, runner lookup v2 for both distances, the race directory (`/courses`: 804 marathons, 28 course pages and 35 results pages), `/half/races`, how halves are paced, and four linked-records stories (chapter 10 of 12). Top 100 charts: 94 published, 6 in fallback. None of it was on `main` or in production at the check above. The owner's decision of 2026-11-19 ("Do you whatever you recommend you have full control") approved three of its choices ([register](../OWNER_DECISIONS.md)); it was not a go to merge or deploy (the go came on 2026-11-20: first bullet).

**Line 21**

As it stood:

- **The review of the branch and its fix round** (2026-11-20, after the check above): an independent reviewer read the branch at `9aa61af43` (no blocker, nine major and eleven minor findings; its recount of 32 printed figures and 20 tier labels matched). The fix round's branches were merged into `claude/release-20261113`, whose head is `414cd4fcc` (pushed 2026-11-20 03:09 UTC, read with `git ls-remote`): course pages name finishes with all splits and count counted editions, an edition table says a label true of most rows once in its key and stacks on a phone, the fast-and-slow-years hero counts verdicts, the runner rows' record words joined the tier module, `/half/races` opens on its search, two chart fallbacks state no reading, and the story route's first-load figure was re-measured with its reason ([SEO](../SEO.md#course-pages-october-2026), [stories](../STORIES.md), [design system](../DESIGN_SYSTEM.md#tier-and-link-labels), [half marathon](../HALF_MARATHON.md), [Top 100 charts](../TOP_100_CHARTS.md#evidence), [operations](../OPERATIONS.md#first-load-budgets-s8)). On `414cd4fcc` the integrator's run of `npm run verify:data` passed as one chain (35 steps) and `npm run build` built 327 pages; the privacy suite and the layout lint had not reported when this was written. Nothing of it is merged into `main` or deployed; production serves `fbe41078`, as read above.

Now:

- **The review of the branch and its fix round** (2026-11-20, after the check above): an independent reviewer read the branch at `9aa61af43` (no blocker, nine major and eleven minor findings; its recount of 32 printed figures and 20 tier labels matched). The fix round's branches were merged into `claude/release-20261113`, whose head is `414cd4fcc` (pushed 2026-11-20 03:09 UTC, read with `git ls-remote`): course pages name finishes with all splits and count counted editions, an edition table says a label true of most rows once in its key and stacks on a phone, the fast-and-slow-years hero counts verdicts, the runner rows' record words joined the tier module, `/half/races` opens on its search, two chart fallbacks state no reading, and the story route's first-load figure was re-measured with its reason ([SEO](../SEO.md#course-pages-october-2026), [stories](../STORIES.md), [design system](../DESIGN_SYSTEM.md#tier-and-link-labels), [half marathon](../HALF_MARATHON.md), [Top 100 charts](../TOP_100_CHARTS.md#evidence), [operations](../OPERATIONS.md#first-load-budgets-s8)). On `414cd4fcc` the integrator's run of `npm run verify:data` passed as one chain (35 steps) and `npm run build` built 327 pages; the privacy suite and the layout lint had not reported when this was written. None of it was merged into `main` or deployed at that time; production served `fbe41078`, as read above.

**Line 22**

As it stood:

- **The second review and its fixes** (2026-11-20): a second independent reviewer read `414cd4fcc` (no blocker; the first round's fixes hold; every figure it recounted matched; no check was weakened; open: two major and three minor findings). On `414cd4fcc` the integrator's layout lint had 1 failing check in 52 runs and `npm run autopilot:privacy` passed 103 of 104 jobs in the full run (one `/runners` job failed once and passed on three re-runs). The fixes and the rebuilt runner-search name index were merged into `claude/release-20261113` at `90128daf5` (pushed 2026-11-20, read with `git ls-remote` at 05:06 UTC): an edition table's key says a label only when it is true of more than half the rows and of all but at most three, and results pages list their newest year first ([SEO](../SEO.md#course-pages-october-2026), [design system](../DESIGN_SYSTEM.md#tier-and-link-labels)); the recorded-bests second heading no longer answers the guess above it, and the fast-and-slow-years field figure marks the picked race and keeps its labels apart ([stories](../STORIES.md)); `/methodology` is back under ten phone screens with every linked id opening its fold ([design system](../DESIGN_SYSTEM.md)); a runner-search row of several results names its first and latest race, from two new columns of the name index, with the profile files byte for byte as before ([runners and the report](../RUNNERS_AND_REPORT.md#the-pages-what-a-visitor-sees-lookup-version-2)). On `90128daf5` the integrator's run of `npm run verify:data` passed as one chain (35 steps), the Python suite passed (490 tests), `npm run build` built 327 pages, the layout lint had 0 failing checks in 80 runs and `npm run autopilot:privacy` passed 104 of 104 jobs. Nothing of it is merged into `main` or deployed; production serves `fbe41078`, as read above.

Now:

- **The second review and its fixes** (2026-11-20): a second independent reviewer read `414cd4fcc` (no blocker; the first round's fixes hold; every figure it recounted matched; no check was weakened; open: two major and three minor findings). On `414cd4fcc` the integrator's layout lint had 1 failing check in 52 runs and `npm run autopilot:privacy` passed 103 of 104 jobs in the full run (one `/runners` job failed once and passed on three re-runs). The fixes and the rebuilt runner-search name index were merged into `claude/release-20261113` at `90128daf5` (pushed 2026-11-20, read with `git ls-remote` at 05:06 UTC): an edition table's key says a label only when it is true of more than half the rows and of all but at most three, and results pages list their newest year first ([SEO](../SEO.md#course-pages-october-2026), [design system](../DESIGN_SYSTEM.md#tier-and-link-labels)); the recorded-bests second heading no longer answers the guess above it, and the fast-and-slow-years field figure marks the picked race and keeps its labels apart ([stories](../STORIES.md)); `/methodology` is back under ten phone screens with every linked id opening its fold ([design system](../DESIGN_SYSTEM.md)); a runner-search row of several results names its first and latest race, from two new columns of the name index, with the profile files byte for byte as before ([runners and the report](../RUNNERS_AND_REPORT.md#the-pages-what-a-visitor-sees-lookup-version-2)). On `90128daf5` the integrator's run of `npm run verify:data` passed as one chain (35 steps), the Python suite passed (490 tests), `npm run build` built 327 pages, the layout lint had 0 failing checks in 80 runs and `npm run autopilot:privacy` passed 104 of 104 jobs. None of it was merged into `main` or deployed at that time; production served `fbe41078`, as read above.

**Line 32**

As it stood:

1. **The combined release: the go.** Draft pull request #101 rebuilds the site on `pace-notes-marathon-half-20261113-1113` ([refresh record](../REFRESH_20261113_1113.md)). Your intake note holds it: "Don't deploy or turn the site back on (splithappens.run / live.json) until Andrew gives the go. Build and preview privately." Merging needs your request for #101, quoted and dated in it ([AGENTS.md](../../AGENTS.md) rule 24); the commit that makes it ready removes the two `vercel.json` entries that keep its branches from deploying. Your decision of 2026-11-19 ("Do you whatever you recommend you have full control") settled three questions as the lead recommended: London 2026's three podium rows stay against the intake note's rule 7; the counted-edition rule stands (verified, weaker source, or partial within 5% of the official count); `medium` links join a runner's races ([register](../OWNER_DECISIONS.md)). Still yours, from the pull request's description and the adoption's record (each a default of the lead until you answer, [register](../OWNER_DECISIONS.md#defaults-not-owner-decisions)):

Now:

1. **The combined release: the go (asked for on 2026-11-20).** Pull request #101 rebuilds the site on `pace-notes-marathon-half-20261113-1113` ([refresh record](../REFRESH_20261113_1113.md)). Your intake note held it: "Don't deploy or turn the site back on (splithappens.run / live.json) until Andrew gives the go. Build and preview privately." You asked for its merge on 2026-11-20 ("Merge all", about 17:15 UTC; [register](../OWNER_DECISIONS.md)), to be quoted and dated in #101 ([AGENTS.md](../../AGENTS.md) rule 24); the commit that makes it ready removes the two `vercel.json` entries that keep its branches from deploying. Your decision of 2026-11-19 ("Do you whatever you recommend you have full control") settled three questions as the lead recommended: London 2026's three podium rows stay against the intake note's rule 7; the counted-edition rule stands (verified, weaker source, or partial within 5% of the official count); `medium` links join a runner's races ([register](../OWNER_DECISIONS.md)). Still yours, from the pull request's description and the adoption's record (each a default of the lead until you answer, [register](../OWNER_DECISIONS.md#defaults-not-owner-decisions)):

**Line 88**

As it stood:

Every merged pull request below is an ancestor of `fbe41078`, the production build checked above; #101 is not merged. The earlier opening line is in [history](handoff-2026-11-20-current-state-before-release-20261113.md#recent-changes-the-opening-line).

Now:

Every merged pull request below is an ancestor of `fbe41078`, the production build checked above; #101 was not merged at that check. The earlier opening line is in [history](handoff-2026-11-20-current-state-before-release-20261113.md#recent-changes-the-opening-line).

**Line 90**

As it stood:

- **#101, the combined release** (draft, branch `claude/release-20261113`, head `9aa61af43`; not merged, not deployed; head `414cd4fcc` since the review's fix round of 2026-11-20, and `90128daf5` since the second review's fixes of the same day). Record: [refresh record](../REFRESH_20261113_1113.md).

Now:

- **#101, the combined release** (branch `claude/release-20261113`; head `9aa61af43` at the check above, `414cd4fcc` after the review's fix round of 2026-11-20, `90128daf5` after the second review's fixes and `d5c8e9221` when the owner asked for its merge on 2026-11-20; the merge and its record follow in the next pull request). Record: [refresh record](../REFRESH_20261113_1113.md).

## docs/RACES.md

Lines 23, 26 of `docs/RACES.md` at `d5c8e9221`.

**Line 23**

As it stood:

- **Repository.** Branch `claude/release-20261113-races`, cut from `claude/release-20261113`. Not merged.

Now:

- **Repository.** Built on the branch `claude/release-20261113-races`, cut from `claude/release-20261113`, and integrated into pull request #101.

**Line 26**

As it stood:

- **Deployed.** Nothing. The release branch is not deployed and no page reads the family yet.

Now:

- **Deployed.** Recorded in the handoff's [Current state](../PROJECT_HANDOFF.md#current-state). Since pull request #101 the race list on `/courses` and the results pages read the family ([website architecture](../WEBSITE_ARCHITECTURE.md)).

## docs/RUNNERS_AND_REPORT.md

Line 5 of `docs/RUNNERS_AND_REPORT.md` at `d5c8e9221`.

**Line 5**

As it stood:

**State on November 20, 2026 (branch `claude/release-20261113`, draft #101, head `414cd4fcc`; not merged, not deployed).** This document describes **runner lookup version 2**: its builder (`analysis/build_runner_lookup.py`), format (`analysis/lookup_format.py`), reference decoder and search planner (`scripts/lib/lookup.cjs`, with `scripts/lib/lookup-files.cjs` for Node scripts), verifier (`scripts/verify-lookup.cjs`) and source-side audit (`analysis/lookup_audit.py`) are in the repository and tested, the one final build of the release is imported in `public/data/runners` (schema 2; the version 1 files are removed), and the browser client (`lib/runner-search.ts`, `components/RunnerSearch.tsx`, `components/runner/`) and the review round's fixes of November 20, 2026 are merged into that branch. The second review's fixes and the name index rebuilt with each row's first and latest race followed the same day (head `90128daf5`). Version 1's contract is kept word for word under [History](../RUNNERS_AND_REPORT.md#history), as is this line's earlier wording. The sections [Copy editions](../RUNNERS_AND_REPORT.md#copy-editions) and [Race report](../RUNNERS_AND_REPORT.md#race-report) describe pages that are unchanged.

Now:

**State on November 20, 2026 (pull request #101, head `414cd4fcc`; the owner asked for its merge on November 20, 2026).** This document describes **runner lookup version 2**: its builder (`analysis/build_runner_lookup.py`), format (`analysis/lookup_format.py`), reference decoder and search planner (`scripts/lib/lookup.cjs`, with `scripts/lib/lookup-files.cjs` for Node scripts), verifier (`scripts/verify-lookup.cjs`) and source-side audit (`analysis/lookup_audit.py`) are in the repository and tested, the one final build of the release is imported in `public/data/runners` (schema 2; the version 1 files are removed), and the browser client (`lib/runner-search.ts`, `components/RunnerSearch.tsx`, `components/runner/`) and the review round's fixes of November 20, 2026 are merged into that branch. The second review's fixes and the name index rebuilt with each row's first and latest race followed the same day (head `90128daf5`). Version 1's contract is kept word for word under [History](../RUNNERS_AND_REPORT.md#history), as is this line's earlier wording. The sections [Copy editions](../RUNNERS_AND_REPORT.md#copy-editions) and [Race report](../RUNNERS_AND_REPORT.md#race-report) describe pages that are unchanged.

## docs/RUNNER_CONTEXT_AND_PEERS.md

Line 5 of `docs/RUNNER_CONTEXT_AND_PEERS.md` at `d5c8e9221`.

**Line 5**

As it stood:

**Built on the marathon cohort of `pace-notes-marathon-half-20261113-1113`** (November 14, 2026, adoption branch; not deployed). The context binds the marathon cohort (`analysis/marathon-cohort`, read through `analysis/cohort.py`), no longer the runner lookup: 7,820,442 raw records, 201 counted editions and 4,124,026 eligible finishes: 201 edition files, 1,979 peer groups, 15,318 pace groups and 5,992,384 exact finish-distribution cells; weather context for 189 editions and terrain for 178. `public/data/runner-context/manifest.json` (SHA-256 `69839b0886459e2b681b84b61baa61a97b6e51072e80091c8c1e8f0d4646dc83`, `as_of` `2026-11-19T15:55:26Z`; rebuilt on November 19, 2026 from committed scripts, because the November 14 build `7b9beb53…` named an uncommitted `build_weather.py`; its counts are the same) names the cohort manifest SHA-256 `a812fa41079b7632b014993d8764dc7ba2a009384803c1b3ab0b1480154e2299` (`as_of` `2026-11-14T15:24:11Z`) in `cohort_manifest_sha256`, and again in `runner_manifest_sha256` and `runner_manifest_as_of`, which keep their names from the time the context bound the runner manifest. The input is the adapted folder whose `MANIFEST.json` has SHA-256 `e994ac1590d8b3204c02cc6327c83cb7315b5cc5fd2914a445f07fa809ba085c`.

Now:

**Built on the marathon cohort of `pace-notes-marathon-half-20261113-1113`** (November 14, 2026, pull request #101). The context binds the marathon cohort (`analysis/marathon-cohort`, read through `analysis/cohort.py`), no longer the runner lookup: 7,820,442 raw records, 201 counted editions and 4,124,026 eligible finishes: 201 edition files, 1,979 peer groups, 15,318 pace groups and 5,992,384 exact finish-distribution cells; weather context for 189 editions and terrain for 178. `public/data/runner-context/manifest.json` (SHA-256 `69839b0886459e2b681b84b61baa61a97b6e51072e80091c8c1e8f0d4646dc83`, `as_of` `2026-11-19T15:55:26Z`; rebuilt on November 19, 2026 from committed scripts, because the November 14 build `7b9beb53…` named an uncommitted `build_weather.py`; its counts are the same) names the cohort manifest SHA-256 `a812fa41079b7632b014993d8764dc7ba2a009384803c1b3ab0b1480154e2299` (`as_of` `2026-11-14T15:24:11Z`) in `cohort_manifest_sha256`, and again in `runner_manifest_sha256` and `runner_manifest_as_of`, which keep their names from the time the context bound the runner manifest. The input is the adapted folder whose `MANIFEST.json` has SHA-256 `e994ac1590d8b3204c02cc6327c83cb7315b5cc5fd2914a445f07fa809ba085c`.

## docs/SEO.md

Lines 98, 115, 117 of `docs/SEO.md` at `d5c8e9221`.

**Line 98**

As it stood:

- **New pages of the combined release** (November 19, 2026, on the branch of draft #101; not deployed): the 35 results pages join `COURSE_SLUGS` and the sitemap with the course pages; `/half/races` is added to the sitemap in `lib/seo-routes.ts` (`add('/half/races', 'content', 'half')`); the four stories of chapter 10 (`/stories/fast-and-slow-years`, `/stories/race-to-race`, `/stories/recorded-bests`, `/stories/getting-older`) are in the sitemap through `lib/stories.ts`. Their `CONTENT_DATES` and `published` dates hold 2026-11-19 and move to the merge day in the merge-ready commit ([known issues](../KNOWN_ISSUES.md)). `verify-seo` passed 27 of 27 on the export of `9aa61af43` (2026-11-20).

Now:

- **New pages of the combined release** (November 19, 2026, pull request #101): the 35 results pages join `COURSE_SLUGS` and the sitemap with the course pages; `/half/races` is added to the sitemap in `lib/seo-routes.ts` (`add('/half/races', 'content', 'half')`); the four stories of chapter 10 (`/stories/fast-and-slow-years`, `/stories/race-to-race`, `/stories/recorded-bests`, `/stories/getting-older`) are in the sitemap through `lib/stories.ts`. Their `CONTENT_DATES` and `published` dates held 2026-11-19 on November 20, 2026 and take the merge day in the merge-ready commit ([known issues](../KNOWN_ISSUES.md)). `verify-seo` passed 27 of 27 on the export of `9aa61af43` (2026-11-20).

**Line 115**

As it stood:

**Results pages (November 19, 2026; branch `claude/release-20261113-m6`, not on `main`).** A race the race directory marks `results` (`public/data/races/pages.json`; docs/RACES.md rule 8) has a page at `/courses/<slug>` from the second template (`components/races/ResultsPage.tsx`). Title `{race}: Finish Times by Year | Pace Notes` (the brand dropped past 60 characters); description "{race} in {place}: the median finish of each year and every edition from {first} to {last}, with the status of its results." (the place dropped past 155 characters). `lastmod` is `RESULTS_PAGES_WRITTEN` (`lib/seo-routes.ts`). Its sections are the hero, `#finish-times` (`chapter-2`, from three edition medians), `#editions`, `#find` (`cta`) and `#other-courses` (`related`); `verify-courses --html` holds that list, the H1, the "Finish times only" label, every edition row and figure against the race file, the links and the absence of any pacing word.

Now:

**Results pages (November 19, 2026; branch `claude/release-20261113-m6`, in pull request #101).** A race the race directory marks `results` (`public/data/races/pages.json`; docs/RACES.md rule 8) has a page at `/courses/<slug>` from the second template (`components/races/ResultsPage.tsx`). Title `{race}: Finish Times by Year | Pace Notes` (the brand dropped past 60 characters); description "{race} in {place}: the median finish of each year and every edition from {first} to {last}, with the status of its results." (the place dropped past 155 characters). `lastmod` is `RESULTS_PAGES_WRITTEN` (`lib/seo-routes.ts`). Its sections are the hero, `#finish-times` (`chapter-2`, from three edition medians), `#editions`, `#find` (`cta`) and `#other-courses` (`related`); `verify-courses --html` holds that list, the H1, the "Finish times only" label, every edition row and figure against the race file, the links and the absence of any pacing word.

**Line 117**

As it stood:

**Review round (November 20, 2026; on the branch of draft #101, not merged, not deployed).** A course page's medians and finish counts are of the finishes with all splits (`courses.json`; the cohort did not change), and the page says so wherever it states one (lead decision D46): the finish-times sentence opens "Among finishes with all splits, …" (`ALL_SPLITS` in `lib/nuggets/courses.ts`), and the readout, the All numbers rows ("Finishes with all splits", "Median of finishes with all splits, average edition") and the edition table's column take `FINISHES_ALL_SPLITS`. The hero's dek counts counted editions ("One counted edition, …" or "N counted editions, …"), and one line under it, the nugget `course.also`, names the years with results that are not counted and their tiers, linked to the edition table ("Results also for 2022–2025 (4 with partial results)."); `/courses` says "counted editions" too, in its A–Z note, its foot ("Fewer than three counted editions") and its chart key (review M9). In an edition table, on course and results pages alike, a label true of more than half the rows and of all but at most three of them (a tier, "Finish times only", "Gun times") is said once in a key above the table, with the years it is not true of ("…, except 2015.", or "…, every year."; the label and its ", except" never part at a line break), and rows show it only where they differ; a label true of fewer rows stays on the rows; a table of fewer than three rows keeps every label on its rows (`components/course/EditionKey.tsx`; lead decision D48, review M5; amended by D53 the same day, after the second review). Under 600 px each edition row stacks: its year and labels, then the median finish and the finishes, then every other figure after its column's name, a cell without a figure left out, so nothing scrolls sideways (review M4). A results page's reading names its years in the tier module's words: "a typical verified year", "a typical year (verified, weaker source)" where every one is a weaker-source stamp, "verified year (3 of 9 verified, weaker source)" where some are (`verifiedYearWords`; review m1), and it states no reading when the file's count of those years disagrees with the reading's. Warsaw's two series are named once, under the hero's dek (review m5). On `/courses` the results pages' list "Finish times by year" is folded, with its count in the summary (review m8: the hub had run to 6.9 phone screens), each row's years in tier words, and "Find any marathon" is a secondary button. A results page lists its editions newest year first, each edition once (`scripts/verify-courses.cjs` checks that the years strictly descend); the course pages' "All numbers" tables keep ascending order (lead decision D54, the second review's finding E4, November 20, 2026).

Now:

**Review round (November 20, 2026; pull request #101).** A course page's medians and finish counts are of the finishes with all splits (`courses.json`; the cohort did not change), and the page says so wherever it states one (lead decision D46): the finish-times sentence opens "Among finishes with all splits, …" (`ALL_SPLITS` in `lib/nuggets/courses.ts`), and the readout, the All numbers rows ("Finishes with all splits", "Median of finishes with all splits, average edition") and the edition table's column take `FINISHES_ALL_SPLITS`. The hero's dek counts counted editions ("One counted edition, …" or "N counted editions, …"), and one line under it, the nugget `course.also`, names the years with results that are not counted and their tiers, linked to the edition table ("Results also for 2022–2025 (4 with partial results)."); `/courses` says "counted editions" too, in its A–Z note, its foot ("Fewer than three counted editions") and its chart key (review M9). In an edition table, on course and results pages alike, a label true of more than half the rows and of all but at most three of them (a tier, "Finish times only", "Gun times") is said once in a key above the table, with the years it is not true of ("…, except 2015.", or "…, every year."; the label and its ", except" never part at a line break), and rows show it only where they differ; a label true of fewer rows stays on the rows; a table of fewer than three rows keeps every label on its rows (`components/course/EditionKey.tsx`; lead decision D48, review M5; amended by D53 the same day, after the second review). Under 600 px each edition row stacks: its year and labels, then the median finish and the finishes, then every other figure after its column's name, a cell without a figure left out, so nothing scrolls sideways (review M4). A results page's reading names its years in the tier module's words: "a typical verified year", "a typical year (verified, weaker source)" where every one is a weaker-source stamp, "verified year (3 of 9 verified, weaker source)" where some are (`verifiedYearWords`; review m1), and it states no reading when the file's count of those years disagrees with the reading's. Warsaw's two series are named once, under the hero's dek (review m5). On `/courses` the results pages' list "Finish times by year" is folded, with its count in the summary (review m8: the hub had run to 6.9 phone screens), each row's years in tier words, and "Find any marathon" is a secondary button. A results page lists its editions newest year first, each edition once (`scripts/verify-courses.cjs` checks that the years strictly descend); the course pages' "All numbers" tables keep ascending order (lead decision D54, the second review's finding E4, November 20, 2026).

## docs/STORIES.md

Line 98 of `docs/STORIES.md` at `d5c8e9221`.

**Line 98**

As it stood:

Added on the adoption branch of `pace-notes-marathon-half-20261113-1113` (`claude/release-20261113-m5`; not merged, not deployed). Four stories read the linked-records family (`public/data/linked/`, contract [linked records](../LINKED_RECORDS.md)) and open chapter 10, "Over the years", in part two after the weather; "Your race" and "The next one" became chapters 11 and 12.

Now:

Added on the adoption branch of `pace-notes-marathon-half-20261113-1113` (`claude/release-20261113-m5`, in pull request #101). Four stories read the linked-records family (`public/data/linked/`, contract [linked records](../LINKED_RECORDS.md)) and open chapter 10, "Over the years", in part two after the weather; "Your race" and "The next one" became chapters 11 and 12.

## docs/TOP_TEN_ANALYSES.md

Line 13 of `docs/TOP_TEN_ANALYSES.md` at `d5c8e9221`.

**Line 13**

As it stood:

Under `pace-notes-marathon-half-20261113-1113` (the engine calculated 2026-11-19T17:10:01Z on the branch of draft #101, not merged, not deployed; read from `summary.json` on November 20, 2026) the engine holds 4,124,026 eligible finishes, 1,402,378 of them with an exact age (34.0%) and 936,040 with a recent earlier-year benchmark, in 28 race labels plus All courses; one checkpoint file is 53.4 MB, near GitHub's 50 MB warning ([refresh record](../REFRESH_20261113_1113.md)). The figures under `master-20261103b`, which `main` and production serve, are in the line moved to [history](state-sweep-2026-11-20.md#docstop_ten_analysesmd); those under 1050 are in the [1050 refresh record](../REFRESH_20261021_1050.md). Earlier vintages are under [history](../TOP_TEN_ANALYSES.md#history-earlier-releases).

Now:

Under `pace-notes-marathon-half-20261113-1113` (the engine calculated 2026-11-19T17:10:01Z for pull request #101; read from `summary.json` on November 20, 2026) the engine holds 4,124,026 eligible finishes, 1,402,378 of them with an exact age (34.0%) and 936,040 with a recent earlier-year benchmark, in 28 race labels plus All courses; one checkpoint file is 53.4 MB, near GitHub's 50 MB warning ([refresh record](../REFRESH_20261113_1113.md)). The figures under `master-20261103b`, which `main` held before #101, are in the line moved to [history](state-sweep-2026-11-20.md#docstop_ten_analysesmd); those under 1050 are in the [1050 refresh record](../REFRESH_20261021_1050.md). Earlier vintages are under [history](../TOP_TEN_ANALYSES.md#history-earlier-releases).

## docs/WEATHER_ANALYSES.md

Lines 3, 67 of `docs/WEATHER_ANALYSES.md` at `d5c8e9221`.

**Line 3**

As it stood:

Recalculated November 19, 2026, from `pace-notes-marathon-half-20261113-1113` on the branch of draft pull request #101 (not merged, not deployed; both pins name it there): 3,955,561 finishes in 189 counted editions with a weather row; warming (+2.07, interval +1.52 to +2.62) and wind ready, humidity withheld, the same decisions as before ([current calculation evidence](../WEATHER_ANALYSES.md#current-calculation-evidence); [refresh record](../REFRESH_20261113_1113.md#what-moved-against-master-20261103b)). `main` and production keep the recalculation of November 4, 2026, from `master-20261103b` (4,162,015 finishes in 217 editions; [refresh record](../REFRESH_20261103b.md#refreshed-outputs)). The deployed state is in the [project handoff](../PROJECT_HANDOFF.md#current-state). [analysis/weather-release.json](../../analysis/weather-release.json) and [analysis/release.json](../../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs, and the supporting study uses it too. The release's weather rows cover the editions of the earlier universe only, so the newly counted editions (Los Angeles, Austin 2022–2024, Oklahoma City 2025, Toronto Waterfront) and New York 2026 have none.

Now:

Recalculated November 19, 2026, from `pace-notes-marathon-half-20261113-1113` in pull request #101 (both pins name it there): 3,955,561 finishes in 189 counted editions with a weather row; warming (+2.07, interval +1.52 to +2.62) and wind ready, humidity withheld, the same decisions as before ([current calculation evidence](../WEATHER_ANALYSES.md#current-calculation-evidence); [refresh record](../REFRESH_20261113_1113.md#what-moved-against-master-20261103b)). Before it, `main` held the recalculation of November 4, 2026, from `master-20261103b` (4,162,015 finishes in 217 editions; [refresh record](../REFRESH_20261103b.md#refreshed-outputs)). The deployed state is in the [project handoff](../PROJECT_HANDOFF.md#current-state). [analysis/weather-release.json](../../analysis/weather-release.json) and [analysis/release.json](../../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs, and the supporting study uses it too. The release's weather rows cover the editions of the earlier universe only, so the newly counted editions (Los Angeles, Austin 2022–2024, Oklahoma City 2025, Toronto Waterfront) and New York 2026 have none.

**Line 67**

As it stood:

November 19, 2026 (`pace-notes-marathon-half-20261113-1113`, adoption branch, not deployed): the weather screen was recalculated locally from the adapted FULL folder (input `MANIFEST.json` `e994ac15…`) beside the marathon cohort. The evidence now names the cohort manifest (`cohort_manifest_sha256` `a812fa41…`, `cohort_manifest_as_of` `2026-11-14T15:24:11Z`); `build_weather.py` and `verify-weather` require the same input, the cohort's counts (the weather counts sit beside them), the same edition policy and, for every weather edition, a counted edition of the cohort with the weather row's race date. 189 editions, 25 courses and 3,955,561 finishes; warming +2.07 (+1.52 to +2.62) ready as an association, wind +0.34 (−0.06 to +0.71) ready as a precise small difference, humidity +0.27 (−0.60 to +1.07) withheld. `public/data/weather/evidence.json` SHA-256 `abf7e272bee3790271df0634ebbf7e691c13278f7e0897dc9fce85beb7ae05d4`, `as_of` `2026-11-19T15:54:02Z`, `build_weather.py` `4c27b9a6…`.

Now:

November 19, 2026 (`pace-notes-marathon-half-20261113-1113`, pull request #101): the weather screen was recalculated locally from the adapted FULL folder (input `MANIFEST.json` `e994ac15…`) beside the marathon cohort. The evidence now names the cohort manifest (`cohort_manifest_sha256` `a812fa41…`, `cohort_manifest_as_of` `2026-11-14T15:24:11Z`); `build_weather.py` and `verify-weather` require the same input, the cohort's counts (the weather counts sit beside them), the same edition policy and, for every weather edition, a counted edition of the cohort with the weather row's race date. 189 editions, 25 courses and 3,955,561 finishes; warming +2.07 (+1.52 to +2.62) ready as an association, wind +0.34 (−0.06 to +0.71) ready as a precise small difference, humidity +0.27 (−0.60 to +1.07) withheld. `public/data/weather/evidence.json` SHA-256 `abf7e272bee3790271df0634ebbf7e691c13278f7e0897dc9fce85beb7ae05d4`, `as_of` `2026-11-19T15:54:02Z`, `build_weather.py` `4c27b9a6…`.

## docs/WEBSITE_ARCHITECTURE.md

Line 230 of `docs/WEBSITE_ARCHITECTURE.md` at `d5c8e9221`.

**Line 230**

As it stood:

**The race list and results pages (November 19, 2026, branch `claude/release-20261113-m6`; not on `main`).** `/courses` opens on the count of every marathon the race directory lists (`courses.index`, from `summary.json`), then the races with a page: the 28 course pages in the sortable list as before, and the results pages as a second list of the same rows (their figure is the race's reading, `race.reading`, or a dash). Then "Every marathon": `components/races/RaceFinder.client.tsx` fetches `public/data/races/directory.json` when the list nears the screen or its filter takes focus (none of its rows is in the first load), checks the bytes against the manifest's sha256 and lists every race A to Z: name (its label where the flag `title_misleads` is set), place, years, editions, recorded results and the tier line (`TierLine`). A race with a page is a link. The filter matches the name, label, place and the reviewed search aliases, never shows an alias, and stays in the component: no URL, event or request carries it, and the island is `ph-no-capture`, so recordings hold neither the box nor the rows it leaves. No sort by tier.

Now:

**The race list and results pages (November 19, 2026, branch `claude/release-20261113-m6`, in pull request #101).** `/courses` opens on the count of every marathon the race directory lists (`courses.index`, from `summary.json`), then the races with a page: the 28 course pages in the sortable list as before, and the results pages as a second list of the same rows (their figure is the race's reading, `race.reading`, or a dash). Then "Every marathon": `components/races/RaceFinder.client.tsx` fetches `public/data/races/directory.json` when the list nears the screen or its filter takes focus (none of its rows is in the first load), checks the bytes against the manifest's sha256 and lists every race A to Z: name (its label where the flag `title_misleads` is set), place, years, editions, recorded results and the tier line (`TierLine`). A race with a page is a link. The filter matches the name, label, place and the reviewed search aliases, never shows an alias, and stays in the component: no URL, event or request carries it, and the island is `ph-no-capture`, so recordings hold neither the box nor the rows it leaves. No sort by tier.
