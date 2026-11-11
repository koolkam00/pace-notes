# Weather analyses: history (earlier releases)

Moved November 11, 2026 from `docs/WEATHER_ANALYSES.md` at `de9f8c6f` (`main`), word for word: lines 83–111, everything under its heading "## History (earlier releases)". Only the targets of relative links are re-pointed, so that they resolve from this folder; a link to a heading that stayed in the source document now names that document. Counts belong to the release they name; do not quote them as current.

Text moved here word for word on October 30, 2026 from this file as it stood at `main`'s commit `a2c6e507`, when the sections above were rewritten for 1050 and the redesigned site. Counts belong to the release they name; do not quote them as current. Older versions are in Git history.

### The opening line, as written on October 22, 2026 (line 3)

Recalculated October 22, 2026, from `private-export-20261021-1050` (repository state on branch `data/release-1050`; deployment is recorded in the [project handoff](../PROJECT_HANDOFF.md)). [analysis/weather-release.json](../../analysis/weather-release.json) and [analysis/release.json](../../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs. The supporting study also uses this source; the 1652 and 0934 figures remain historical evidence in Git history, the [1652 refresh](../REFRESH_20261016_1652.md) and the [0934 refresh](../REFRESH_20260912_0934.md). See the [current refresh audit](../REFRESH_20261021_1050.md) for source checks and edition exclusions. Deployment is recorded separately from calculation.

### The decision table's routes and the redesign note, as written before the redesign merged (lines 11–15 and 19)

| Candidate | Typical exposure contrast | Adjusted difference in slowing, percentage points | 98.33% interval | Decision |
| --- | --- | ---: | --- | --- |
| Humidity / dew point | 4.1°C to 10.9°C dew point | +0.54 | −0.37 to +1.62 | Withheld: inconclusive; neither a clear association nor a precise small difference |
| First-four-hours warming | +2.5°C to +6.3°C temperature rise | +2.10 | +1.60 to +2.58 | Publish at `/analyses/warming-and-pacing` |
| Start wind speed | 2.20 to 4.41 m/s, approximately 4.9 to 9.9 mph | +0.36 | −0.08 to +0.75 | Publish at `/analyses/wind-and-pacing`, limited to this pacing measure and typical wind contrast |

Redesign (branch `rd/l2`, October 17, 2026; repository state, not deployed): the two published questions are now the Warming and Wind tabs of `/analyses/race-day-weather` (`#warming`, `#wind`), each stated by its nugget in `lib/nuggets/analyses.ts` (`weather.warming`, `weather.wind`; since October 18, 2026 the selected tab's nugget is the page's H1) and drawn as one interval strip against the ±1-point band of no material difference, its ends given in plain words (the 98.3% level is stated on `/methodology`). `/analyses/warming-and-pacing` and `/analyses/wind-and-pacing` remain as noindex stubs that forward to their tab with the hash; the 308s and their removal from the sitemap belong to the redesign's WP8. The evidence, the decisions and the 98.3% intervals are unchanged.

### Population, as written for release 1652 (lines 25 and 29–33)

1652: the FULL and CORE archives passed size, SHA-256 and schema checks. All twelve shared members are byte-identical and match `SHA256SUMS.txt`. The 4,915,355 raw and feature rows have unique, non-null canonical IDs with identical sets. Race labels, recorded names (including eleven nulls), ages and comparable checkpoint timings align. The SQLite snapshot was not opened for this refresh. The manifest is independently hashed. Stale release/sidecar prose is recorded in the source audit.

Weather contains 288 unique city-year rows, all of which pass measurement checks in 1652 (under 0934, Helsinki 2025's 06:00 weather hour against a listed 15:00 start excluded it). The source URLs specify local timezones and wind in m/s. Amsterdam 2020, the virtual edition, has no weather row and is excluded by the edition policy. Exact half-hour ties at the scheduled start are valid. Race-day conditions do not establish individual wave exposure.

The base parser removes 851,059 missing/unparsed records (every record without a 5 km split among them), 25,072 non-increasing records and 12,180 outside timing bounds. No exact duplicates are removed. Of 4,027,044 timing-eligible finishes, the reviewed edition-quality policy for this release excludes another 155,277 in 30 editions: invalid or mixed-basis grids, mats that stopped recording, a virtual edition, partial loads, unresolved holds and selected fields. This leaves **3,871,767 eligible finishes**. Feature `valid_splits` is a different cohort; a blanket flag filter would discard otherwise eligible records with unrecorded sex (21,160 in this cohort). Their inclusion in the all-runner view does not infer a sex category.

Every one of the 211 eligible editions has usable weather and at least 100 finishes, so the final comparison has **3,871,767 finishes, 211 editions and 28 cities** (0934: 3,507,382 finishes, 192 editions, 27 cities, after leaving out three editions without usable weather and one below 100 finishes). These are performances and weather editions, not independently identified people. The [source-quality audit](../../public/data/packs/ext_pacing_shapes/pack_meta.json) records each excluded edition and disjoint count.

### Site behavior, as written before the redesign (line 45)

The original ten remain ranked together. The two new questions appear under “Conditions, in more detail” on the homepage and directory, and are linked from the existing temperature page. Only candidates with a ready decision receive a route. Visible source labels describe marathon/year coverage and measured fields. Exact release tags, timestamps and hashes remain in downloadable evidence and source links.
