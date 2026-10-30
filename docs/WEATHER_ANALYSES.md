# Weather evidence and publication decisions

Recalculated October 22, 2026, from `private-export-20261021-1050`, adopted in PR #78 (merged as `39f3057` and live on October 22, 2026; the deployed state is in the [project handoff](PROJECT_HANDOFF.md#current-state)). [analysis/weather-release.json](../analysis/weather-release.json) and [analysis/release.json](../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs. The supporting study also uses this source; the 1652 and 0934 figures remain historical evidence in Git history, the [1652 refresh](REFRESH_20261016_1652.md) and the [0934 refresh](REFRESH_20260912_0934.md). See the [current refresh audit](REFRESH_20261021_1050.md) for source checks and edition exclusions. Deployment is recorded separately from calculation.

## What was tested

Three questions were specified together before examining their associations with pacing: start dew point as a humidity measure, temperature change in the first four hours, and start wind speed. A candidate can qualify through a stable material association or a sufficiently precise small difference. Uncertain results are retained in the audit but do not receive a website page.

The complete [machine-readable evidence](../public/data/weather/evidence.json) contains all three decisions, estimates, intervals, leave-one-course-out estimates, edition values, input checksums, script hashes, exclusions and the frozen screening rule. The [builder](../analysis/build_weather.py) and [tests](../analysis/test_weather.py) reproduce the method.

| Candidate | Typical exposure contrast | Adjusted difference in slowing, percentage points | 98.33% interval | Decision |
| --- | --- | ---: | --- | --- |
| Humidity / dew point | 4.1°C to 10.9°C dew point | +0.54 | −0.37 to +1.62 | Withheld: inconclusive; neither a clear association nor a precise small difference |
| First-four-hours warming | +2.5°C to +6.3°C temperature rise | +2.10 | +1.60 to +2.58 | Published as the Warming tab of `/analyses/race-day-weather` (`#warming`) |
| Start wind speed | 2.20 to 4.41 m/s, approximately 4.9 to 9.9 mph | +0.36 | −0.08 to +0.75 | Published as the Wind tab (`#wind`), limited to this pacing measure and typical wind contrast |

The same three decisions as on October 21 before Chicago 2025 was accepted (warming +2.10, +1.60 to +2.58; wind +0.36, −0.09 to +0.76; humidity +0.55, −0.36 to +1.64; 214 editions), under 1652 (warming +2.07, +1.55 to +2.55; wind +0.37, −0.19 to +0.81; humidity +0.59, −0.29 to +1.51; 211 editions) and under 0934 (warming +2.07, +1.53 to +2.66; wind +0.32, −0.36 to +0.82; humidity +0.65, −0.37 to +1.61; 192 editions).

