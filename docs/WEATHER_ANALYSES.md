# Weather evidence and publication decisions

Recalculated September 12, 2026, from `private-export-20260912-0934`. [analysis/weather-release.json](../analysis/weather-release.json) and [analysis/release.json](../analysis/release.json) select the same audited source for weather, the ten interactive analyses and all 33 extension packs. The [subsequent supporting study](CURRENT_SITE_AND_RUNNER_SEARCH.md) also uses this source; older core figures remain historical evidence in Git history. See the [full refresh audit](REFRESH_20260912_0934.md) for source checks and edition exclusions. Deployment is recorded separately from calculation.

## What was tested

Three questions were specified together before examining their associations with pacing: start dew point as a humidity measure, temperature change in the first four hours, and start wind speed. A candidate can qualify through a stable material association or a sufficiently precise small difference. Uncertain results are retained in the audit but do not receive a website page.

The complete [machine-readable evidence](../public/data/weather/evidence.json) contains all three decisions, estimates, intervals, leave-one-course-out estimates, edition values, input checksums, script hashes, exclusions and the frozen screening rule. The [builder](../analysis/build_weather.py) and [tests](../analysis/test_weather.py) reproduce the method.

| Candidate | Typical exposure contrast | Adjusted difference in slowing, percentage points | 98.33% interval | Decision |
| --- | --- | ---: | --- | --- |
| Humidity / dew point | 4.5°C to 10.8°C dew point | +0.65 | −0.37 to +1.61 | Withheld: inconclusive; neither a clear association nor a precise small difference |
| First-four-hours warming | +2.6°C to +6.4°C temperature rise | +2.07 | +1.53 to +2.66 | Publish at `/analyses/warming-and-pacing` |
| Start wind speed | 2.20 to 4.31 m/s, approximately 4.9 to 9.6 mph | +0.32 | −0.36 to +0.82 | Publish at `/analyses/wind-and-pacing`, limited to this pacing measure and typical wind contrast |

These contrasts use each exposure's observed interquartile range. They are not contrasts between universal safe/dangerous thresholds. Humidity being withheld does not establish that humidity has no effect. Wind's result does not establish that headwinds, gusts or wind-related finish-time losses are unimportant.

## Population, measurement and model

The FULL and CORE archives passed size, SHA-256 and schema checks. All eight shared members are byte-identical. The 4,462,379 raw and feature rows have unique, non-null canonical IDs with identical sets. Race labels, recorded names (including eleven nulls), ages and comparable checkpoint timings align. The read-only SQLite integrity check returned `ok`. The manifest is independently hashed and no longer declares its own inventory entry. Stale release/sidecar prose is recorded in the source audit.

Weather contains 251 unique city-year rows. The source URLs specify local timezones and wind in m/s. Helsinki 2025 still has a 06:00 weather hour against a listed 15:00 start and is excluded from usable weather; 250 rows pass measurement checks. Exact half-hour ties at the scheduled start are valid. Race-day conditions do not establish individual wave exposure.

The base parser removes 632,168 missing/unparsed records, 225,218 non-increasing records and 9,567 outside timing bounds. No exact duplicates are removed. Of 3,595,426 timing-eligible finishes, a reviewed edition-quality policy excludes another 78,090 from known-invalid grids, partial ingestions, unresolved producer holds and a selected top-finisher field. This leaves **3,517,336 eligible finishes**. Feature `valid_splits` is a different cohort: a blanket flag filter would incorrectly discard 36,161 otherwise eligible records with unrecorded sex. Their inclusion in the all-runner view does not infer a sex category.

After excluding 9,940 finishes in three editions without usable weather and 14 in an edition below the 100-finish requirement, the final comparison has **3,507,382 finishes, 192 editions and 27 cities**. These are performances and weather editions, not independently identified people. The [source-quality audit](../public/data/packs/ext_pacing_shapes/pack_meta.json) records each excluded edition and disjoint count.

For each runner, late slowing is `100 × ((time40 − time20) / time20 − 1)`. The two blocks are 0–20 km and 20–40 km, with the final 2.195 km excluded. The outcome is the median of individual changes in each edition. Each edition is equally weighted. No individual-mile splits, missing checkpoints, exact ages or wave starts are inferred.

One joint model uses course fixed effects, a linear calendar-year term, start temperature and its square, dew point, four-hour warming and wind speed. Uncertainty resamples whole courses 6,000 times; 98.33% intervals approximately account for three comparisons. The fixed four-hour weather window is independent of each runner's finish time and can extend past faster finishers' races. It describes race-day conditions, not measured personal exposure.

