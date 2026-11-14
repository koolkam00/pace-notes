# Linked records: the same runners across marathons

The family `public/data/linked/` follows marathon records that the producer's person links (v5.1) join to one runner: how the same linked runners finished in different years of one race and at different races, how often a recorded marathon was the runner's best so far, how the finish time changes per year of age in the same runner, and one matched comparison of being seen again after a sustained slowdown. It is built by `analysis/build_linked.py` from the adapted marathon input, verified by `scripts/verify-linked.cjs` (part of `npm run verify:data`) and tested by `analysis/test_linked.py` and `analysis/test_linked_build.py`. This document is the contract: what is pinned, the rules in words, the floors, the guards, what is published, what may be said and what must never be printed. It publishes data only; no page reads it yet.

Marathons only. No half result enters any figure here. "Runner" always means a linked runner: records linked by name, sex and age or birth year by the producer, never a verified person ([AGENTS.md](../AGENTS.md) rules 4 and 10).

## Status (November 14, 2026)

Keep these apart:

- **Decisions.** The adoption plan's lead decisions of 2026-11-14 (UTC): D4 (links of `high_elite`, `high` and `medium` key a runner; the existing sex, birth-year and duplicate-edition screens stay), D13 (which analyses to build, and the limits on each), D19 (the registry label is the pipeline's `city`), D22 (the finish-time universe F) and D3 (counted editions supply every sustained-slowdown share). The owner has not seen this family. Two questions recorded for the owner touch it: D4's use of `medium` links, and whether a race-against-race reading may stand beside the recorded rejection of a fastest-course ranking and a course time converter ([tools](TOOLS.md)); this family publishes neither a rank nor a converted time.
- **Definitions.** Frozen in this document and in `analysis/linked_common.py` before the first build that was kept. A change to any of them is a reviewed change with a dated note here.
- **Measured results.** See [Measured](#measured) for the build this branch holds.
- **Repository state.** Branch `claude/release-20261113-linked`, cut from `claude/release-20261113`. Not merged, no pull request.
- **Deployed state.** Nothing of this family is deployed. No page reads it.

## Inputs and what the manifest binds

| Input | Read for | Bound by |
| --- | --- | --- |
| The adapted marathon input (`analysis/adapt_combined.py`, FULL bundle): `features.parquet`, `race_records.parquet`, `edition_meta.parquet`, `race_conditions.parquet`, `EDITIONS.json` | results, links, tiers, timing basis, weather rows | the sha256 of its `MANIFEST.json`, which must be the one the frozen edition policy names (`inputs.adapted_manifest_sha256`); every member read must be the file that manifest lists |
| The edition policy, `analysis/edition-policy-20261113-1113.json` | counted editions; the category of every other edition | its sha256 (`analysis/source_quality.py` refuses any other bytes) |
| The race registry, `analysis/race-registry.json` | race labels | its sha256, which the edition policy also names |
| The release's link file, `person-ids-v5.1-race_results_linked.parquet` | one flag: `age_is_group_floor` in `record_flags` (the adapted `record_flags.parquet` holds flag names without values, so the flag cannot be read there) | its sha256 in `analysis/release.json` |
| The builders: `build_linked.py`, `linked_common.py`, `linked_universe.py`, `linked_model.py`, `linked_races.py`, `linked_histories.py`, `linked_return.py`, and the site definitions they import (`build_pacing.py`, `build_public_explorer.py`, `source_quality.py`) | | each by sha256; a changed script without a rebuild fails the verifier |

`manifest.json` carries the release tag, the input's manifest digest and time, these digests, the frozen numbers (`definitions`), the cohort counts and each file's bytes and sha256. The family files themselves carry no release tag. The build is deterministic: no timestamp, a fixed bootstrap seed (20261114), one BLAS thread; two builds give the same bytes.

## The rules, in words

### Editions: the finish-time universe F

An edition (a race label and a year) with at least one row in the adapted input is in **F** when both hold:

1. its tier is `stamped` or `stamped_weaker_source`, or it is `partial` and the release's rows with a finish time divided by its official finisher count lie between 0.95 and 1.05, both ends included (the edition policy's own reading of coverage: `finishes_in_release / official_finishers` of the adapted `EDITIONS.json`);
2. the edition policy does not list it under `selected_field`, `mixed_distance_list`, `incomplete_ingestion` or `unreconciled_hold` (a reason that is not about its split grid).