The page: `/analyses/race-day-weather` has three tabs, Start temperature, Warming and Wind (`#temperature`, `#warming`, `#wind`; `components/analysis/WeatherTabs.client.tsx`), and a tab appears only when its evidence is ready. Each published question is stated by its nugget in `lib/nuggets/analyses.ts` (`weather.warming`, `weather.wind`; the selected tab's nugget is the page's H1) and drawn as one interval strip against the ±1-point band of no material difference, its ends given in plain words (the 98.3% level is stated on `/methodology`). The old addresses `/analyses/warming-and-pacing` and `/analyses/wind-and-pacing` answer 308 to their tab (`vercel.json`) and are not in the sitemap (both checked October 30, 2026). The redesign (PR #71, merged October 20, 2026) made this change; the evidence, the decisions and the 98.3% intervals are unchanged.

These contrasts use each exposure's observed interquartile range. They are not contrasts between universal safe/dangerous thresholds. Humidity being withheld does not establish that humidity has no effect. Wind's result does not establish that headwinds, gusts or wind-related finish-time losses are unimportant.

## Population, measurement and model

**1050.** The FULL and CORE archives passed the release audit ([data architecture](DATA_ARCHITECTURE.md#verified-input-current-private-export-20261021-1050)). The 299 weather rows are the 298 editions and the virtual Amsterdam 2020, which the release leaves out. The source URLs specify local timezones and wind in m/s. Exact half-hour ties at the scheduled start are valid. Race-day conditions do not establish individual wave exposure.

1050 (October 22, 2026): weather contains 299 unique city-year rows, and all of them now pass the measurement checks. Chicago 2025's start moved to the official 07:35 wave-1 time while the producer's reading stayed on the 07:00 archive hour, 35 minutes earlier, so the 30-minute start check refused it on October 21. The owner accepted that reading on October 22, 2026 (verbatim: "you can use the early Chicago weather data"). `build_weather.py` names it in `ACCEPTED_EARLY_HOURS` by its exact observed hour and scheduled start and lists it in the evidence (`accepted_early_hours`), so any other row more than 30 minutes off, or a changed Chicago 2025 row, still fails; `verify-weather` checks the same. Every one of the 215 eligible editions now has usable weather and at least 100 finishes, so the comparison has **4,108,749 finishes, 215 editions and 27 cities** (October 21: 4,055,130 in 214).

The base parser removes 882,266 missing/unparsed records, 25,098 non-increasing records and 12,430 outside timing bounds; no exact duplicates are removed. Of 4,407,710 timing-eligible finishes, the reviewed edition-quality policy for 1050 excludes another 298,961 in 41 editions: invalid or mixed-basis grids, misplaced or stopped mats, partial loads, unresolved holds and selected fields. This leaves **4,108,749 eligible finishes**. Feature `valid_splits` is a different cohort (4,388,397 records); a blanket flag filter would discard otherwise eligible records with unrecorded sex (18,153 in this cohort). Their inclusion in the all-runner view does not infer a sex category. These are performances and weather editions, not independently identified people. The [source-quality audit](../public/data/packs/ext_pacing_shapes/pack_meta.json) records each excluded edition and disjoint count. The 1652 and 0934 populations are in [history](#history-earlier-releases).

For each runner, late slowing is `100 × ((time40 − time20) / time20 − 1)`. The two blocks are 0–20 km and 20–40 km, with the final 2.195 km excluded. The outcome is the median of individual changes in each edition. Each edition is equally weighted. No individual-mile splits, missing checkpoints, exact ages or wave starts are inferred.

One joint model uses course fixed effects, a linear calendar-year term, start temperature and its square, dew point, four-hour warming and wind speed. Uncertainty resamples whole courses 6,000 times; 98.33% intervals approximately account for three comparisons. The fixed four-hour weather window is independent of each runner's finish time and can extend past faster finishers' races. It describes race-day conditions, not measured personal exposure.

The prespecified gate requires at least 30 editions, 10 courses, meaningful within-course exposure variation in 10 courses, VIF ≤10 and at least 95% valid bootstrap draws. A material association requires an interval excluding zero, at least 1 percentage point of estimated change and consistent direction in every leave-one-course-out refit. A precise small difference requires the full interval and all leave-one-course-out estimates strictly inside ±1 percentage point. That practical threshold is an editorial choice, not a physiological cutoff. All three candidates pass coverage checks; only warming and wind pass the takeaway rule.

Course means the supplied city, not a historically verified route. The model cannot isolate causal weather effects from field composition, fitness, route changes, congestion or race organization. It does not adjust for all measured weather fields: rain, cloud and pressure are not model terms. The September 11 method validation independently reproduced the earlier estimates and bootstrap intervals with a full course-indicator regression to within `1e-8`; the current refresh reruns the unchanged model on the new source.

## Site behavior and reproduction

The original ten remain ranked together; the warming and wind answers are tabs of race-day weather, not separate entries. Only candidates with a ready decision receive a tab. Visible source labels describe marathon/year coverage and measured fields. Exact release tags, timestamps and hashes remain in downloadable evidence and source links.

The separate [runner-context extension](RUNNER_CONTEXT_AND_PEERS.md) displays supplied weather facts for a selected edition without refitting this association model or applying its coefficient to a runner. Its weather joins reuse start-hour validation and additionally check all five displayed hours and source units. Under 1050 it covers all 298 raw editions (297 on October 21; 249 under 0934); the association screen has 215 eligible editions (211 in 1652, 192 under 0934) with its own minimum field-size and statistical gates. Precipitation, cloud and pressure shown as runner context do not become model terms. The extension's publication status is recorded separately.

The units control converts weather display too: °F temperature changes and mph in miles mode, °C changes and km/h in kilometres mode. Temperature changes never receive the +32 offset used for absolute Fahrenheit temperatures. The percentage-point estimate, uncertainty and sample stay unchanged. On the Warming and Wind tabs, the All numbers table lists the unadjusted edition observations; it does not refit or personalize the adjusted result. Those tabs have no course selector (the selector and `course=` parameter described here before the October redesign belong to the old weather pages).

```bash
python -m pip install -r analysis/requirements.txt
TAG=$(python -c 'import json; print(json.load(open("analysis/weather-release.json"))["tag"])')
python analysis/download_release.py --bundle FULL --tag "$TAG" --output /path/to/weather-input
python analysis/build_weather.py --input /path/to/weather-input --output /path/to/evidence.json
python -m unittest discover -s analysis -p 'test_*.py'
# Review the decisions, source and hashes (operations: validate, import and publish), then:
cp /path/to/evidence.json public/data/weather/evidence.json
npm run verify:data
npm run build
```

The [Weather evidence screen workflow](../.github/workflows/weather-analysis.yml) accepts an explicit release tag and produces an evidence artifact. It does not import data, change either source pin or deploy. Before adoption, verify source identity, schema, scientific decisions, provenance and the exact site diff. The full three-candidate audit must remain available even when only a subset is displayed.

## Weather match tool

`/tools/weather-match` ([runner tools](TOOLS.md)) is descriptive and separate from these estimates. For a typed forecast start temperature and 5–20 km pace, it lists editions whose supplied start-hour temperature is within ±2 or ±3 °C. Each edition needs at least 20 finishes in the 15 s/km pace band; a row needs 3 editions and 100 finishes. The tool shows the edition-balanced sustained-slowdown share and finish percentiles beside a 6–10 °C reference row (inside the steadiest start-temperature band of the race-day weather analysis). The two rows are never subtracted into a heat penalty or an adjusted time. Its separate Published research panel shows Ely et al. 2007, Mantzios et al. 2022, Hadley's table and RunnersConnect's dew-point bands as cited ranges. Mantzios is 0.2% per °C WBGT above 15 °C for marathon top finishers and 0.4% across all endurance events. Hadley and RunnersConnect are rules of thumb. None of these figures is fitted to Pace Notes data, combined with it, or passed to the pace band or any other tool. The withheld humidity result is not used.

## Current calculation evidence

October 22, 2026 (1050): the weather screen was recalculated locally from the verified FULL folder after the Chicago 2025 exception (`build_weather.py` `d5ef37fb…`, `source_quality.py` `de261132…`), followed by runner context, the all-finisher context and the stories and tool data, which read its start check ([pipeline and log](evidence/2026-10-22/chicago-2025-weather/)); all three decisions are unchanged. The October 21 screen (214 editions) is in the [refresh record](REFRESH_20261021_1050.md).

CI on 1050: the **Weather evidence screen** workflow ran on PR #78's final head `68d0f5e1` ([run 39785746832](https://github.com/koolkam00/pace-notes/actions/runs/39785746832), October 22, 2026, 13:19–13:21 UTC, success). It ran the Python tests, downloaded the pinned FULL archive and recalculated all three candidates. Its `weather-evidence` artifact, downloaded and compared on October 30, 2026, matches the committed `public/data/weather/evidence.json`: the same three decisions, and every estimate, interval and leave-one-course-out value within 2 × 10⁻¹⁵; only `as_of` differs.

October 16, 2026 (1652): the weather screen was calculated locally from the verified FULL folder with the reviewed policy (`source_quality.py` `0fc0cb12…`, `build_weather.py` `20563783…`; recalculated on October 17 after the policy reasons were reworded, with the same results); all three candidates were rerun under the unchanged gate, and the evidence file was copied to `public/data/weather/evidence.json` with both pins on the same tag. No CI run of the weather workflow is recorded yet. See [the refresh record](REFRESH_20261016_1652.md).

**Correction (2026-10-30):** the weather workflow did run on the 1652 branch: [run 39025629797](https://github.com/koolkam00/pace-notes/actions/runs/39025629797) succeeded on `9d134f33` on October 17, 2026 at 10:37 UTC (read through the GitHub REST API on October 30, 2026); its artifact was not compared with the committed file.

September 12, 2026 (0934, historical): all 53 Python tests passed. The explicit-tag [weather workflow](https://github.com/koolkam00/htw-live-study/actions/runs/34698526747) succeeded on reviewed code commit `1325f105c550c5d943140c9395d5075db9c7c448`. Its artifact SHA-256 is `774b18aef78d75d6df0b30280bf721de8735578855f6cdc740ac2e526e12c392`. Warming and wind pass the unchanged gate; humidity remains withheld. Source, import and deployment evidence are recorded in [the refresh record](REFRESH_20260912_0934.md).

## Historical validation on September 11

All 27 Python tests passed. Independent full-course-indicator regression reproduced all three refreshed estimates and all 6,000 bootstrap intervals within `1e-8`; [review evidence](evidence/2026-09-11/refresh-1107/independent-weather-review.json) records the comparison. The frozen publication rule, seed, outcome and practical threshold are unchanged from the earlier 0336 calculation. Warming and wind still qualify; humidity remains inconclusive. The refresh report records site, workflow and deployment validation as it completes.

## History (earlier releases)

Text moved here word for word on October 30, 2026 from this file as it stood at `main`'s commit `a2c6e507`, when the sections above were rewritten for 1050 and the redesigned site. Counts belong to the release they name; do not quote them as current. Older versions are in Git history.

### The opening line, as written on October 22, 2026 (line 3)

Recalculated October 22, 2026, from `private-export-20261021-1050` (repository state on branch `data/release-1050`; deployment is recorded in the [project handoff](PROJECT_HANDOFF.md)). [analysis/weather-release.json](../analysis/weather-release.json) and [analysis/release.json](../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs. The supporting study also uses this source; the 1652 and 0934 figures remain historical evidence in Git history, the [1652 refresh](REFRESH_20261016_1652.md) and the [0934 refresh](REFRESH_20260912_0934.md). See the [current refresh audit](REFRESH_20261021_1050.md) for source checks and edition exclusions. Deployment is recorded separately from calculation.

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

Every one of the 211 eligible editions has usable weather and at least 100 finishes, so the final comparison has **3,871,767 finishes, 211 editions and 28 cities** (0934: 3,507,382 finishes, 192 editions, 27 cities, after leaving out three editions without usable weather and one below 100 finishes). These are performances and weather editions, not independently identified people. The [source-quality audit](../public/data/packs/ext_pacing_shapes/pack_meta.json) records each excluded edition and disjoint count.

### Site behavior, as written before the redesign (line 45)

The original ten remain ranked together. The two new questions appear under “Conditions, in more detail” on the homepage and directory, and are linked from the existing temperature page. Only candidates with a ready decision receive a route. Visible source labels describe marathon/year coverage and measured fields. Exact release tags, timestamps and hashes remain in downloadable evidence and source links.
