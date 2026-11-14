# Held editions and the editions of 2020 and 2021: evidence for the lead's review

Linked-records family (M5-data), written November 14, 2026 (UTC) for the lead's rulings 2 and 3 on the M5-data report. Every number is from release `pace-notes-marathon-half-20261113-1113`, on the build the branch holds (adapted input manifest `c0ddc847…`, identity file `152f451b…`; built 2026-11-14). **Nothing is changed by this file**: no rule, no bar, no published file. A release, if the lead rules one, is a reviewed, dated entry in the contract.

How it was computed: the main fit of the published build was run again with the builders at the pushed head `424cc4f1a` (the same universe, seed and 400 draws). Before anything else the run checked that it reproduces the published family: all 437 edition readings and all 52 race readings came out equal, field for field (reading, interval, variants, verdict). Only then did it compute what a held edition would read, with the same code, as if the screen had not held it. The scripts and the data of the run (`held_review.py`, `held-review.json`, `render_held.py`) are in the adoption's working folder `adopt/linked/work/`, outside the repository; the run took 141 seconds and 1.1 GB under the heavy-job lock (05:55 to 05:58 UTC).

## 1. The editions the 6% screen holds (2)

The screen: an edition whose fitted reading lies more than 6% from the median reading of its race and timing basis (three or more editions) is held, gets no reading, and is left out of every comparison and of the race reading.

| | **New York 2022** | **Lévis-Québec 2012** |
| --- | --- | --- |
| Race name of the edition | New York City Marathon | Marathon SSQ Lévis-Québec |
| Tier | stamped | stamped_weaker_source |
| Timing code and basis | chip, chip_or_net | chip, chip_or_net |
| Connected runners (linked runners with a pair in the fit) | 19,814 | 465 |
| Kept results; finishes in the release; official finishers | 39,038; 47,710; 47,839 | 928; 1,152; 1,152 |
| Distance from the median of its race and basis (what the screen measures) | +6.48% (15 editions in the group) | +6.24% (7 editions in the group) |
| **Reading it would have** (against the other years on its basis; 95% interval of the runner bootstrap) | **+6.44%** (+6.29 to +6.60), against 14 other years | **+5.45%** (+4.38 to +6.55), against 6 other years |
| The same reading on high links only; on verified tiers only | +6.37%; +6.61% | +4.57%; +5.51% |
| Verdict it would get | `slow` | `slow` |
| Race-morning temperature (weather row, at the recorded start hour), and its rank among the race's fitted years with a weather row (1 = warmest) | 19.9 °C at 09:00 on 2022-11-06; rank 1 of 17 | no weather row (none for any of its fitted years) |
| Race-morning relative humidity, and its rank (1 = most humid) | 82%; rank 8 of 17 | — |
| Dew point at the start; mean and maximum temperature of the race window; mean humidity of the window (rank each) | 16.7 °C (rank 1 of 17); 22.6 °C (rank 1 of 17) and 23.8 °C (rank 1 of 17); 73% (rank 3 of 17) | — |
| Whole-field sustained-slowdown share (counted editions only; no person link in it), and its rank among the race's counted years (1 = highest) | 45.20% of 46,935 finishes (21,215); rank 1 of 17 | not a counted edition (finish times only); none of its fitted years is counted |
| The race reading now | +0.97% (+0.47 to +1.49 across editions; +0.92 to +1.03 by the runner bootstrap) on 14 editions, verdict `slower` | +1.29% (−1.80 to +4.47 across editions; +0.67 to +1.90 by the runner bootstrap) on 6 editions, no verdict |
| The race reading if the edition were released | +1.35% (+0.45 to +2.25 across editions; +1.29 to +1.40 by the runner bootstrap) on 15 editions, verdict `slower` | +2.23% (−1.02 to +5.59 across editions; +1.67 to +2.80 by the runner bootstrap) on 7 editions, no verdict |
| Completeness, as the release states it | complete: DB 47710 finishes vs official 47839 (-0.27%), within 0.5% | complete: DB 1152 vs MarathonGuide 1152 (+0.00%), within 0.5% |
| Hold note or release note of the producer | none | none |

Ranks count the race's fitted years that have the measurement: New York has 18 fitted years, 17 with a weather row and 17 counted; Lévis-Québec has 7 fitted years, none with a weather row and none counted (its editions give finish times only).

### New York: every fitted year