The split tier does not matter: a finish-time-only edition and an edition whose split grid the policy rejects (`invalid_split_grid`) keep their finish times. A `held_for_review` or `unverified` edition is never in F. **V** (verified tiers) is F without the partial editions. **W** (wider) is the same rule with `unverified` also allowed in clause 1; it exists for one sensitivity fit and nothing in a published figure rests on it. The builder stops if its reading of an edition disagrees with the policy (a counted edition outside F, an edition of F listed for a reason it does not know, or a different reading of the 5% band).

A **counted** edition is the edition policy's (plan decision D3). Every sustained-slowdown share in this family is read on timing-eligible finishes of counted editions with the site's own code (`build_pacing.prepare`, `build_public_explorer.threshold_sql`).

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

A **linked runner** is a `runner_id` of the adapted input: the producer's `person_id` where the link confidence is `high_elite`, `high` or `medium` (the adapter's frozen IDENTITY rule; the builder checks the input follows it), kept only when it passes the screens the existing builders apply (`analysis/build_extended.py`, `safe_ids`), counted over every keyed record of the runner in the adapted input: at most one recorded sex, recorded birth years at most two apart, and never two records in one edition. Weaker links (`medium_variant` and every `low_*`) key nothing.

A **kept result** is a record of a linked runner in an edition of the universe at hand with a finish time from 2:00:00 to 12:00:00, both ends included.

Four variants are computed beside every main figure and never replace it:

| Variant | Results |
| --- | --- |
| verified | kept results in V |
| high | kept results in F whose own link is `high_elite` or `high` |
| wider | kept results in W (the pair model only) |
| complete | kept results in F of runners none of whose linked records, on any tier and any link confidence, lies outside them (recorded bests only) |

A variant is a universe: histories, attempt numbers and pairs are formed again from its results alone.

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

Published per edition, keyed by registry label and year: tier, timing code, basis, `finishes` (the edition's kept results that have a fitted pair), `others` (the other editions it is compared with), `reading_pct`, `lo_pct`, `hi_pct`, `high_pct`, `verdict`.

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

- `se`: the standard deviation (n − 1) of the race's editions around its level and their year levels, divided by √n, in log points × 100.
- `lo_pct`, `hi_pct`: reading ± t × se on the log scale, where t is the two-sided 95% point of Student's t with n − 1 degrees of freedom (4.30 for three editions, 2.78 for five, 2.09 for twenty; never under 2).
- `boot_lo_pct`, `boot_hi_pct`: the 2.5th and 97.5th percentile of the same level over the runner bootstrap.
- `earlier_pct`, `later_pct`: the reading minus and plus the race's order term: the reading when this race was the earlier, and the later, of a pair (the brief's "when first" and "when second").
- `people_earlier`, `people_later`: linked runners with a different-year pair between one of the race's used editions and another race, by which came first. A race with fewer than 100 either way gets no reading.
- `year_sd_pct`: the standard deviation of the race's edition readings (the year-to-year spread a runner meets), in log points × 100.
- `variants`: the race's reading from the verified, high and wider fits, where that fit reads it (three editions), each shifted so that the races it shares with the main fit have the same mean reading.
- `tiers`, `timing`, `editions`, `editions_fitted`, `held_for_review`, `years` (first and last used year), `finishes`, `people`.

| Verdict | Guard (all must hold) |
| --- | --- |
| `faster` | `reading_pct`, `earlier_pct`, `later_pct` and every existing verified and high variant are below 0; `hi_pct` < 0; `boot_hi_pct` < 0 |
| `slower` | the same with every sign reversed (`lo_pct` > 0, `boot_lo_pct` > 0) |
| `about_the_same` | `lo_pct`, `hi_pct`, `boot_lo_pct`, `boot_hi_pct`, `earlier_pct` and `later_pct` all lie strictly between −2 and 2 |
| none | anything else: the page shows the interval and the counts and states no reading of the race |

The file holds races in label order. It has no rank, no order by value, no "fastest" and no converted or equivalent time, and the verifier refuses any such key.

### Recorded bests and the steps between recorded marathons (`bests.json`)

