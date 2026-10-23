# Course terrain: corrected route profiles for the terrain splits

Owner decision, October 23, 2026: "It should use an elevation model". The race planner's and pace band's terrain
splits spread the visitor's own goal over a corrected route profile with one published grade curve
(`analysis/terrain_model.py`). They never change the goal or any finish time and are never fitted to Pace Notes data.

| Path | What it is | Run in CI |
|---|---|---|
| `corrections.json` | The audited registry (schema `pace-notes/course-profile-corrections`, version `2026-10-23.1`): every supplied course, its class, structure audit and corrections, plus `slug`, `band`, `why`, `features` and `sources` | read by the builder |
| `fixtures/parity.json` | A synthetic profile and its expected plan shares, asserted by `analysis/test_course_terrain.py`; the JavaScript model in `scripts/verify-tools.cjs` asserts the same values (Python and JavaScript parity) | yes |
| `provenance/` | The scripts that sampled the terrain models and wrote the registry (network, never run in CI) | no |
| `validation-2026-10-23/` | Dated evidence: the check of the model against steady finishers that chose the ten courses | no |

## Registry fields added for the terrain splits

`research/profiles.json` was promoted unchanged; each course gained:

- `slug`: the site's course slug (`courseSlug(city)`).
- `band`: `"terrain"` (terrain splits ship) or `"even"` (even pace).
- `why`, only when `band` is `"even"`: `"held"` (profile corrected but it did not pass the check against steady
  finishers: Warsaw, Oslo) or `"profile"` (class c, or class b or a course that was not checked against finishes).
- `features`: curated named structures, only from a cited correction or applied structure (never generated from
  OpenStreetMap): `{id, name, short, km_from, km_to}` on the supplied route file's own distance axis. Each lies inside
  one range correction or one `structures_applied` range. The builder maps them to the official axis
  (`(km - first point) × 42.195 / route length`, where the route length is the corrected profile's own length).
- `sources`: `{dataset, url, licence, licence_url, retrieved}` for every dataset the corrected profile of a terrain
  course is built from. Licences as checked on October 23, 2026:

| Source | Licence | Checked against |
|---|---|---|
| USGS 3DEP 1/3 arc-second DEM (NED 10 m) | Public domain | ScienceBase 3DEP item metadata ("All 3DEP products are public domain"); usgs.gov returned HTTP 403 |
| NYC Planimetric Database: Elevation Points | NYC Open Data Terms of Use | not verified: opendata.cityofnewyork.us returned HTTP 403; the dataset's own metadata names no licence (attribution: NYC Office of Technology and Innovation) |
| Environment Agency LIDAR Composite DTM 1 m and DSM 1 m | Open Government Licence v3.0 | data.gov.uk dataset metadata ("Open Government Licence") |
| IGN España MDT05 | CC BY 4.0 | IGN licence conditions (links CC BY 4.0) |
| AHN4 via PDOK | CC0 1.0 | PDOK AHN WCS capabilities (`AccessConstraints`: "Geen beperkingen", CC0 1.0) |
| OpenStreetMap | ODbL 1.0 | openstreetmap.org/copyright |

## Building

```
python analysis/build_course_terrain.py --profiles PATH/course_profiles.parquet \
    --corrections analysis/course_terrain/corrections.json \
    --output public/data/insights/tools/course-terrain.json
python analysis/build_insights.py --only manifest
```

The parquet must be the adopted release's `course_profiles.parquet` (SHA-256 equal to `input.sha256` here and to
`input_files['course_profiles.parquet']` in the runner-context manifest). Corrections keep their anchors, so a
rebuild needs no network. A changed parquet hash makes the builder refuse until every correction is re-based and
`input.sha256` updated; any change to this registry bumps `version`.