| Year | Tier | Timing | Connected runners | Kept results | From the median of its basis | Published reading | Verdict | Start temperature | Start humidity | Window mean temperature | Whole-field share |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 2006 | stamped | mixed (no basis) | 9,461 | 32,175 | — | — | — | 3.3 °C | 85% | 7.1 °C | 30.47% |
| 2007 | stamped | mixed (no basis) | 12,569 | 32,871 | — | — | — | 7.4 °C | 81% | 11.5 °C | — |
| 2008 | stamped | chip | 13,232 | 32,716 | −0.41% | −0.48% | `usual` | 4.6 °C | 63% | 7.4 °C | 31.16% |
| 2009 | stamped | chip | 15,451 | 36,946 | −0.80% | −0.90% | none | 9.6 °C | 90% | 10.9 °C | 31.68% |
| 2010 | stamped | chip | 15,457 | 38,233 | −0.54% | −0.62% | `usual` | 3.3 °C | 69% | 6.5 °C | 34.17% |
| 2011 | stamped | chip | 16,633 | 39,930 | −0.06% | −0.10% | `usual` | 2.8 °C | 89% | 8.5 °C | 37.08% |
| 2013 | stamped | chip | 18,921 | 42,563 | −1.41% | −1.55% | `fast` | 7.8 °C | 67% | 9.2 °C | 31.15% |
| 2015 | partial | chip | 21,623 | 42,164 | +1.16% | +1.22% | `slow` | 11.8 °C | 78% | 14.2 °C | 42.71% |
| 2016 | stamped | chip | 23,605 | 43,744 | +0.47% | +0.47% | `usual` | 10.3 °C | 71% | 11.6 °C | 35.43% |
| 2017 | stamped | chip | 24,856 | 43,345 | +0.41% | +0.41% | `usual` | 12.2 °C | 88% | 14.3 °C | 33.73% |
| 2018 | stamped | chip | 23,025 | 44,703 | +0.75% | +0.77% | `usual` | 7.6 °C | 60% | 9.8 °C | 38.94% |
| 2019 | stamped | chip | 22,089 | 45,223 | +0.07% | +0.04% | `usual` | 6.8 °C | 67% | 9.6 °C | 34.32% |
| 2021 | stamped | chip | 12,660 | 20,607 | +0.00% | −0.04% | `usual` | 5.4 °C | 86% | 9.8 °C | 34.84% |
| 2022 **(held)** | stamped | chip | 19,814 | 39,038 | +6.48% | — | — | 19.9 °C | 82% | 22.6 °C | 45.20% |
| 2023 | stamped | chip | 23,924 | 42,313 | +1.76% | +1.86% | `slow` | 8.6 °C | 90% | 13.4 °C | 37.05% |
| 2024 | stamped | chip | 26,656 | 45,966 | −0.74% | −0.84% | `usual` | 5.0 °C | 61% | 9.7 °C | 27.06% |
| 2025 | stamped | chip | 25,557 | 48,930 | −0.14% | −0.19% | `usual` | 5.4 °C | 84% | 10.8 °C | 30.12% |
| 2026 | stamped | not_stated | 19,552 | 51,124 | — | — | — | — | — | — | 29.29% |

### Lévis-Québec: every fitted year

| Year | Tier | Timing | Connected runners | Kept results | From the median of its basis | Published reading | Verdict | Start temperature | Start humidity | Window mean temperature | Whole-field share |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| 2003 | stamped_weaker_source | chip | 226 | 886 | −2.98% | −4.42% | `fast` | — | — | — | — |
| 2004 | stamped_weaker_source | chip | 250 | 755 | −0.46% | −1.43% | none | — | — | — | — |
| 2010 | stamped_weaker_source | chip | 322 | 766 | +5.55% | +5.75% | `slow` | — | — | — | — |
| 2012 **(held)** | stamped_weaker_source | chip | 465 | 928 | +6.24% | — | — | — | — | — | — |
| 2014 | stamped_weaker_source | chip | 564 | 1,042 | +3.72% | +3.55% | `slow` | — | — | — | — |
| 2015 | stamped_weaker_source | chip | 521 | 894 | +0.00% | −0.89% | none | — | — | — | — |
| 2016 | stamped_weaker_source | chip | 552 | 889 | −1.10% | −2.20% | `fast` | — | — | — | — |

### What the evidence does and does not show

- **New York 2022.** Two measurements that use no person link point the same way as the reading. Its weather row is the warmest of the 17: 19.9 °C at the start (the next is 12.2 °C in 2017), with the highest dew point, window mean and window maximum. Its whole-field sustained-slowdown share, 45.20%, is the highest of the 17 counted years (the next is 42.71% in 2015). The edition is stamped, chip-timed and complete against the official count, and the high-links and verified-tiers readings agree with the main one to within 0.16 points. None of this says why the year was slow; it says the reading is not an artefact of the links.
- **Lévis-Québec 2012.** There is nothing to hold the reading against: no weather row and no counted year for this race, and the producer's completeness note carries a date ("date=2012-08-26") that the adapted input does not take as a race date. The race's years are far apart by themselves (year-to-year spread 3.51% with 2012 in): 2010 reads +5.75% and is published, +5.55% from the median, just under the bar that holds 2012 at +6.24%. The source is weaker-source stamped (a secondary statistics site), and 465 linked runners connect the edition.
- **Either way.** Releasing an edition changes the readings of its race's other years on the same basis (each is read against the others) and the race reading, as the last two rows show; New York keeps its verdict (`slower`), Lévis-Québec keeps none.