**The one-marathon-per-year rule.** The release dates too few editions to order two marathons of one year. Every figure of this and the next section keeps only linked runners with at most one kept result in every calendar year of the universe at hand; a runner's **recorded attempt** number is the place of the result in the runner's kept results in year order. "First", "second" and "best" mean first, second and best in these records, and every key and label in the files says "recorded".

- **Recorded best so far.** A result with at least one kept result in an earlier year is a recorded best when its finish time is strictly below every one of them (a tie is not a new best).
- **By recorded attempt** (`by_recorded_attempt`): results and recorded bests for attempts 2, 3, … up to the last attempt before the first that holds fewer than 100 results; `shuffled_share` is 1/k, what the k-th of k results would be if their order carried no information; the three variants beside.
- **By years since the previous recorded best** (`by_years_since_previous_recorded_best`): third and later recorded attempts, by calendar years since the latest earlier year that holds the best so far; years 1 to 9 and "10 or more", the cap lowered until every bin holds 100 results.
- **The size of a new recorded best** (`new_recorded_best_size`): over every new recorded best, the quartiles of the gain as a percent of the previous best and in minutes, and the count of gains under one minute.
- **The steps** (`steps.by_step`): consecutive recorded attempts at most two calendar years apart: pairs, the count of later results that were faster, the median and quartiles of the change as a percent, for the step from attempt 1, 2, … up to the last before the first step with fewer than 100 pairs. The step from the first recorded marathon is also given over any number of years apart, and by the **mean of the two finishes** (under 3:00, then half-hour bands to 5:00, 5:00 to 6:00, 6:00 and over; bands under 100 pairs are cut from either end). No figure is banded by the first finish alone or by the second: either banding manufactures a trend by regression to the mean.

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

Timing-eligible finishes of linked runners in counted editions of 2010 to 2019, with a recorded sex. A finish with a sustained slowdown is matched with the finishes without one in the same edition, sex and 10-minute finish band; a cell needs 20 finishes on each side and weighs its finishes with a slowdown. **Seen again within two years** means a kept result of the same linked runner in F in one of the next two calendar years. A marathon outside these records does not count, so both shares are floors and only their difference is read. The interval of the difference resamples whole editions (400 draws). The file gives the matched shares, the difference in points with its interval, the unmatched shares, the same by finish band where 100 finishes with a slowdown and 3 editions allow, and the high-links variant.

| Verdict | Guard |
| --- | --- |
| `less_often` | the interval of the difference lies below 0 and the high-links difference, where there is one, is below 0 |
| `more_often` | the mirror image |
| none | anything else |

### The checks (`checks.json`)

Recomputed on every build and published with the points they are computed from, so the verifier recounts them:

- **Temperature.** For fitted editions with a weather row, in race-and-basis groups of at least three: the correlation and slope, inside races, of the edition's model reading with the mean temperature of the race window (and with the start-hour temperature), and the mean deviation from the race's own mean by temperature band (under 8 °C, 8–12, 12–16, 16–20, 20 and over; a band needs three editions). No weather enters the fit.
- **The whole field's sustained-slowdown share.** For counted editions with at least 1,000 timing-eligible finishes that are at least half of the edition's finishes, in race-and-basis groups of at least four: the correlation, inside races, of the edition's model reading with the share of the whole field's eligible finishes that had a sustained slowdown. No person link enters that share. Verdict `holds` when the correlation is at least 0.7; a page about fast and slow years falls back when it does not.
- **Other fits.** The verified, high and wider fits: pairs, runners, fitted editions; the correlation of edition readings and of race readings with the main fit over what both hold; the standard deviation of the race differences; how many race readings share the main sign.
- **Spread.** The count of edition readings beyond 2% and beyond 3%, over all and over verified-tier editions; the median year-to-year spread of a race and the spread between races.
- **Year levels** of the split used for the race readings (a year needs three editions).
- **What other rules would give.** The race verdicts with a floor of five editions; and the scout's rule alone (the plain mean of a race's edition readings, two standard errors of that mean, the order readings) on the same races.
- **Held for review:** the editions held, by label and year.

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

A group under a floor is left out; a range is narrowed from its thin end; no floor is lowered to keep a figure ([AGENTS.md](../AGENTS.md) rule 13).

## What may be said and what must never be printed

