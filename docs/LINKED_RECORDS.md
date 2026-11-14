# Linked records: the same runners across marathons

The family `public/data/linked/` follows marathon records that the producer's person links (v5.1) join to one runner: how the same linked runners finished in different years of one race and at different races, how often a recorded marathon was the runner's best so far, how the finish time changes per year of age in the same runner, and one matched comparison of being seen again after a sustained slowdown. It is built by `analysis/build_linked.py` from the adapted marathon input, verified by `scripts/verify-linked.cjs` (part of `npm run verify:data`) and tested by `analysis/test_linked.py` and `analysis/test_linked_build.py`. This document is the contract: what is pinned, the rules in words, the floors, the guards, what is published, what may be said and what must never be printed. It publishes data only; no page reads it yet.

Marathons only. No half result enters any figure here. "Runner" always means a linked runner: records linked by name, sex and age or birth year by the producer, never a verified person ([AGENTS.md](../AGENTS.md) rules 4 and 10).

## Status (November 14, 2026)

Keep these apart:

- **Decisions.** The adoption plan's lead decisions of 2026-11-14 (UTC): D4 (links of `high_elite`, `high` and `medium` key a runner; the existing sex, birth-year and duplicate-edition screens stay), D24 item 2 (one identity rule, evaluated once over both distances and read from one file), D13 (which analyses to build, and the limits on each), D19 (the registry label is the pipeline's `city`), D22 (the finish-time universe F) and D3 (counted editions supply every sustained-slowdown share). The owner has not seen this family. Two questions recorded for the owner touch it: D4's use of `medium` links, and whether a race-against-race reading may stand beside the recorded rejection of a fastest-course ranking and a course time converter ([tools](TOOLS.md)); this family publishes neither a rank nor a converted time.
- **Definitions.** Frozen in this document and in `analysis/linked_common.py` before the first build that was kept. A change to any of them is a reviewed change with a dated note here. Two so far, both on November 14, 2026, the day of the first build: the standard error of a race level (see `se` under [races](#the-same-linked-runners-at-different-races-racesjson)), which can only make a guard harder to pass; and the linked-runner rule, which now reads the release's identity file as the lead's ruling D24 item 2 requires (see [linked runners](#linked-runners-and-kept-results)).
- **Rulings of the lead on the first report** (November 14, 2026, UTC). (1) D22 is read as this document reads it: a race reading uses the race's chip- or net-stated editions, compared inside one basis; the fields that let a page apply the strict reading stay in the file. (2) The 6% screen stays as frozen and New York 2022 stays held; a held edition is released only by a review, as a dated entry here with its evidence, never by moving the bar (the evidence the lead asked for, on the two held editions and on the 28 fitted editions of 2020 and 2021: [`linked-held-review.md`](evidence/2026-11-14/release-20261113-1113/linked-held-review.md)). (3) D29: a label that holds two races is read per series ([a race](#a-race-a-label-or-a-series-of-a-label)). (4) Marathon pages do not say "the same runners" as a bare claim ([what may be said](#what-may-be-said-and-what-must-never-be-printed)). (5) The pandemic years: no rule yet; the lead decides on the listed evidence. (6) A table of who is recorded again is added ([who is recorded again](#who-is-recorded-again-recorded_againjson)).
- **Rulings of the lead on the review evidence** (November 14, 2026, UTC; [reviews](#reviews-a-held-edition-released-an-edition-excluded)). (1) A held edition is released only by a written review against measurements that use no person link; the bar does not move. (2) New York 2022 is released by that review; Lévis-Québec 2012 stays held. (3) Warsaw 2020 is excluded: its note states another course; every build searches the producer's notes for a virtual run or another course and stops on a sentence without a ruling. (4) No rule for 2020 and 2021 as such. (5) The frozen bound of a kept result stays, and the two results of London 2026 it leaves out are stated ([kept results](#linked-runners-and-kept-results)). (6) Later the same day: the three other sentences the notes search finds (Houston, Madrid, Washington) are kept, and the recorded-again table is not built by sex.
- **Two definitions added on November 14, 2026 after the first report, each before any build of it on real data:** the race as a label or a series (D29), which changes nothing for a label without a series note; and the recorded-again table. Both are in the builders, the tests and the verifier; **neither is in `public/data/linked/` yet**.
- **Measured results.** See [Measured](#measured) for the build this branch holds.
- **Repository state.** Branch `claude/release-20261113-linked`, cut from `claude/release-20261113`. Not merged, no pull request. The family in `public/data/linked/` was built before the two additions: until it is rebuilt on the pipeline's final inputs, `verify-linked` reports the changed builders as stale data and fails, which is what that check is for. The lead rebuilds; no page reads the family meanwhile.
- **Deployed state.** Nothing of this family is deployed. No page reads it.

## Inputs and what the manifest binds

| Input | Read for | Bound by |
| --- | --- | --- |
| The adapted marathon input (`analysis/adapt_combined.py`, FULL bundle): `features.parquet`, `race_records.parquet`, `edition_meta.parquet`, `race_conditions.parquet`, `EDITIONS.json` | results, links, tiers, timing basis, weather rows | the sha256 of its `MANIFEST.json`, which must be the one the frozen edition policy names (`inputs.adapted_manifest_sha256`); every member read must be the file that manifest lists |
| The edition policy, `analysis/edition-policy-20261113-1113.json` | counted editions; the category of every other edition | its sha256 (`analysis/source_quality.py` refuses any other bytes) |
| The race registry, `analysis/race-registry.json` | race labels, and the reviewed `series` note of a label that holds two or more races | its sha256, which the edition policy also names |
| The release's identity file, `identity.parquet` (`analysis/build_identity.py`, outside the repository, with `identity.parquet.json` beside it) | the runner key of every marathon record | its sha256, stated in the manifest; the builder checks that the file is the one its `.json` describes and was built from this adapted input, this link file and the `build_identity.py` of the repository, whose sha256 the manifest carries and the verifier compares; the marathon cohort's manifest, which is in the repository, must name the same file |
| The marathon cohort, `analysis/marathon-cohort/` (`analysis/build_cohort.py`; lead ruling D24 item 1) | nothing in the build: the cohort has no file for an edition that gives recorded times only, and F holds 486 of those (`pace-notes-marathon-half-20261113-1113`, 2026-11-14). The verifier reads it | not bound by the manifest, because the family is not built from it. The verifier requires the cohort's manifest to name the same release, adapted input and identity file as the family's, and counts the counted editions again from the cohort's records ([how it is verified](#how-it-is-verified), item 5) |
| The release's link file, `person-ids-v5.1-race_results_linked.parquet` | one flag: `age_is_group_floor` in `record_flags` (the adapted `record_flags.parquet` holds flag names without values, so the flag cannot be read there) | its sha256 in `analysis/release.json` |
| The builders: `build_linked.py`, `linked_common.py`, `linked_universe.py`, `linked_model.py`, `linked_races.py`, `linked_histories.py`, `linked_return.py`, and the two site definitions they import (`build_pacing.py` for the timing-eligible cohort, `build_public_explorer.py` for the sustained-slowdown test) | | each by sha256; a changed script without a rebuild fails the verifier. `source_quality.py` is not bound: the policy it applies is bound by the policy file's digest, and the verifier compares the counted cohort with the release's published list (`public/data/edition-policy.json`) |

`manifest.json` carries the release tag, the input's manifest digest and time, these digests, the frozen numbers (`definitions`), the cohort counts and each file's bytes and sha256. The family files themselves carry no release tag. The build is deterministic: no timestamp, a fixed bootstrap seed (20261114), one BLAS thread; two builds give the same bytes.

## The rules, in words

### Editions: the finish-time universe F

An edition (a race label and a year) with at least one row in the adapted input is in **F** when both hold:

1. its tier is `stamped` or `stamped_weaker_source`, or it is `partial` and the release's rows with a finish time divided by its official finisher count lie between 0.95 and 1.05, both ends included (the edition policy's own reading of coverage: `finishes_in_release / official_finishers` of the adapted `EDITIONS.json`);
2. the edition policy does not list it under `selected_field`, `mixed_distance_list`, `incomplete_ingestion` or `unreconciled_hold` (a reason that is not about its split grid).

The split tier does not matter: a finish-time-only edition and an edition whose split grid the policy rejects (`invalid_split_grid`) keep their finish times. A `held_for_review` or `unverified` edition is never in F. **V** (verified tiers) is F without the partial editions. **W** (wider) is the same rule with `unverified` also allowed in clause 1; it exists for one sensitivity fit and nothing in a published figure rests on it. The builder stops if its reading of an edition disagrees with the policy (a counted edition outside F, an edition of F listed for a reason it does not know, or a different reading of the 5% band).

A **counted** edition is the edition policy's (plan decision D3). Every sustained-slowdown share in this family is read on timing-eligible finishes of counted editions with the site's own code (`build_pacing.prepare`, `build_public_explorer.threshold_sql`).

### A race: a label, or a series of a label

A race is a registry label. Where the registry's race entry carries a reviewed **`series` note**, the label holds two or more races and each series is a race (lead decision D29, 2026-11-14: Warsaw stays one label and one page, and holds the Orlen Warsaw Marathon, 2015 to 2018, and the PZU Warsaw Marathon, 2019 to 2026). Everything below that says "race" means this: the model's order term, the other years an edition is compared with, the median of the 6% screen, the race reading, the linked runners that tie a race to other races (the other series of the label counts as another race), "the same race" in the age table and in the recorded-again table, and the groups of the checks. A label without a note is its own race, and no field of its files changes.

- **The note this family reads** is a list on the race entry, one object per series with `name`, `first_year` and `last_year` (other fields of the object are not read): at least two series, distinct names, no shared year, and every edition with rows of the label inside exactly one series. Any other shape stops the build, and so does a registry that names series anywhere while no race entry carries such a note: a note is never skipped because it sits where the reader does not look, and never guessed from prose.
- **Published.** An edition row of such a label carries `series` (the name); so do its points and held editions in `checks.json`. Its race readings are in `races.json` under `series[label][name]`, and the label has no entry under `races`. A `series` value or key may only be a series name of the registry. The verifier reads the note from the registry by itself, and the cohort manifest's edition rows must carry the same series.

### Timing basis

The release states a timing basis per edition as free text. Each string is classed once in `linked_common.TIMING_CLASS`; a string that is not listed stops the build.

| Code | Strings | Basis for comparisons |
| --- | --- | --- |
| `chip` | `chip`, `chip (ot) as published`, `real time as published` | chip or net |
| `chip_fallback` | `chip (clock if no chip)`, `chip (delta_net), clock if no chip`, `chip (gun if no chip)`, `chip time else gun`, `chip elapsed (gun if no chip)`, `chip where published, else gun`, `net 'time' (gun if none)`, `realTime (net) as published, else officialTime` | chip or net (the source falls back to gun or clock time for a row without a chip time) |
| `gun` | `gun` | gun |
| `mixed` | `mixed` (gun splits, net or chip finish, inferred from splits) | none: a mixed edition is compared with nothing |
| `not_stated` | `unknown`, `as published`, `as published (Time)`, no value | not stated |

Editions are compared with one another only inside the same race and the same basis.

### Linked runners and kept results

A **linked runner** is a runner key of the release's identity file (`analysis/build_identity.py`; plan decision D24 item 2): the producer's `person_id` of a link whose confidence is `high_elite`, `high` or `medium` (the adapter's frozen IDENTITY rule) and whose person passes three screens, each evaluated once over all of the person's rows in those tiers, marathon and half together: at most one recorded sex, birth years at most two apart, and never two results in one edition. Weaker links (`medium_variant` and every `low_*`) key nothing. This family derives no key itself; the builder checks that every key is the adapted input's `runner_id` and that a record with that id and no key is one a screen took out. (Changed on November 14, 2026 after the first kept build, which applied the same three screens to the marathon records alone, as `build_extended.py` did before the identity file existed. Over both distances 708 more runners, with 1,990 marathon records, lose their key because a half result widens their birth years.)

A **kept result** is a record of a linked runner in an edition of the universe at hand with a finish time from 2:00:00 to 12:00:00, both ends included. The bound is frozen. It leaves out two real results, the first two finishers of London 2026 (1:59:30 and 1:59:41), whose rows the pipeline restores under plan decision D33 (ruling of the lead, 2026-11-14: the bound stays and the two rows are stated here); the manifest counts the linked results of F on either side of the bound (`linked_results_outside_the_finish_range`), so the number is on every build.

Four variants are computed beside every main figure and never replace it:

| Variant | Results |
| --- | --- |
| verified | kept results in V |
| high | kept results in F whose own link is `high_elite` or `high` |
| wider | kept results in W (the pair model only) |
| complete | kept results in F of runners none of whose linked records, on any tier and any link confidence, lies outside them (recorded bests only) |

A variant is a universe: histories, attempt numbers and pairs are formed again from its results alone.

### Reviews: a held edition released, an edition excluded

Rulings of the lead of November 14, 2026 on the review evidence ([`linked-held-review.md`](evidence/2026-11-14/release-20261113-1113/linked-held-review.md)). No frozen number moves: the 6% screen holds what it held. A review is a dated entry here and in `analysis/linked_reviews.py`; the builder checks every entry against its own data on every build and stops when one no longer holds, and the verifier keeps its own copy of the entries.

**The review of a held edition.** The screen cannot tell an extreme year from a faulty list, so a held edition is reviewed against measurements that use no person link. It is released only if all six hold on the build's own inputs:

1. its tier is `stamped`;
2. its timing basis is its group's: its timing code is the code of every other edition of its comparison group;
3. the release states its finishes within 0.5% of the official count (`finishes_in_release` against `official_finishers`);
4. the screen holds it on the slow side (more than 6% above its group's median);
5. it is a counted edition, and its whole-field sustained-slowdown share is the highest of its race's counted years (at least three; a tie is not the highest);
6. it has a weather row, and its temperature at the recorded start hour is the highest of its race's fitted years that have one (at least three; a tie is not the highest).

A held edition that lacks either measurement, or is held on the fast side, has no release path and stays held. A released edition gets its reading and verdict like any other, enters its comparison group and its race reading, and carries `reviewed_release: true`. If the screen does not hold a reviewed edition on a later build, the entry is not needed and the edition is an ordinary one (`applies: false`); if the screen holds it and a condition fails, the build stops. Every held edition is published with the same measurements (`checks.json` `held_for_review[].review`), so the next review starts from them.

| Released by review | Evidence, on `pace-notes-marathon-half-20261113-1113` (the build of 2026-11-14 at `424cc4f1a`) | Reviewed |
| --- | --- | --- |
| New York 2022 | stamped; chip, as the 14 other years of its group; 47,710 finishes against 47,839 official (−0.27%); 6.48% above its group's median; whole-field sustained-slowdown share 45.20%, the highest of the race's 17 counted years (next 42.71%, 2015); 19.9 °C at the start, the warmest of the race's 17 weather rows (next 12.2 °C, 2017). On that build it would read +6.44% (+6.29 to +6.60) against its 14 other years. | the lead, 2026-11-14 |

Lévis-Québec 2012 stays held: a weaker-source stamp, no weather row and no counted year.

**An edition excluded by review.** An edition whose release notes state a virtual run or another course is not a year of its race. It enters no fit of the pair model, so it has no reading and is in no comparison group, no race reading and no check; its results stay in the universe for the other files. It is published with the producer's own sentence (`checks.json` `reviewed.exclusions[]`).

| Excluded by review | The producer's note | Reason | Reviewed |
| --- | --- | --- | --- |
| Warsaw 2020 | "COVID edition: four separate waves (max 250 each) on a 5 km city loop, 2020-09-26/27" (the completeness reason of the edition) | another course | the lead, 2026-11-14 |

**The search, on every build.** For every edition of F the builder reads five notes of the producer (in `EDITIONS.json` the completeness reason, the release note and the hold note; the course notes of `edition_meta`; the notes of the weather row), cuts each into sentences at `;`, `|` and full stops, and looks for two kinds of wording, in any letter case:

| Kind | Patterns (regular expressions) |
| --- | --- |
| a virtual run | `virtual`, `virtuel`, `virtueel`, `self[- ]timed`, `app[- ]recorded`, `\bremote(ly)?\b`, `wherever you are` |
| another course | `\bloops?\b`, `\blaps?\b`, `\b(another\|different\|alternat\w*\|replacement\|changed\|shortened\|modified) course\b`, `\bnew course\b` not followed by `record`, `\bcourse (was \|is \|has \|had )?(been )?(changed\|shortened\|altered\|modified\|moved\|replaced)\b`, `\bshort course\b`, `\bshortened\b`, `\btrack\b` |

Every sentence found (its digits read as `#`, so one ruling covers the same sentence in other years) must be on the reviewed list with a ruling, `excluded` or `kept`. The build stops on a sentence that is not on the list, on a listed sentence that the notes no longer hold, and on an exclusion whose quotation is no longer the note's own words. A moved date, a smaller field or a wave start is not searched for: none of them is another race (ruling 4).

On `pace-notes-marathon-half-20261113-1113` (input manifest `c0ddc847…`, 2026-11-14) the search reads 845 editions and finds 31 sentences of four kinds:

| Sentence (digits as `#`) | Editions | Ruling |
| --- | --- | --- |
| "COVID edition: four separate waves (max # each) on a # km city loop, #-#-#/#" | Warsaw 2020 | excluded (the lead, 2026-11-14) |
| "not loaded: # outside main place chain (wheelchair/handcycle/assisted/unplaced), # virtual" | Houston 2009, 2012, 2017, 2019, 2023, 2024 | kept (the lead, 2026-11-14): a count of rows that were not loaded |
| "Madrid's course changed over #-#" (course notes) | Madrid 2013 to 2019 and 2021 to 2025 | kept (the lead, 2026-11-14): the course profile's note says that the race's course changed over the years and names no edition |
| "MCM course changed several times #-#" (course notes) | Washington 2008 to 2018 and 2023 | kept (the lead, 2026-11-14), for the same reason |

The three kept rulings are the lead's (2026-11-14): none of the sentences says that a particular edition was run on another course or virtually, so no edition is excluded. `/methodology` names Madrid and Washington once as races whose course the release says changed over the years.

**No rule for 2020 and 2021 as such** (ruling of the lead, 2026-11-14). The other 27 fitted editions of the two years stay as fitted: the 2020 ones were run before the shutdowns or carry no note, and a moved date or a smaller field is not another race; the model compares linked runners with themselves. `/methodology` says once that Boston 2021 and Rotterdam 2021 were run in autumn (their weather rows say "COVID-shifted autumn edition"; Madrid 2021 and Stockholm 2021 carry the same note and are not fitted).

### The pair model

For every pair of kept results of one linked runner whose calendar years are at most two apart (a the earlier year, b the later; two results of one year form a pair whose order is unknown and which carries no order and no drift term):

`ln(time b) − ln(time a) = reading(edition b) − reading(edition a) + [different years] × (drift(years apart) + order(race a) + order(race b)) + noise`

fitted by weighted least squares. A runner with k paired results weighs 2/k on each pair, so every runner counts k − 1 whatever the number of pairs. `reading` is one number per edition; `order` one per race (half the difference between "this race was the later of the pair" and "this race was the earlier"); `drift` one per count of years apart (1 and 2).

**An edition is fitted** when at least 100 linked runners connect it to another fitted edition (applied until no edition falls under it), it lies in the largest connected set of editions, and the pairs determine its reading. A reading is not determined when it cannot be told apart from its race's order term, as for a race seen only in the last year of the records, where it is always the later race; such an edition is not fitted.

**Three things the pairs cannot determine are set by rule:**

1. a constant on every reading: the pair-weighted mean reading of the fitted editions is zero;
2. a constant on every order term: the pair-weighted mean order term is zero (the drift takes twice its opposite);
3. **a straight-line trend of the readings over calendar years.** A steady change that every edition shares, per calendar year, cannot be told apart from the average change in a runner between two races that many years apart. The readings therefore carry no such trend: their pair-weighted straight-line trend over calendar years is zero, and the drift takes it. A reading is a reading against the common trend of the years. Nothing in this family measures that trend, and a published drift is not "what a year of ageing does".

**The interval of a reading** comes from a runner bootstrap: 400 draws, each linked runner taking an independent Poisson(1) weight, the fitted set of editions held fixed, each draw set by the same three rules.

**Held for review.** A fitted edition whose reading is more than 6% (as a percent of the finish time) from the median reading of the fitted editions of its race and basis, where there are at least three, is held for review: it is listed in `checks.json` and enters no reading, no spread and no check. The median is taken once, before any edition is held.

### Fast years and slow years (`editions.json`)

For a race and basis with at least three fitted editions that are not held, each edition's **reading** is its model reading minus the mean model reading of the others, as a percent of the finish time (`100 × (exp(difference) − 1)`; plus is slower). Its interval is the 2.5th and 97.5th percentile of the same quantity over the bootstrap draws. The same quantity from the high-links fit stands beside it where that fit holds the edition in a group of three (`high_pct`); the high-links readings are first put on the main fit's first and third rule over the editions both fits hold.

Published per edition, keyed by registry label and year: `series` (only where the label has a series note), tier, timing code, basis, `finishes` (the edition's kept results that have a fitted pair), `others` (the other editions it is compared with), `reading_pct`, `lo_pct`, `hi_pct`, `high_pct`, `year_sd_pct` (the race's year-to-year spread on this basis: the standard deviation of the model readings of the edition and the others it is compared with, in log points × 100; the same number on every edition of the group) and `verdict`.

| Verdict | Guard |
| --- | --- |
| `slow` | `lo_pct` > 1 and, where there is a high-links reading, it is above 0 |
| `fast` | `hi_pct` < −1 and, where there is a high-links reading, it is below 0 |
| `usual` | `lo_pct` > −1 and `hi_pct` < 1 |
| none | anything else: the page states no reading of the year |

Floors: at least 100 `finishes` (the fit's own floor) and at least 2 `others` (three editions behind the comparison). A reading includes whatever the year shared with other races that year, apart from the straight-line trend of rule 3.

### The same linked runners at different races (`races.json`)

A race is read on its **chip- or net-timed** fitted editions that are not held, at least three of them. An edition on another basis gets an edition reading among its own kind and enters no race reading.

The edition readings (every fitted edition that is not held and has a basis) are split by least squares, every edition counting once, into a **level per race and basis** and a **level per calendar year**; the year levels have pair-weighted mean zero over the editions used. The race's **reading** is the level of its chip-or-net group as a percent (minus is faster): how the same linked runners finished at this race against the other races of the same years, on the scale whose zero is the pair-weighted average fitted edition. Only the largest set of groups and years that the editions tie together is used.

- `se`: the standard error of the level from the spread of the race's editions around it and around their year levels, in log points × 100. It allows for the year levels being estimated too: each edition's squared residual is divided by one minus its leverage and weighted by the square of its weight in the level (the heteroscedasticity-consistent form known as HC2), and it is never under the plain form, the standard deviation (n − 1) of those residuals divided by √n. (Changed on November 14, 2026 after the first kept build, which used the plain form alone: where a calendar year holds few fitted editions the year level takes part of a race's own deviation, so the plain form understated the uncertainty of races seen in thin years. The change can only widen an interval; on this build it widened them by 2% to 59% and changed no verdict.)
- `lo_pct`, `hi_pct`: reading ± t × se on the log scale, where t is the two-sided 95% point of Student's t with n − 1 degrees of freedom (4.30 for three editions, 2.78 for five, 2.09 for twenty; never under 2).
- `boot_lo_pct`, `boot_hi_pct`: the 2.5th and 97.5th percentile of the same level over the runner bootstrap.
- `earlier_pct`, `later_pct`: the reading minus and plus the race's order term: the reading when this race was the earlier, and the later, of a pair (the brief's "when first" and "when second").
- `people_earlier`, `people_later`: linked runners with a different-year pair between one of the race's used editions and another race, by which came first. A race with fewer than 100 either way gets no reading.
- `year_sd_pct`: the standard deviation of the race's edition readings (the year-to-year spread a runner meets), in log points × 100.
- `variants`: the race's reading from the verified, high and wider fits, where that fit reads it (three editions), each shifted so that the races it shares with the main fit have the same mean reading.
- `tiers`, `timing`, `editions`, `editions_fitted`, `held_for_review`, `years` (first and last used year), `finishes`, `people`.
- `trail_or_mountain`: true when the race registry flags the race `mountain_or_trail_course` (reviewed) or `trail_or_mountain_word_in_title` (by rule), so a page can set such a course apart. The registry has no flag for a net-downhill road course.

| Verdict | Guard (all must hold) |
| --- | --- |
| `faster` | `reading_pct`, `earlier_pct`, `later_pct` and every existing verified and high variant are below 0; `hi_pct` < 0; `boot_hi_pct` < 0 |
| `slower` | the same with every sign reversed (`lo_pct` > 0, `boot_lo_pct` > 0) |
| `about_the_same` | `lo_pct`, `hi_pct`, `boot_lo_pct`, `boot_hi_pct`, `earlier_pct` and `later_pct` all lie strictly between −2 and 2 |
| none | anything else: the page shows the interval and the counts and states no reading of the race |

The file holds races in label order (`races`), and the series of a label with a series note in label and name order (`series`); its summary counts both. It has no rank, no order by value, no "fastest" and no converted or equivalent time, and the verifier refuses any such key.

### Recorded bests and the steps between recorded marathons (`bests.json`)

**The one-marathon-per-year rule.** The release dates too few editions to order two marathons of one year. Every figure of this and the next section keeps only linked runners with at most one kept result in every calendar year of the universe at hand; a runner's **recorded attempt** number is the place of the result in the runner's kept results in year order. "First", "second" and "best" mean first, second and best in these records, and every key and label in the files says "recorded".

- **Recorded best so far.** A result with at least one kept result in an earlier year is a recorded best when its finish time is strictly below every one of them (a tie is not a new best).
- **By recorded attempt** (`by_recorded_attempt`): results and recorded bests for attempts 2, 3, … up to the last attempt before the first that holds fewer than 100 results; `shuffled_share` is 1/k, what the k-th of k results would be if their order carried no information; the three variants beside.
- **By years since the previous recorded best** (`by_years_since_previous_recorded_best`): third and later recorded attempts, by calendar years since the latest earlier year that holds the best so far; years 1 to 9 and "10 or more", the cap lowered until every bin holds 100 results; the three variants beside, on the same bins.
- **The size of a new recorded best** (`new_recorded_best_size`): over every new recorded best, the quartiles of the gain as a percent of the previous best and in minutes, and the count of gains under one minute; each variant's count and medians beside.
- **The steps** (`steps.by_step`): consecutive recorded attempts at most two calendar years apart: pairs, the count of later results that were faster, the median and quartiles of the change as a percent, for the step from attempt 1, 2, … up to the last before the first step with fewer than 100 pairs. The step from the first recorded marathon is also given over any number of years apart, and by the **mean of the two finishes** (under 3:00, then half-hour bands to 5:00, 5:00 to 6:00, 6:00 and over; bands under 100 pairs are cut from either end), each with the three variants beside. No figure is banded by the first finish alone or by the second: either banding manufactures a trend by regression to the mean.

| Verdict (a share against an expected share: 1/k for bests, one half for a step) | Guard |
| --- | --- |
| `more_often`, `less_often` | the share is more than one point from the expected share, and more than 1.96 binomial standard errors (computed under the expected share) from it, and every variant that holds 100 results is on the same side |
| `as_often` | the share and its 1.96-standard-error interval lie within one point of the expected share |
| none | anything else |

### Getting older, in the same linked runner (`age.json`)

- **An exact birth year.** A result carries one when the link build's age key is a birth year and the record is not flagged `age_is_group_floor`. A runner has one when such results exist among the runner's kept results and span at most one year (the more frequent year, the earlier on a tie). **An age read from an age group is never used.** Age at a race is the race year minus the birth year, kept from 18 to 85. The runner's sex must be recorded.
- **Pairs.** Consecutive recorded attempts of one-per-year runners, one to three calendar years apart; the change is `ln(later / earlier)` divided by the years apart; the band is the age at the midpoint (18–24, five-year bands to 65–69, 70 and over).
- **The main column** keeps pairs whose earlier result is at least the runner's third recorded marathon, so the first steps of a recorded history are not read as youth. Beside it: the same pairs when both results are at the same race; the verified and high variants; every pair with the first recorded steps included; the pairs by recorded sex where 100 allow; and the **cross-section**, the least-squares slope of ln(finish) on age inside the band over every kept result of a runner with an exact birth year, by recorded sex.
- Bands are published from the first to the last that holds 100 pairs in the main column.
- **Survivorship** (`survivorship`): among main-column pairs whose later result is of 2012 to 2019 and whose midpoint age is 45 to 64, the median change per year of runners with a later kept result against runners with none.

| Verdict | Guard |
| --- | --- |
| `stated` | the same-race, verified and high medians each rest on 100 pairs and each lies within 0.3 points of the main median |
| none | anything else: the page shows the band's count and no rate |

### Seen again after a sustained slowdown (`return.json`)

Timing-eligible finishes of linked runners in counted editions of 2010 to 2019, with a recorded sex. A finish with a sustained slowdown is matched with the finishes without one in the same edition, sex and 10-minute finish band; a cell needs 20 finishes on each side and weighs its finishes with a slowdown. **Seen again within two years** means a kept result of the same linked runner in F in one of the next two calendar years. A marathon outside these records does not count, so both shares are floors and only their difference is read. The interval of the difference resamples whole editions (400 draws). The file gives the matched shares, the difference in points with its interval, the unmatched shares, the same by finish band where 100 finishes with a slowdown and 3 editions allow, and the verified-tiers and high-links variants (each on its own results, for the finishes compared and for the later results that count as seen again).

| Verdict | Guard |
| --- | --- |
| `less_often` | the interval of the difference lies below 0 and the verified-tiers and high-links differences, where they exist, are below 0 |
| `more_often` | the mirror image |
| none | anything else |

### Who is recorded again (`recorded_again.json`)

Defined on November 14, 2026 (14:00 UTC, commit `732a61662`), before any build of it on real data; asked for by the lead as a descriptive table beside the matched comparison. **Not built yet.**

**The finishes** are those of the matched comparison above before any matching: timing-eligible finishes of linked runners in counted editions of 2010 to 2019, with a recorded sex. **Recorded again within two years** is that comparison's "seen again": a kept result of the same linked runner in F in one of the next two calendar years, at any race. The file's `cohort` is therefore the sum of the two unmatched counts of `return.json`, and the verifier checks it.

**Why a row is not a plain share.** The share of finishes whose runner is recorded again is a floor that depends on which races these records hold and on how well each can be linked, so it differs from race to race for reasons that are not about runners. Every row is therefore read **inside its own editions**. For a group (a finish band, an age band) and an edition that holds n finishes of the group, x of them recorded again, the edition's other finishes (N − n, of which X − x recorded again) say how often the group would be recorded again if it were like the other finishes of the same edition. An edition counts for a group only when those other finishes number at least 100. Over the editions that count:

- `share` = Σx / Σn, the group's own share, and `finishes`, `recorded_again`, `editions` behind it;
- `expected_share` = Σ n × (X − x)/(N − n) / Σn: the share among the other finishes of the same editions, weighted as the group is spread over them;
- `difference_points` = 100 × (`share` − `expected_share`): how much more or less often the group is recorded again than the other finishes of the same editions;
- `lo_points`, `hi_points`: the 2.5th and 97.5th percentile of that difference when the group's own editions are resampled whole, with replacement (400 draws, a fixed seed);
- `all_finishes`: every timing-eligible finish with a recorded sex of the group in the same editions, whether or not a link keys it, so that `finishes / all_finishes` is the share of the group's finishes the links can follow.

**Rows.** `by_finish_band`: 10-minute bands of the finish time (under 2:30, 2:30 to 2:39 and so on to 6:20 to 6:29, 6:30 and over). `by_finish`: the five finish groups of `return.json` (under 3:30, 3:30 to 3:59, 4:00 to 4:29, 4:30 to 4:59, 5:00 and over). `by_age_band`: the age at the race, from the result's **own** exact birth year and never from the runner's other results (an age learned from another record would pick out runners who have another record), 18 to 85, in the bands of `age.json`; in each edition the other finishes are those that carry an age of their own, and `age_cohort` counts them. A row needs 100 finishes and 3 editions and is left out under either.

**Variants**, each the same calculation on its own finishes, published as finishes, editions and difference: `verified` (verified-tier editions only, for the finishes and for the later results), `high` (high links only), `same_race` (recorded again at a later edition of the same race, so that where the runners of a band go next cannot move the row), `men` and `women` (the row inside one recorded sex). A variant under 100 finishes or 3 editions is null.

| Verdict of a row | Guard (all must hold) |
| --- | --- |
| `more_often` | `difference_points` is at least 1; `lo_points` is above 0; each of the five variants exists and its difference is above 0 |
| `less_often` | `difference_points` is at most −1; `hi_points` is below 0; each of the five variants exists and its difference is below 0 |
| none | anything else: the row is counts and two shares, and the page states no reading of it |

**One band against another.** A statement that one band is recorded again more often than another may be made only between a row whose verdict is `more_often` and a row of the same table whose verdict is `less_often` (inside one edition a group above the edition's other finishes and a group below them cannot be level). Nothing compares two rows on the same side, and nothing says that the share rises or falls across the bands.

**Not built: the sexes against each other** (ruled by the lead, November 14, 2026: not built, because a changed surname breaks a link). The lead asked for the same table by recorded sex. It is left out, for a reason no guard on this data removes: the producer's links join records by name, sex and age, and a runner whose surname changes between two races is not linked. The records do not say how often that happens or to whom, so a difference between the sexes in being recorded again cannot be told apart from a difference in changing names. Sex is used the other way round: a row has a verdict only when it holds among men and among women separately. The same doubt reaches age among women, which is one reason an age row needs its men-only variant; where the two sexes differ, a page reads the men's.

**What else limits it.** The share of a race's records the links follow runs from about a quarter to over nine tenths, so no row is compared between races or editions, and `share` is printed only beside `expected_share` or as their difference. Inside an edition the links do not follow every band equally (`all_finishes`), and the fastest band holds the records the producer linked by its rule for elite runners. The years after 2018 and 2019 hold few races: every finish of an edition shares that window, so no row is moved by it, but the shares are lower there. A marathon outside these records does not count.

### The checks (`checks.json`)

Recomputed on every build and published with the points they are computed from, so the verifier recounts them:

- **Temperature.** For fitted editions with a weather row, in race-and-basis groups of at least three: the correlation and slope, inside races, of the edition's model reading with the mean temperature of the race window (and with the start-hour temperature), and the mean deviation from the race's own mean by temperature band (under 8 °C, 8–12, 12–16, 16–20, 20 and over; a band needs three editions). No weather enters the fit.
- **The whole field's sustained-slowdown share.** For counted editions with at least 1,000 timing-eligible finishes that are at least half of the edition's finishes, in race-and-basis groups of at least four: the correlation, inside races, of the edition's model reading with the share of the whole field's eligible finishes that had a sustained slowdown. No person link enters that share. Verdict `holds` when the correlation is at least 0.7; a page about fast and slow years falls back when it does not.
- **Other fits.** The verified, high and wider fits: pairs, runners, fitted editions; the correlation of edition readings and of race readings with the main fit over what both hold; the standard deviation of the race differences; how many race readings share the main sign.
- **Spread.** The count of edition readings beyond 2% and beyond 3%, over all and over verified-tier editions; the median year-to-year spread of a race and the spread between races.
- **Year levels** of the split used for the race readings (a year needs three editions).
- **What other rules would give.** The race verdicts with a floor of five editions; and the scout's rule alone (the plain mean of a race's edition readings, two standard errors of that mean, the order readings) on the same races.
- **Held for review:** the editions held, by label and year, each with how far its reading sits from the median of its race and basis (`from_median_pct`) and with the measurements of the review (`review`). A page states nothing about a held edition.
- **Reviewed** (`reviewed`): the releases (label, year, whether the screen holds the edition on this build, and then its distance and the six conditions with their measurements) and the exclusions (label, year, the reason code, the producer's sentence, the day of the review), for `/methodology`.

## Floors

| Floor | Value |
| --- | --- |
| Finishes, results or pairs behind any published group | 100 |
| Linked runners connecting a fitted edition | 100 |
| Editions behind an edition reading (the edition and at least two others on its basis) | 3 |
| Chip- or net-timed fitted editions behind a race reading | 3 |
| Linked runners tying a race to other races, each way | 100 |
| Finishes on each side of a matched cell | 20 |
| Editions in a temperature band or a year level | 3 |
| Finishes behind a recorded-again row or one of its variants; its editions | 100; 3 |
| Other finishes of an edition for the edition to count in a recorded-again row | 100 |

A group under a floor is left out; a range is narrowed from its thin end; no floor is lowered to keep a figure ([AGENTS.md](../AGENTS.md) rule 13).

## What may be said and what must never be printed

Carried from the research findings of 2026-11-14 (the scout's `FINDINGS.md`, sections A, B, C, F and H). A page prints a sentence only from a nugget whose guard is the verdict in the file.

| Analysis | May be said (under its guard) | Must never be printed |
| --- | --- | --- |
| Fast and slow years | "At Chicago in 2008, runners whose records are linked by name finished about 5% slower than in the race's other years." Once, as the finding: the share of editions more than 2% off their race's other years. | A cause ("the heat cost 5%"). An adjusted version of anyone's time. A reading for a year whose verdict is none, for a held edition, or for an edition a review excluded. A released edition without saying that a review released it (`/methodology` lists it with its evidence). The drift as a fact about ageing or about the calendar. |
| Races | "Runners who ran Valencia and another marathon within two years finished about 2.6% faster at Valencia (records linked by name)." | "Valencia is 2.6% faster". Any rank, "fastest" list or ordering by reading. An equivalent or converted time ("your 3:45 in New York is a 3:39 in Valencia"). A reading for a race with editions on mixed timing bases, or with no verdict. |
| Recorded bests, steps | "A second recorded marathon was a recorded best 54% of the time." "Of runners with a second recorded marathon within two years, 57% ran it faster than the first recorded one." | "Personal best", "PB" or "first marathon" without "recorded"; "debut". "Your chance of a best" in any form. A cause for the decline. "Experience makes you faster". "Slower runners improve most" (regression to the mean). "Runners learn to avoid the slowdown". |
| Getting older | "Runners aged 50 to 54 with three or more recorded marathons, who kept racing, ran the next one a typical 1.0% slower per year; comparing different runners of those ages shows about 0.6%." With "Not a prediction". | "You will slow 1% a year". "Ageing costs 1% a year". An age read from an age group. A rate for "runners" without "who kept racing". |
| Seen again | "At the same race and finish time, runners with a sustained slowdown were seen in another recorded marathon within two years slightly less often: 31% against 33%." | "X% of marathoners never run another". Any return share as a fact about runners. A comparison of races. "A slowdown puts runners off". |
| Who is recorded again | "Finishes under 3:30 were followed by another recorded marathon within two years more often than the other finishes of the same races" (a row whose verdict is `more_often`), and one band against another only between a `more_often` row and a `less_often` row. | The sexes compared. A plain share without the share of the same races beside it. A share compared between races, or between two rows on the same side. "The faster the runner, the more often" or any trend across the bands. "Come back", "return", "keep running", "give up", "quit" or "loyal" as a fact about runners: the records say recorded again, and a marathon outside them does not count. A cause. |

Every linked figure says "records linked by name". **Marathon pages do not say "the same runners" as a bare claim** (lead ruling, November 14, 2026): they say "runners whose records are linked by name" on first mention and "linked runners" after it. Counts are finishes, results or pairs; a count of linked runners (`people`) is for `/methodology`, never "N runners" in copy. The numbers above are the scout's on its wider edition set and are examples of wording, not this build's values.

`/methodology` also carries, once each, what the [reviews](#reviews-a-held-edition-released-an-edition-excluded) decided: the edition a review released, with its evidence (New York 2022); the edition a review excluded, with the producer's sentence (Warsaw 2020); that Boston 2021 and Rotterdam 2021 were run in autumn; and that the release says the courses of Madrid and of Washington changed over the years.

Two properties of the links belong on `/methodology` once, beside any page that uses this family: the link build refuses a merge when two finish times of one distance differ by more than a ratio of 1.70 (so every distribution of within-runner change is cut at its tails), and the share of a race's records that can be followed runs from about a quarter to over nine tenths by race (so no person-based rate may be compared between races).

## How it is verified

`node scripts/verify-linked.cjs` (in `npm run verify:data`), from the repository alone:

1. the manifest against the pins: release tag, policy file and digest (and the digest `source_quality.py` pins), registry digest, the adapted input's manifest digest (the one the policy names), the link file's digest, every builder script's sha256, every file's bytes and sha256, and the frozen numbers against its own copy;
2. the shape of every file; floors on every group; no identifier, name, rank, order or converted-time key; strings only as closed codes or registry labels; no person id, release tag or banned word in any string; "recorded" in every key that says best or first;
3. every verdict recomputed from the published numbers, the race intervals recomputed from the reading, the standard error and Student's t, the shares from their counts;
4. the checks recounted from their published points; the summaries recounted from the rows; the files against each other;
5. against the marathon cohort (`analysis/marathon-cohort/`, read with `scripts/lib/cohort.cjs`; added November 14, 2026, when the cohort reached the release branch): the cohort's manifest names the same release, adapted input and identity file as the family's, which is what shows an identity file that was rebuilt outside the repository; and the counted editions, their finishes and their sustained slowdowns, with the two counts of every edition of the whole-field check, are counted again from the cohort's records, not from a number this family published.

6. series: the note read from the registry by itself; every edition row, point and held edition of a label with a note names the registry's series for its year, and no other row names one; comparisons recounted inside a series; a label with a note has readings under `series` only; the cohort manifest's rows carry the same series;
7. the recorded-again table: its `cohort` against the unmatched counts of `return.json`; every row's floors, its share from its counts, its difference from its two shares, the difference inside its interval, `finishes` within `all_finishes`, and its verdict recomputed from the difference, the interval and the five variants.

8. the reviews: the entries are the verifier's own copy; a released edition has a reading, is stamped and carries the flag, each of its six conditions is recomputed from its published measurement, its whole-field share and the counted years of its race are counted again from the cohort's records, and no published point of its race is as warm at the start; an excluded edition has no reading and is in no check; no other row carries the flag.

`node scripts/verify-linked.cjs --self-test` (also in `npm run verify:data`) breaks a copy of the family one thing at a time and requires the verifier to refuse each copy.

The Python tests cover the pair model on synthetic data (known readings, order terms and drift recovered; the trend rule; the floors; the largest connected set; a race seen only as the later race), the one-marathon-per-year rule, recorded bests, the age rule, every verdict, the published-file scan, the edition sets, and a whole build on a synthetic adapted input run twice for the same bytes.

## Rebuild

```
until mkdir /home/user/pn-data/heavy.lock 2>/dev/null; do sleep 20; done   # one heavy job at a time
PACE_LINKED_DUCKDB_MEMORY=5GB python3 -I analysis/build_linked.py \
  --input "$PACE_INPUT_DIR" --identity "$PACE_INPUT_DIR/../identity.parquet" \
  --links "$PACE_RELEASE_DIR/person-ids-v5.1-race_results_linked.parquet"
rmdir /home/user/pn-data/heavy.lock
node scripts/verify-linked.cjs
```

A rebuild whose cohort counts differ from the manifest in `public/data/linked/` prints the change and stops unless `--accept-counts` (a reviewed refresh only). Rebuild when the adapted input, the identity file or its builder, the edition policy, the race registry, the release pin or any bound script changes; the verifier fails until then. An identity file rebuilt with an unchanged builder is outside the repository; it shows through the marathon cohort, whose manifest names the identity file it was built on: once the cohort is rebuilt, the two manifests differ and the verifier fails until this family is rebuilt too. **The identity file is rebuilt when the half's row rule is frozen (M3): rebuild this family after it** (and the cohort: the verifier requires both on one identity file).

`docs/evidence/2026-11-14/release-20261113-1113/linked-recount.py` recounts the histories from the adapted input in SQL and compares them with the published files; run it after a rebuild.

## Files and fields

Sizes are those of the build below. Every file starts with `family`, `file` and `schema_version`; none carries a release tag.

| File | Bytes (gzip) | Shape |
| --- | --- | --- |
| `editions.json` | 91,841 (11,542) | `races[label][year]` = `{tier, timing, basis, finishes, others, reading_pct, lo_pct, hi_pct, high_pct, year_sd_pct, verdict}`, with `series` on the rows of a label that has a series note and `reviewed_release: true` on an edition a review released; `summary`; `margin_pct`, `min_editions`, `min_finishes`. Small enough to load whole on a course page or beside a runner's race (the largest race, Berlin, is 4.2 KB of it); it is not split by race. |
| `races.json` | 33,856 (5,589) | `races[label]` = the reading with its intervals, order readings, counts, tier and timing mix, variants, `trail_or_mountain` and `verdict`; `series[label][name]` = the same for each series of a label with a series note (present only when there is one); `summary`; `band_pct`, `min_editions`, `min_people_each_way` |
| `bests.json` | 19,132 (3,997) | `cohort`; `by_recorded_attempt[]`; `by_years_since_previous_recorded_best[]`; `new_recorded_best_size`; `steps` (`by_step[]`, `first_recorded_to_second_any_years_apart`, `first_recorded_to_second_by_mean_finish[]`) |
| `age.json` | 6,409 (1,433) | `cohort`; `bands[]` (the main column with `same_race`, `verified`, `high`, `all_pairs`, `by_sex`, `cross_section`, `verdict`); `survivorship` |
| `return.json` | 2,180 (727) | the matched shares, `difference_points` with its interval, `unmatched`, `by_finish[]`, `verified`, `high`, `tiers`, `verdict` |
| `recorded_again.json` | not built yet | `cohort`, `age_cohort`; `by_finish_band[]`, `by_finish[]`, `by_age_band[]`, each row `{finish_from_s, finish_to_s}` or `{age_from, age_to}` with `finishes`, `recorded_again`, `all_finishes`, `editions`, `share`, `expected_share`, `difference_points`, `lo_points`, `hi_points`, `verified`, `high`, `same_race`, `men`, `women`, `verdict`; left out when its floors fail |
| `checks.json` | 60,225 (13,362) | `temperature`, `slowdown` (each with its `points`), `fits`, `beyond`, `spread`, `year_levels`, `floor_of_five`, `plain_mean_and_two_standard_errors`, `held_for_review` |
| `manifest.json` | 6 KB | the bindings, `definitions`, `cohort` (the universe, the fit and each file's counts), `files` |

A verdict is one of the codes in the tables above or `null`. `null` is the fallback: the page states no reading in any slot ([AGENTS.md](../AGENTS.md) rule 13).

## Measured

Release `pace-notes-marathon-half-20261113-1113` (published 2026-11-13T23:21:04Z), built November 14, 2026 (UTC) on the adapted input whose `MANIFEST.json` has sha256 `c0ddc847…310b` (input time 2026-11-13T19:30:55Z), with the identity file `152f451b…be5c`, the edition policy `ab43c75e…3541`, the race registry `163ec25d…c6a2` and the link file `60d528ee…a593`. Every count below is this build's; none is deployed. Two builds gave the same bytes for all seven files. One build takes about 3 minutes (200 s) and 5.3 GB at its peak (DuckDB capped at 5 GB), under the heavy-job lock. `scripts/verify-linked.cjs`: 64,666 checks pass; its self-test refuses 18 of 18 broken copies (64,501 and 15 of 15 on the tree that held the build, before the marathon cohort reached the release branch at `87d096ac8` the same day and its checks were added). Counted again from the cohort's records in Node: 201 counted editions, 4,124,023 finishes and 1,288,216 sustained slowdowns, the manifest's three numbers, and the two counts of each of the 161 editions of the whole-field check. An independent SQL recount (`linked-recount.py` in the evidence folder: window functions, not the builders' code) compared 50 published groups (the universe, every recorded attempt and step, every age band) and none differs; and the research prototype's solver gave the same edition readings to 2 × 10⁻¹² on the same pairs once the three rules are applied.

**The universe.** 2,688 editions with rows. F: 845 editions (194 stamped, 616 weaker-source stamped, 35 partial within 5%; 359 with splits, 486 finish-time-only) in 203 races; by timing code 376 chip, 370 chip with a fallback, 15 gun, 4 mixed, 80 not stated. V: 810 editions. W: 2,067 (1,222 unverified). Linked runners: 3,322,174 runner keys with 6,004,379 marathon records, of 3,349,682 keys and 6,180,357 records in the keyed tiers before the screens. Kept results in F: 4,414,671 of 2,582,515 linked runners, 825,387 of them with two or more. Counted editions: 201, with 4,124,023 timing-eligible finishes and 1,288,216 sustained slowdowns (31.24%), the same cohort as the release's published edition-policy list.

**The fit.** 2,098,553 pairs (212,235 of them inside one calendar year) of 645,355 linked runners; 514 editions fitted in 102 races (182 stamped, 301 weaker-source, 31 partial); 318 editions of F fall under the floor of 100 connecting runners, 0 lie outside the largest connected set and 0 are undetermined. Drift: −0.15% over one year apart and +0.21% over two (under rule 3; not a finding). 2 editions are held for review: **New York 2022** (6.48% from the median of New York's chip-timed years) and Lévis-Québec 2012 (6.24%).

**Fast years and slow years.** 437 edition readings in 58 races (162 stamped, 248 weaker-source, 27 partial; 393 on a chip or net basis, 36 not stated, 8 gun): 82 fast, 74 slow, 71 usual, 210 with no verdict. 117 of the 437 (26.8%) lie more than 2% from their race's other years and 52 (11.9%) more than 3%; among the 410 on verified tiers 104 (25.4%) and 45 (11.0%). The median half-width of an interval is 0.60 points. 63 readings have no high-links reading beside them.

| Edition | Tier | Basis | Others | Finishes | Reading | Interval | High links | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chicago 2008 | stamped | not stated | 11 | 12,131 | +4.90 | +4.72 to +5.12 | +4.85 | slow |
| Berlin 2025 | partial | chip or net | 20 | 17,212 | +4.46 | +4.30 to +4.62 | +4.43 | slow |
| Boston 2018 | partial | chip or net | 9 | 13,590 | +2.88 | +2.67 to +3.10 | +2.84 | slow |
| Boston 2026 | partial | chip or net | 9 | 14,298 | −3.89 | −4.03 to −3.74 | −3.98 | fast |
| Chicago 2023 | stamped | chip or net | 7 | 25,106 | −1.40 | −1.54 to −1.26 | −1.24 | fast |
| New York 2019 | stamped | chip or net | 13 | 22,089 | +0.04 | −0.10 to +0.20 | +0.04 | usual |

Chicago's fitted editions fall into two groups, because the release states a timing basis for 8 of the 20 (2015 to 2019 and 2023 to 2025): each year is compared inside its group. The same holds for Warsaw (4 chip, 7 not stated) and Paris (2014 to 2018 not stated, read among themselves; its two chip years are too few).

**Races.** 52 races are read; one more has three chip-timed editions but fewer than 100 linked runners one way. Verdicts: 18 faster, 6 slower, 8 about the same, 20 none.

| Race | Editions used of fitted | Reading | Interval across editions | Runner bootstrap | Earlier / later | Verified / high / wider | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Amsterdam | 12 of 13 | −1.74 | −2.49 to −0.97 | −1.83 to −1.63 | −1.55 / −1.92 | −1.69 / −1.67 / −1.78 | faster |
| Athens | 8 of 8 | +5.11 | +4.54 to +5.68 | +4.94 to +5.30 | +5.90 / +4.33 | +5.23 / +5.03 / +5.04 | slower |
| Berlin | 21 of 21 | −0.89 | −1.75 to −0.01 | −0.95 to −0.81 | −0.83 / −0.94 | −0.92 / −0.98 / −0.87 | faster |
| Boston | 10 of 10 | +0.63 | −0.69 to +1.97 | +0.56 to +0.70 | −0.30 / +1.57 | +0.77 / +0.81 / +0.68 | about the same |
| Chicago | 8 of 20 | −1.21 | −2.30 to −0.12 | −1.28 to −1.15 | −1.27 / −1.15 | −2.02 / −1.28 / −1.23 | faster |
| Hamburg | 9 of 9 | −2.68 | −3.79 to −1.56 | −2.80 to −2.57 | −2.38 / −2.98 | −2.65 / −2.61 / −2.76 | faster |
| London | 3 of 3 | +0.89 | −3.83 to +5.84 | +0.70 to +1.09 | +0.63 / +1.14 | – / +0.62 / +0.81 | none |
| Los Angeles | 8 of 8 | +4.36 | +2.76 to +5.98 | +4.12 to +4.60 | +4.70 / +4.03 | +4.33 / +3.99 / +4.43 | slower |
| New York | 14 of 18 | +0.97 | +0.47 to +1.49 | +0.92 to +1.03 | +0.83 / +1.12 | +0.85 / +0.96 / +1.01 | slower |
| Philadelphia | 12 of 12 | −1.87 | −2.30 to −1.44 | −1.99 to −1.77 | −1.48 / −2.26 | −1.82 / −1.76 / −1.88 | faster |
| Rotterdam | 11 of 12 | −1.17 | −2.45 to +0.12 | −1.28 to −1.05 | −0.85 / −1.49 | −1.15 / −1.22 / −1.17 | none |
| Valencia | 5 of 6 | −2.96 | −4.10 to −1.81 | −3.13 to −2.82 | −3.01 / −2.92 | −2.52 / −3.02 / −2.97 | faster |
| Washington | 12 of 12 | +1.73 | +0.67 to +2.80 | +1.62 to +1.84 | +1.45 / +2.01 | +1.60 / +1.60 / +1.72 | slower |

Paris, Frankfurt, Tokyo, Barcelona, Stockholm, Sydney, Gold Coast, Oslo, Vienna, Honolulu and Prague have no race reading: fewer than three chip-timed editions of F are fitted (Tokyo and Vienna have no edition in F at all; Prague's eight fitted years are gun-timed). With a floor of five editions 36 races would be read (15 faster, 5 slower, 7 about the same, 9 none). By editions used: of the 9 races read on three editions 8 have no verdict; of the 32 read on six or more, 24 have one. The scout's rule alone (plain mean, two standard errors, the order readings) would call 20 faster and 10 slower on the same 52; the plain means correlate 0.995 with the readings. One race read is a mountain course by the registry's flags (Blue Ridge Marathon, +14.8%); two read faster on net-downhill courses the registry does not flag (St. George −4.3%, Big Cottonwood −5.4%). By the registry's `labelled_by`, 19 of the races read carry a plain key, 14 a reviewed label and 19 an unreviewed name taken from a platform title.

**The checks.** Temperature: inside races the edition readings correlate 0.80 with the race-window temperature (188 editions in 22 race-and-basis groups; 0.39% per °C; 0.69 with the start-hour temperature); by band, against the race's own mean: under 8 °C −1.14% (11 editions), 8 to 12 −1.20% (48), 12 to 16 −0.27% (64), 16 to 20 +0.99% (53), 20 and over +2.92% (12 editions in 6 races). Whole field: the readings correlate **0.87** with the whole field's sustained-slowdown share (161 counted editions in 18 groups; 3.77 points per percent), above the bar of 0.7, so the verdict is `holds`. Other fits, against the main one: verified tiers 0.990 over 403 edition readings and 0.997 over 49 races (48 with the same sign); high links 0.982 over 374 and 0.996 over 43 (43); the wider set 0.992 over 437 and 0.996 over 52 (51). The median year-to-year spread of a race is 1.72 points and the spread between the 52 race readings 3.06.

**Recorded bests.** One-marathon-per-year runners in F: 3,692,310 results of 2,448,409 linked runners; the rule leaves out 134,106 runners with two or more results (722,361 results). 1,243,901 results have an earlier recorded marathon (868,551 in stamped editions, 185,986 weaker-source, 189,364 partial); 522,401 were a recorded best. Attempts 2 to 18 are published.

| Recorded attempt | Results | Recorded best | 1/k | Verified / high / complete | Verdict |
| --- | --- | --- | --- | --- | --- |
| 2 | 691,281 | 53.9% | 50.0% | 53.7 / 53.5 / 54.0 | more often |
| 3 | 279,904 | 35.2% | 33.3% | 35.0 / 34.5 / 35.5 | more often |
| 4 | 128,364 | 25.0% | 25.0% | 24.5 / 24.4 / 25.3 | as often |
| 5 | 63,198 | 17.9% | 20.0% | 17.1 / 17.5 / 18.1 | less often |
| 6 | 32,978 | 13.7% | 16.7% | 12.3 / 13.6 / 14.2 | less often |
| 8 | 10,739 | 7.1% | 12.5% | 6.2 / 6.9 / 7.1 | less often |
| 10 | 4,379 | 3.8% | 10.0% | 3.2 / 3.7 / 3.6 | less often |

Years since the previous recorded best (third and later attempts): one year 41.7%, two 31.9%, five 20.4%, ten or more 10.0%. A new recorded best beats the old one by a median 5.19% (12.95 minutes; middle half 5.65 to 25.62 minutes); 23,442 of the 522,401 (4.5%) are by under a minute. Steps at most two years apart: first recorded to second 459,860 pairs, median −1.32%, 56.98% faster (verified 57.0, high 56.5, complete 57.0; `more_often`); second to third 201,330 pairs, +0.02%, 49.89% (`as_often`); third to fourth 95,604 pairs, +0.54%, 47.0% (`less_often`), and `less_often` at every later step to the 17th. First recorded to second over any years apart: 691,281 pairs, −0.84%, 53.9% faster. By the mean of the two finishes: under 3:00 −1.15%, 3:00 to 3:29 −1.89%, 3:30 to 3:59 −1.79%, 4:00 to 4:29 −1.74%, 4:30 to 4:59 −0.91%, 5:00 to 5:59 −0.01%, 6:00 and over +0.76%.

**Getting older.** 1,210,020 linked runners with an exact birth year (2,365,405 results; 1,714,908 results carry their own exact age); 553,565 pairs, 131,857 from the third recorded marathon on (90,455 stamped, 21,898 weaker-source, 19,504 partial). Every band's verdict is `stated`.

| Age | Pairs | Median % per year | Same race | Verified | High | All pairs | Women / men | Cross-section, women / men |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 18–24 | 939 | −1.12 | −1.21 | −0.82 | −0.84 | −1.45 | −1.14 / −1.07 | −1.82 / −1.48 |
| 25–29 | 6,663 | −0.24 | −0.20 | −0.19 | −0.23 | −1.12 | −0.34 / −0.03 | +0.07 / +0.01 |
| 30–34 | 12,222 | +0.06 | +0.12 | +0.12 | +0.03 | −0.80 | +0.10 / +0.03 | +0.31 / +0.02 |
| 35–39 | 17,280 | +0.26 | +0.23 | +0.32 | +0.31 | −0.53 | +0.40 / +0.16 | +0.16 / +0.17 |
| 40–44 | 22,494 | +0.57 | +0.58 | +0.58 | +0.61 | −0.15 | +0.77 / +0.44 | +0.16 / +0.17 |
| 45–49 | 23,870 | +0.79 | +0.73 | +0.84 | +0.80 | +0.26 | +0.91 / +0.73 | +0.68 / +0.54 |
| 50–54 | 20,097 | +0.99 | +1.01 | +1.04 | +0.98 | +0.50 | +1.02 / +0.97 | +0.53 / +0.71 |
| 55–59 | 14,128 | +1.29 | +1.22 | +1.29 | +1.30 | +0.93 | +1.24 / +1.30 | +0.69 / +1.08 |
| 60–64 | 8,288 | +1.40 | +1.45 | +1.34 | +1.38 | +1.16 | +1.20 / +1.53 | +0.78 / +1.19 |
| 65–69 | 3,941 | +1.82 | +1.70 | +1.82 | +1.78 | +1.59 | +1.50 / +1.92 | +1.61 / +1.61 |
| 70 and over | 1,935 | +2.55 | +2.58 | +2.47 | +2.58 | +2.32 | +2.63 / +2.47 | +2.00 / +1.90 |

Survivorship (later result of 2012 to 2019, ages 45 to 64): runners not seen again had slowed a median 1.37% per year in their last pair (13,151 pairs), those seen again 0.96% (20,997).

**Seen again.** 2,719 matched cells in 98 counted editions of 2010 to 2019 (84 stamped, 3 weaker-source, 11 partial): of 506,860 finishes with a sustained slowdown 29.40% were seen again within two years, against 31.87% of their matches: −2.47 points (−2.84 to −2.13), verdict `less_often`. Verified tiers: −2.40; high links: −2.38. Unmatched, the shares are 29.19% (of 528,440) and 34.14% (of 1,096,724). By finish: under 3:30 −5.66 points, 3:30 to 3:59 −2.57 points, 4:00 to 4:29 −1.66 points, 4:30 to 4:59 −1.99 points, 5:00 and over −2.88 points.

### Against the research numbers

The scout measured on its wider set W (2,065 editions, unverified ones included; 1,012 fitted; 2,846,593 pairs of 778,438 runners) without the linked-runner screens. This family differs in six ways, and each moves numbers:

1. **The universe** (D22): F has no unverified edition, so 514 editions are fitted, not 1,012, and 52 races are read, not 123. The scout's own verified-only fit had 483 editions and 55 series.
2. **The trend rule.** The scout's solver returned the minimum-norm solution, which carries an unstated trend of the readings over the years; on this build's pairs it differs from rule 3 by 0.048 log points × 100 per calendar year. It tilts a reading by the distance in years between an edition and the years it is compared with (Berlin 2025: +4.46% here, +3.98% on the scout's numbers re-expressed against the other years).
3. **Against the other years.** The scout quoted an edition against its race's mean, the edition included; this family compares it with the mean of the others, which is larger by n/(n − 1). That, and the smaller groups below, is why 26.8% of readings lie beyond 2% here against the scout's 24%.
4. **Timing basis.** Editions are compared inside one basis, so Chicago's reading rests on its 8 chip-stated years (−1.21; the scout −0.40 on 20, −0.23 on 15 verified), and Chicago 2023 reads −1.40 against 7 years, not −2.30 against 19.
5. **Races against the same years.** A race reading takes out the level every race shares in a year, and New York 2022 is held: New York reads +0.97 (the scout +1.47), with a standard error of 0.23 where the plain spread of its years gave 0.38.
6. **The interval and the guards.** Student's t instead of two standard errors, a runner-bootstrap interval, agreement of the verified and high-links variants, and a band for "about the same": 18 faster and 6 slower, where the scout's rule alone gives 20 and 10 on the same races.

Recorded bests, the steps, the age bands and the matched comparison reproduce the scout's figures to within a few tenths of a point (attempt 2: 53.9% here, 54.0% there; fifth 17.9% and 17.9%; first to second −1.32% and 57.0% faster against −1.3% and 56.9%; ages 50 to 54 +0.99% a year against +1.0; the matched difference −2.47 points against −2.6), on a smaller universe.

### Open points for the lead

- **New York 2022 is held** by the 6% rule (ruled November 14, 2026: the bar stays; later the same day the lead's review released the edition, see [reviews](#reviews-a-held-edition-released-an-edition-excluded); the build below predates the release). The rule cannot tell a data question from the two hottest big-city years: measured net of the year level (not the frozen rule) it would hold Chicago 2008 instead (6.15%) and release New York 2022, which against the mean of its 14 other chip-timed years would read +6.4%. Re-judging the bar is a decision, not a fix; the edition is in the file's evidence with its distance.
- **"Chip or net timing on every one"** (D22; ruled November 14, 2026: this reading stands) is read as: a race reading uses the race's chip- or net-stated editions, at least three. Read the other way (every fitted edition of the race must be chip or net timed, and none held), 44 of the 52 races keep a reading and Amsterdam, Chicago, Eindhoven, Lévis-Québec, New York, Rotterdam, Valencia and Warsaw lose it; `timing` and `held_for_review` on each race let a page apply that rule without a rebuild.
- **No stated timing basis** on 80 editions of F (12 of Chicago's, 7 of Warsaw's, Paris 2014 to 2018). If the producer states them, those years join their race's main group.
- **Three editions** carry a race verdict for 1 of the 9 races read on three (SunRype Okanagan Marathon, faster). A floor of five is reported above.
- **Edition verdicts at the margin.** Between the second and the third build of November 14 (708 linked runners fewer, new bootstrap draws) 15 of the 437 edition verdicts changed, each with an interval end within about 0.1 of the ±1% margin, and no race verdict did. A verdict that close to its margin can change with any rebuild; the reading itself moved by at most 0.12 points.
- **Race labels** (ruled November 14, 2026, D30: the pipeline gives a reviewed label to every race with three or more stamped, weaker-source or partial editions; this family is rebuilt on that registry). 19 of the 52 races read carry an unreviewed platform title ("Bayshore Marathon, Half Marathon, 10K, & Kids Fun Run"). A page may want the registry's `labelled_by` before it prints one.
- **2020 and 2021.** The registry cannot say which editions of those years were run in person; a virtual edition under an ordinary title would be read as a year. (November 14, 2026: the release excluded one marathon edition as virtual, Amsterdam 2020, and says its sweep of titles found no other; the 28 fitted editions of the two years are listed for the lead with their kept results against the race's other years and what the producer's notes say. One note describes a changed course: Warsaw 2020, four waves on a 5 km loop. Ruled the same day: Warsaw 2020 is excluded by review, and there is no rule for the two years as such.)
- **Three kept sentences of the notes search** (Houston's count of rows not loaded; the course-profile notes of Madrid and of Washington, which say the course changed over the years on twelve editions each). Ruled November 14, 2026: kept; no edition is excluded.
- **The identity file changes at M3** (the half's row rule): rebuild this family after it. The verifier sees a changed identity builder, and a rebuilt file once the marathon cohort is rebuilt on it (the two manifests then name different identity files).
- **The cohort of D24 item 1** holds the records the pacing analyses can use; this family also needs the finish times of the 486 finish-time-only editions of F and the age-group-floor flag, so it reads the adapted input, the identity file and the link file directly. What the cohort does hold, the verifier counts again (the counted editions' finishes and sustained slowdowns). The cohort manifest's rule `not_held` says of the editions without a file that "no analysis may use them"; under D22 this family uses their finish times, read from the adapted input as that rule goes on to allow, so the two texts want one wording.