## 2. Fitted editions of 2020 and 2021 (28)

The finish-time universe F holds 63 editions of 2020 and 2021 (14 of 2020, 49 of 2021); 28 of them are fitted (at least 100 linked runners connect them), and those are listed. "Kept results" are results of linked runners with a finish from 2:00:00 to 12:00:00. The ratio compares them with the median of the race's other fitted years. The reading and verdict are the published ones; "no reading" means the edition is fitted but has fewer than two other fitted years on its timing basis. The date is the adapted input's race date, where it has one. The last column quotes every producer note on the edition that speaks of its format (completeness reason, hold note, release note, course notes, weather-row notes, source notes; searched for: virtual, elite, covid, pandemic, postpon, cancel, wave, loop, restrict, limited, lockdown, corona, reduced, remote, self-timed).

| Race | Year | Tier | Timing basis | Kept results | Ratio to the median of the other fitted years | Reading (95% interval) | Verdict | Race date in the input | What the release's notes say about the format |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- |
| Amsterdam | 2021 | stamped | chip_or_net (chip) | 3,688 | 0.48 (12 years, median 7,604.5) | −0.32% (−0.66 to +0.03) | `usual` | 2021-10-17 | nothing |
| Austin | 2020 | stamped_weaker_source | chip_or_net (chip_fallback) | 2,242 | 1.00 (5 years, median 2,230) | +0.52% (−0.33 to +1.22) | none | none | nothing |
| Berlin | 2021 | stamped | chip_or_net (chip) | 17,892 | 0.59 (20 years, median 30,285.5) | +3.42% (+3.23 to +3.62) | `slow` | 2021-09-26 | weather-row note: "first Berlin Marathon after 2020 COVID cancellation (26 Sep 2021)" |
| Big Beach Marathon, Half Marathon & Safari 5K | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 225 | 0.90 (3 years, median 249) | +1.23% (−1.04 to +3.53) | none | none | nothing |
| Big Cottonwood | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 612 | 0.64 (5 years, median 957) | −0.16% (−1.34 to +1.04) | none | none | nothing |
| Boston | 2021 | stamped | chip_or_net (chip) | 12,843 | 0.57 (9 years, median 22,355) | +1.67% (+1.49 to +1.85) | `slow` | 2021-10-11 | weather-row note: "COVID-shifted autumn edition (Mon 11 Oct 2021)" |
| Chicago | 2021 | stamped | not_stated | 21,930 | 0.67 (19 years, median 32,767) | +4.07% (+3.86 to +4.28) | `slow` | 2021-10-10 | nothing |
| Columbus | 2021 | stamped_weaker_source | not_stated | 1,401 | 0.48 (5 years, median 2,911) | +0.22% (−0.51 to +0.99) | `usual` | none | nothing |
| Combos(R) Marathon and Half Marathon | 2020 | stamped_weaker_source | chip_or_net (chip_fallback) | 347 | no other fitted year | no reading | — | none | nothing |
| Dubai | 2020 | stamped | chip_or_net (chip) | 1,513 | 0.98 (5 years, median 1,548) | −0.49% (−1.58 to +0.54) | none | 2020-01-24 | nothing |
| Eindhoven | 2021 | stamped | chip_or_net (chip) | 1,023 | 0.70 (13 years, median 1,460) | +0.50% (−0.06 to +1.05) | none | 2021-10-10 | nothing |
| Foot Levelers Blue Ridge Marathon | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 359 | 0.96 (4 years, median 375.5) | +1.40% (−2.14 to +4.76) | none | none | nothing |
| Milwaukee Lakefront Marathon | 2021 | stamped_weaker_source | not_stated | 1,460 | no other fitted year | no reading | — | none | nothing |
| Napa Valley Marathon | 2020 | stamped_weaker_source | chip_or_net (chip_fallback) | 1,206 | 1.01 (6 years, median 1,189.5) | −2.31% (−3.15 to −1.48) | `fast` | none | nothing |
| New York | 2021 | stamped | chip_or_net (chip) | 20,607 | 0.49 (17 years, median 42,313) | −0.04% (−0.24 to +0.14) | `usual` | 2021-11-07 | nothing |
| Philadelphia | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 5,931 | 0.71 (11 years, median 8,296) | +0.14% (−0.22 to +0.47) | `usual` | none | nothing |
| Portland | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 1,108 | 0.73 (1 year, median 1,517) | no reading | — | none | nothing |
| Rehoboth Seashore Marathon and Half Marathon | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 582 | no other fitted year | no reading | — | none | nothing |
| Rock 'n' Roll San Diego | 2021 | stamped_weaker_source | chip_or_net (chip) | 2,080 | 0.43 (3 years, median 4,871) | +0.27% (−0.91 to +1.44) | none | none | nothing |
| Rotterdam | 2021 | stamped | chip_or_net (chip) | 7,257 | 0.86 (11 years, median 8,429) | −0.81% (−1.07 to −0.55) | none | 2021-10-24 | weather-row note: "COVID-shifted autumn edition (24 Oct 2021)" |
| Space Coast Marathon & Half Marathon | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 799 | 1.13 (4 years, median 706.5) | −3.34% (−4.47 to −2.14) | `fast` | none | nothing |
| The Woodlands Marathon | 2020 | stamped_weaker_source | chip_or_net (chip_fallback) | 691 | 1.00 (5 years, median 688) | −2.01% (−3.27 to −0.85) | none | none | nothing |
| The Woodlands Marathon | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 706 | 1.03 (5 years, median 688) | −2.02% (−3.06 to −1.01) | `fast` | none | nothing |
| Twin Cities | 2021 | stamped_weaker_source | not_stated | 2,681 | 0.47 (2 years, median 5,707.5) | +1.92% (+1.18 to +2.66) | `slow` | none | nothing |
| University of Michigan Health-West Grand Rapids Marathon | 2021 | stamped_weaker_source | chip_or_net (chip_fallback) | 555 | 0.63 (6 years, median 883.5) | +0.99% (−0.17 to +2.22) | none | none | nothing |
| Valencia | 2021 | stamped | chip_or_net (chip) | 9,577 | 0.55 (5 years, median 17,326) | +0.44% (+0.23 to +0.62) | `usual` | 2021-12-05 | nothing |
| Warsaw | 2020 | stamped | not_stated | 730 | 0.15 (10 years, median 4,802.5) | +0.38% (−0.36 to +1.18) | none | 2020-09-27 | completeness reason: "COVID edition: four separate waves (max 250 each) on a 5 km city loop, 2020-09-26/27" |
| Warsaw | 2021 | stamped | not_stated | 2,354 | 0.49 (10 years, median 4,802.5) | +1.17% (+0.69 to +1.64) | none | 2021-09-26 | nothing |