The prespecified gate requires at least 30 editions, 10 courses, meaningful within-course exposure variation in 10 courses, VIF ≤10 and at least 95% valid bootstrap draws. A material association requires an interval excluding zero, at least 1 percentage point of estimated change and consistent direction in every leave-one-course-out refit. A precise small difference requires the full interval and all leave-one-course-out estimates strictly inside ±1 percentage point. That practical threshold is an editorial choice, not a physiological cutoff. All three candidates pass coverage checks; only warming and wind pass the takeaway rule.

Course means the supplied city, not a historically verified route. The model cannot isolate causal weather effects from field composition, fitness, route changes, congestion or race organization. It does not adjust for all measured weather fields: rain, cloud and pressure are not model terms. The September 11 method validation independently reproduced the earlier estimates and bootstrap intervals with a full course-indicator regression to within `1e-8`; the current refresh reruns the unchanged model on the new source.

## Site behavior and reproduction

The original ten remain ranked together. The two new questions appear under “Conditions, in more detail” on the homepage and directory, and are linked from the existing temperature page. Only candidates with a ready decision receive a route. Visible source labels describe marathon/year coverage and measured fields. Exact release tags, timestamps and hashes remain in downloadable evidence and source links.

The separate [runner-context extension](RUNNER_CONTEXT_AND_PEERS.md) displays supplied weather facts for a selected edition without refitting this association model or applying its coefficient to a runner. Its weather joins reuse start-hour validation and additionally check all five displayed hours and source units. It covers 249 raw editions; the association screen has 192 eligible editions with its own minimum field-size and statistical gates. Precipitation, cloud and pressure shown as runner context do not become model terms. The extension's publication status is recorded separately.

The units control converts weather display too: °F temperature changes and mph in miles mode, °C changes and km/h in kilometres mode. Temperature changes never receive the +32 offset used for absolute Fahrenheit temperatures. The percentage-point estimate, uncertainty and sample stay unchanged. A course selector browses unadjusted edition observations and an accessible table; it does not refit or personalize the adjusted result. Course browsing is shareable through `course=` and retained through unit changes.

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag private-export-20260912-0934 --output /path/to/weather-input
python analysis/build_weather.py --input /path/to/weather-input --output /path/to/evidence.json
python -m unittest discover -s analysis -p 'test_*.py'
npm run verify:data
npm run build
```

The [Weather evidence screen workflow](../.github/workflows/weather-analysis.yml) accepts an explicit release tag and produces an evidence artifact. It does not import data, change either source pin or deploy. Before adoption, verify source identity, schema, scientific decisions, provenance and the exact site diff. The full three-candidate audit must remain available even when only a subset is displayed.

## Weather match tool

`/tools/weather-match` ([runner tools](TOOLS.md)) is descriptive and separate from these estimates. For a typed forecast start temperature and 5–20 km pace, it lists editions whose supplied start-hour temperature is within ±2 or ±3 °C. Each edition needs at least 20 finishes in the 15 s/km pace band; a row needs 3 editions and 100 finishes. The tool shows the edition-balanced sustained-slowdown share and finish percentiles beside an 8–12 °C reference row. The two rows are never subtracted into a heat penalty or an adjusted time. Its separate Published research panel shows Ely et al. 2007, Mantzios et al. 2022, Hadley's table and RunnersConnect's dew-point bands as cited ranges. Mantzios is 0.2% per °C WBGT above 15 °C for marathon top finishers and 0.4% across all endurance events. Hadley and RunnersConnect are rules of thumb. None of these figures is fitted to Pace Notes data, combined with it, or passed to the pace band or any other tool. The withheld humidity result is not used.

## Current calculation evidence

All 53 Python tests passed. The explicit-tag [weather workflow](https://github.com/koolkam00/htw-live-study/actions/runs/34698526747) succeeded on reviewed code commit `1325f105c550c5d943140c9395d5075db9c7c448`. Its artifact SHA-256 is `774b18aef78d75d6df0b30280bf721de8735578855f6cdc740ac2e526e12c392`. Warming and wind pass the unchanged gate; humidity remains withheld. Source, import and deployment evidence are recorded in [the refresh record](REFRESH_20260912_0934.md).

## Historical validation on September 11

All 27 Python tests passed. Independent full-course-indicator regression reproduced all three refreshed estimates and all 6,000 bootstrap intervals within `1e-8`; [review evidence](evidence/2026-09-11/refresh-1107/independent-weather-review.json) records the comparison. The frozen publication rule, seed, outcome and practical threshold are unchanged from the earlier 0336 calculation. Warming and wind still qualify; humidity remains inconclusive. The refresh report records site, workflow and deployment validation as it completes.