Carried from the research findings of 2026-11-14 (the scout's `FINDINGS.md`, sections A, B, C, F and H). A page prints a sentence only from a nugget whose guard is the verdict in the file.

| Analysis | May be said (under its guard) | Must never be printed |
| --- | --- | --- |
| Fast and slow years | "At New York in 2022 the same runners finished about 5% slower than in the race's other years (records linked by name)." Once, as the finding: the share of editions more than 2% off their race's other years. | A cause ("the heat cost 5%"). An adjusted version of anyone's time. A reading for a year whose verdict is none. The drift as a fact about ageing or about the calendar. |
| Races | "Runners who ran Valencia and another marathon within two years finished about 2.6% faster at Valencia (records linked by name)." | "Valencia is 2.6% faster". Any rank, "fastest" list or ordering by reading. An equivalent or converted time ("your 3:45 in New York is a 3:39 in Valencia"). A reading for a race with editions on mixed timing bases, or with no verdict. |
| Recorded bests, steps | "A second recorded marathon was a recorded best 54% of the time." "Of runners with a second recorded marathon within two years, 57% ran it faster than the first recorded one." | "Personal best", "PB" or "first marathon" without "recorded"; "debut". "Your chance of a best" in any form. A cause for the decline. "Experience makes you faster". "Slower runners improve most" (regression to the mean). "Runners learn to avoid the slowdown". |
| Getting older | "Runners aged 50 to 54 with three or more recorded marathons, who kept racing, ran the next one a typical 1.0% slower per year; comparing different runners of those ages shows about 0.6%." With "Not a prediction". | "You will slow 1% a year". "Ageing costs 1% a year". An age read from an age group. A rate for "runners" without "who kept racing". |
| Seen again | "At the same race and finish time, runners with a sustained slowdown were seen in another recorded marathon within two years slightly less often: 31% against 33%." | "X% of marathoners never run another". Any return share as a fact about runners. A comparison of races. "A slowdown puts runners off". |

Every linked figure says "records linked by name". Counts are finishes, results or pairs; a count of linked runners (`people`) is for `/methodology`, never "N runners" in copy. The numbers above are the scout's on its wider edition set and are examples of wording, not this build's values.

Two properties of the links belong on `/methodology` once, beside any page that uses this family: the link build refuses a merge when two finish times of one distance differ by more than a ratio of 1.70 (so every distribution of within-runner change is cut at its tails), and the share of a race's records that can be followed runs from about a quarter to over nine tenths by race (so no person-based rate may be compared between races).

## How it is verified

`node scripts/verify-linked.cjs` (in `npm run verify:data`), from the repository alone:

1. the manifest against the pins: release tag, policy file and digest (and the digest `source_quality.py` pins), registry digest, the adapted input's manifest digest (the one the policy names), the link file's digest, every builder script's sha256, every file's bytes and sha256, and the frozen numbers against its own copy;
2. the shape of every file; floors on every group; no identifier, name, rank, order or converted-time key; strings only as closed codes or registry labels; no person id, release tag or banned word in any string; "recorded" in every key that says best or first;
3. every verdict recomputed from the published numbers, the race intervals recomputed from the reading, the standard error and Student's t, the shares from their counts;
4. the checks recounted from their published points; the summaries recounted from the rows; the files against each other.

The Python tests cover the pair model on synthetic data (known readings, order terms and drift recovered; the trend rule; the floors; the largest connected set; a race seen only as the later race), the one-marathon-per-year rule, recorded bests, the age rule, every verdict, the published-file scan, the edition sets, and a whole build on a synthetic adapted input run twice for the same bytes.

## Rebuild

```
until mkdir /home/user/pn-data/heavy.lock 2>/dev/null; do sleep 20; done   # one heavy job at a time
PACE_LINKED_DUCKDB_MEMORY=5GB python3 -I analysis/build_linked.py \
  --input "$PACE_INPUT_DIR" --links "$PACE_RELEASE_DIR/person-ids-v5.1-race_results_linked.parquet"
rmdir /home/user/pn-data/heavy.lock
node scripts/verify-linked.cjs
```

A rebuild whose cohort counts differ from the manifest in `public/data/linked/` prints the change and stops unless `--accept-counts` (a reviewed refresh only). Rebuild when the adapted input, the edition policy, the race registry, the release pin or any bound script changes; the verifier fails until then.

## Measured

Not built yet at this commit. The first kept build's numbers, each with the release tag and date, replace this line.