### What the release says about format, and what it does not

- **Virtual races.** The release excluded one marathon edition as `virtual_race`, Amsterdam 2020 (794 rows; RELEASE-EXCLUSIONS.csv: "the race was cancelled and replaced by a virtual (self-timed, app-recorded) run; left out of every release"). Its CHANGE-REPORT.md adds: "A name sweep on both distances (virtual / virtuel / virtueel / remote / \"wherever you are\" ...) found no other virtual editions". The sweep reads titles, so an edition run virtually under an ordinary title would not be found by it; no note on any of the 28 says "virtual", "elite" or "self-timed".
- **A changed course.** One note describes one: Warsaw 2020, "COVID edition: four separate waves (max 250 each) on a 5 km city loop, 2020-09-26/27". Its kept results are 0.15 of the median of Warsaw's other fitted years, the lowest ratio in the table, and the family reads it today as a year of the same race (+0.38%, no verdict). Under ruling D29 it will be read inside the PZU series (2019 to 2026), still as one of that race's years.
- **Moved dates.** Three weather-row notes speak of the calendar: Boston 2021 and Rotterdam 2021 are each a "COVID-shifted autumn edition" (Boston with a "rolling mass start"), and Berlin 2021 is the "first Berlin Marathon after 2020 COVID cancellation". An edition moved to another season is compared with the race's other years as if nothing had moved.
- **Field size.** 16 of the 25 editions with another fitted year hold under three quarters of the race's usual kept results (the lowest after Warsaw 2020: Rock 'n' Roll San Diego 2021 0.43, Twin Cities 2021 0.47, Columbus 2021 0.48, Amsterdam 2021 0.48); 9 are at or above it, among them the 2020 editions of Austin, Dubai, Napa Valley and The Woodlands. Only Dubai 2020 (2020-01-24) and Warsaw 2020 have a date in the input among the 2020 editions; the adapted input states no date for the others, and none is inferred here.
- **Not in the release's notes at all:** whether a field was restricted to an elite or invited start, capped, or run in waves (Warsaw 2020 excepted). The ratios are the only evidence of a reduced field.

