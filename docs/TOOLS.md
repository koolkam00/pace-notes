# Runner tools

The `/tools` section has eight free marathon tools. Three are everyday utilities done carefully: a pace calculator, a finish-time predictor and a qualifying checker. Five use what only this dataset can show, because it has all nine 5 km checkpoints for every finish: a pace band, a race-day projector, a weather match, a course chooser and a split check. Everything runs in the visitor's browser from static files. These tools are an addition: they do not change the release pins, the source-quality policy or any existing analysis output.

## Why these tools

Research behind the selection (October 2026; Reddit and LetsRun refused automated reads, so community evidence came from Garmin forums, app-store reviews and running publications):

- Pace calculators and pace charts are the most used running tools. Predictors are second (built into watches and apps), then live race tracking. Pace bands, qualifying checkers and heat adjustments have smaller but committed audiences.
- Simple calculators are everywhere and copy the same formulas. The most common complaint is optimism: Riegel's formula predicts marathons a median of about 10 minutes too fast (Vickers & Vertosick 2016), and constant-pace projections ignore that most marathoners slow down.
- Weather is the factor calculators leave out. Published heat estimates disagree several-fold.

So the data tools answer questions constant-pace calculators cannot: what finishes that actually hit your goal ran at each mat, what similar finishes went on to do from your current mat, and how finishes at your pace held up on mornings like your forecast.

Rejected, and why:
- **A heat-adjusted goal time from Pace Notes data.** Weather is context only. Each edition has one modelled start-hour observation, not personal exposure, and cross-edition differences are confounded by course, field and era. The weather match is descriptive, with published estimates in a separate panel.
- **An automatic forecast pull.** This would add a third-party request and a data source outside the release pins. Visitors type their own forecast.
- **A fastest-course ranking or course time converter.** Cross-course differences are confounded. The course chooser shows descriptive same-pace outcomes, sorted alphabetically by default.
- **A grade-adjusted (GAP) pace band.** The supplied route profiles are current and of unknown historical validity; elevation stays context.
- **"Your chance" of a goal, BQ or cut-off.** Shares describe complete finishes; runners who stopped are not in the data.
- **Observed mile, halfway or cheer-spot splits between mats.** These would invent timing points. Even-pace arithmetic rows are labelled as arithmetic.

## Evidence kinds

Every panel carries exactly one badge (`EvidencePanel` in `components/tools/ui.tsx`):

| Badge | Meaning |
| --- | --- |
| Arithmetic | Exact even-pace maths and unit conversion. No assumptions about how a race unfolds. |
| Pace Notes data | Observed from the 3,260,661 screened finishes below. Always shows finishes and editions. Descriptive, never a personal probability. |
| Published research | Cited formulas and studies, shown as ranges. Not fitted to Pace Notes data. |
| Official standards | Transcribed from official race pages, with the date they were checked. |

Numbers from different badges are never combined into one figure.

## Tools

| Route | Component | Evidence | Data |
| --- | --- | --- | --- |
| `/tools/pace-calculator` | `PaceCalculator` | Arithmetic | none |
| `/tools/predictor` | `Predictor` | Research, data | `tools/projector.json` + `tools/projector/all/20.json` |
| `/tools/pace-band` | `PaceBand` | Arithmetic, data | `tools/pace-band.json` + shards |
| `/tools/course-chooser` | `CourseChooser` | Data, arithmetic | `tools/course-goal.json` |
| `/tools/weather-match` | `WeatherMatch` | Data, research | `tools/weather-match.json` |
| `/tools/projector` | `Projector` | Data, arithmetic | `tools/projector.json` + shards |
| `/tools/split-check` | `SplitCheck` | Data, arithmetic, research | `tools/pace-band.json` + shards, `archetypes.json` |
| `/tools/qualifying` | `QualifyingChecker` | Official, arithmetic | none (`lib/tools/qualifying.ts`) |

`lib/tools/registry.ts` lists the tools, their order and their evidence kinds. The index (`app/tools/page.tsx`) shows a data tool only when its file is in the verified insights manifest.

Shared code:
- `lib/tools/time.ts`: forgiving duration input. It accepts `3:30:00`, `3:30`, `3h30`, `210` (minutes) and keypad dots (`8.05` is 8:05 for a pace and `3.30` is 3:30 for a race time). It also parses clock times and tracker text.
- `lib/tools/pace.ts`: paces, speeds, split tables, pace charts and watch-overrun arithmetic.
- `lib/tools/predictor.ts`: Riegel, the Daniels–Gilbert equations, a personal exponent from two races, and Tanda.
- `lib/tools/weather.ts`: relative humidity, Stull wet-bulb, shade WBGT with the ACSM flag, Ely, Mantzios, Hadley and dew-point bands.
- `lib/tools/qualifying.ts`: standards, age rules and Boston cut-off history.
- `lib/tools/splits.ts`: split validation, sustained-slowdown reading and pacing class. It also holds `SLOWDOWN_DEFINITION` and `SLOWDOWN_CITATION`, the one wording and neutral citation every tool uses.
- `lib/tools/data.ts`: JSON types, `loadShard`, and `shareUnder`, which interpolates a share between published percentiles.
- `components/tools/ToolShell.tsx` (server) and `components/tools/ui.tsx` (client): the shared tool layout and inputs.
- `components/tools/useQueryState.ts`: shareable URL state. A value equal to its default stays out of the URL. A cleared field is written as `key=`, so it stays cleared after a reload. The hook also reports which keys the visitor's link supplied, so a linked 4:00 is not mistaken for the example 4:00.
- `components/tools/ui.tsx` `ExampleNote`: the one marker for results computed from example inputs.
- `lib/tools/links.ts` and `components/tools/RelatedTool.tsx`: deep links from other pages. Analysis pages end with a related-tool card that carries the reader's course (only when the tool publishes it) and goal.

### Links between tools

Every link from one tool to another follows the same rules:
- **Pace band:** `goal` is the whole minute at or below the time, as H:MM. `course` is added only when the pace band publishes that course, and `g` only when the visitor chose a recorded gender.
- **Course chooser:** `goal` is passed only within 2:30–6:30, the range it covers.
- **Projector:** gets the exact `target`, the `course` only when published, and `t=none`, so it waits for a tracker time instead of showing its example runner.
- **Qualifying checker:** never receives a predicted or goal time as if it had been run.
- **Units:** links carry the visitor's units, but only once the preference has been read. A link clicked before the page finishes loading falls back to the stored preference.

## Data families

The builders are `analysis/insights_tool_*.py`, run by `analysis/build_insights.py` as optional families. All four use the tool cohort from `analysis/insights_tools_common.py`:
- the story cohort (duplicate Chicago 2018–19 removed);
- without the 13 start-offset editions;
- without the 2 editions whose mat grid looks shifted.

This is the final-kick cohort: **3,260,661 finishes in 179 editions**. Every published group has at least 100 finishes. Counts are finishes, not runners.

| Family | Builder | Files | Content |
| --- | --- | --- | --- |
| `tool-projector` | `insights_tool_projector.py` | `tools/projector.json` + `tools/projector/{scope}/{km}.json` | For each 5 km mat, finishes are grouped by projected even-pace finish (elapsed × 42.195 / mat) in 2-minute bands. Variants: all finishes; recorded men and women (All courses only); latest 5 km faster / similar / slower than the average so far (±2%, from 10 km). Each cell has 19 finish percentiles (5th–95th), the 10th/50th/90th elapsed time at every later mat, the median remaining pace, and sustained-slowdown shares split into already recorded and after this mat. |
| `tool-pace-band` | `insights_tool_paceband.py` | `tools/pace-band.json` + `tools/pace-band/{scope}/{gender}.json` | For each whole-minute goal from 2:30 to 6:30, the finishes from G − 5:00 to G − 0:01. Groups: all finishes, held pace, sustained slowdown. Elapsed and section-pace medians and quartiles at the nine points; the slowdown share and onset counts. |
| `tool-weather-match` | `insights_tool_weather.py` | `tools/weather-match.json` | Editions whose start temperature lies within c ± 2 or ± 3 °C. An edition counts with at least 20 finishes in the 15 s/km 5–20 km pace band; a row needs 3 editions and 100 finishes. Rates are edition-balanced; finish percentiles are pooled. Weather requires a race-name match, as in the courses story. |
| `tool-course-goal` | `insights_tool_coursegoal.py` | `tools/course-goal.json` | For goals from 2:30 to 6:30 in 5-minute steps, finishes whose 5–20 km pace is within ±2% of the goal's even pace, on each course. Same 20 / 3 / 100 gates. Also course context: race months, start temperatures and supplied gain, loss and net (never derived). |

Shards are listed with their SHA-256 in their index file's `shards` map. The page loads the index with `loadInsight(path, sha)` (manifest checksum) and each shard with `loadShard(index, path)`, which checks the shard's SHA-256. The tool files total about 18 MB on disk; a visitor downloads one index or single file and at most a couple of shards (each file is 2–410 KB before compression).

### Projector accuracy (held out)

`validate()` builds cells from 2005–2021 races only and scores every 2022–2026 finish on All courses (about 1.31 million per mat):

| Mat | 10th–90th range held the finish | Median miss, Pace Notes cell | Median miss, even pace |
| --- | --- | --- | --- |
| 10 km (trend) | 79.3% | 9:05 | 12:33 |
| 20 km (trend) | 79.4% | 6:23 | 10:48 |
| 30 km (trend) | 79.2% | 3:37 | 6:40 |
| 35 km (trend) | 78.6% | 2:11 | 3:36 |
| 40 km (all) | 80.2% | 0:52 | 0:45 |

The ranges are well calibrated. From 5 to 35 km the median finish of similar finishes beats the even-pace projection by about 1.3–1.9×. At 40 km the two are about equal: the 2-minute band is wide compared with the 2.2 km left. Shifting a cell by the runner's position within the band was tested and only brought 40 km level with even pace, so the method is unchanged. The full table is in `tools/projector.json` (`validation`).

### Rebuilding

```bash
python3 analysis/build_insights.py --only tool-projector,tool-pace-band,tool-weather-match,tool-course-goal --output public/data/insights
node scripts/verify-insights.cjs
```

Rebuilding with `--only` keeps every other family's file and rewrites the manifest. The manifest binds every `insights_*.py` module's SHA-256, so editing a tool builder without rebuilding fails the verifier.

## Verification

- `scripts/verify-insights.cjs` independently recounts each tool family from the release shards. It checks:
  - the tool cohort;
  - every published projector cell's finishes and editions, and that no 100+ group is missing;
  - exact percentiles, slowdown splits and remaining pace for every All-courses cell at 20 and 30 km;
  - every pace-band group count, with sampled medians and slowdown shares;
  - the weather editions, rows, matched editions and edition-balanced shares;
  - the course-goal rows, the unavailable list and the course list.
- `scripts/verify-tools.cjs` (in `npm run verify:data`) checks 125 golden values: parsing, split tables, Riegel and Daniels values, Tanda's range, heat formulas against published tables, age rules and standards for every race, the Boston downhill index and cut-off history, and split reading.
- `analysis/test_insights.py` (`Tools` class) covers:
  - the slug rule;
  - projector bands, trend variants and the slowdown split;
  - the pace-band window boundary (3:55:00 is not in the 3:55 window);
  - the weather three-edition gate and edition balancing;
  - the course-goal tolerance and gates.

## Privacy

Tools compute in the browser and send no inputs anywhere. Tool state is kept in the URL so a visitor can share a link: goals, paces, splits, course and units. Typing updates the URL with `history.replaceState`, which makes no request. The site's referrer policy is `strict-origin` (root `metadata.referrer`), and `loadInsight` fetches data with `referrerPolicy: 'no-referrer'`, so later requests never carry the query string. Opening a shared link does send that URL to the host, like any page request. A birth date is never in the URL. The qualifying checker keeps it in component state, plus `localStorage` only if the visitor ticks "remember on this device". Projector runner cards and the start-line clock are stored only in `localStorage`; the start clock expires after 12 hours, and card labels never go into links. Analytics records only the tool's path (`/tools/<slug>`); `lib/analytics-policy.ts` strips every query string and fragment, and `scripts/verify-analytics.cjs` tests that tool inputs are removed.

## Annual maintenance: qualifying standards

Qualifying standards and windows change every year. `lib/tools/qualifying.ts` records `VERIFIED_AT` (currently 2026-10-07), and every card shows it. Before each registration season, and at least every September:

1. **Boston.** Check the standards for the next edition, the qualifying window start, the age date (race day), and the downhill-course rule (the index thresholds in `bostonDownhillIndex`). After registration closes, append the new cut-off, field and not-accepted counts to `BOSTON_CUTOFFS` from the B.A.A. announcement.
2. **New York.** Check the time-qualifier bands, which NYRR races count, the age rule and the application window.
3. **London Good For Age.** Check the bands, the window, the strictly-under rule, the UK-residency rule and the application dates.
4. **Chicago.** Check the bands, including the youngest band's range, the window and the application dates.
5. **Berlin.** Check the birth-year bands and registration dates.
6. **Sydney.** Check the High Performance Program standards and window.
7. Update `sources`, then `VERIFIED_AT`. Update the golden values in `scripts/verify-tools.cjs` and run `npm run verify:data`.
8. Never forecast a cut-off. The cut-off table shows only past cut-offs the visitor's margin would have cleared.

Dated application windows show an "open now / upcoming / closed" badge. Where a race states a time of day (London 16:00 GMT; Chicago 8 a.m. and 2 p.m. CT), `opensAt` and `closesAt` hold the UTC instant and the badge compares it with the current time. Otherwise it uses the visitor's calendar date. A stale entry looks closed rather than wrong, but it still needs this review.

Points checked against official pages on 2026-10-07:
- **Boston:** the downhill index uses the B.A.A.'s own metric bounds for drops typed in metres: 457.2, 914.2 and 1,828.6 m. These are not exact conversions of 1,500, 3,000 and 6,000 ft. The 2028 race date (April 17) is confirmed. The end of the qualifying window, 2027 registration week, is not yet dated.
- **Time equal to the standard:** New York ("at least as fast as") and Chicago ("within the standards") state that an equal time qualifies. Boston, Berlin and Sydney do not, and the checker says it assumes an equal time counts. London requires strictly under.
- **New York:** NYRR guaranteed entry needs a time from the 2026 TCS New York City Marathon (November 1, 2026) or a listed NYRR half. The pool cut-offs (2025: 13:20, top 25%; 2026: 22:52, top 10%) are both from NYRR press releases.

## Adding a tool

1. Add an entry to `lib/tools/registry.ts` with its evidence kinds and, for data tools, its index file.
2. Create `app/tools/<slug>/page.tsx` (server: metadata, `ToolHeader`, the client component, `ToolMethod` with sources and limits, `ToolNext`) and `components/tools/<Component>.tsx`.
3. Label every panel with `EvidencePanel`. Follow the repository contracts in `AGENTS.md`: say "sustained slowdown" with the citation; observed shares, never "your chance"; no data-based weather or elevation adjustment; no invented splits; groups of at least 100 finishes.
4. For a new data family, add an `insights_tool_<name>.py` module, register it in `optional_families()` with a `tool-` prefix, add a recount to `scripts/verify-insights.cjs` and the module to `toolModules`, and add tests.
5. Add the path to analytics automatically through the registry, and run `npm run verify:data`, `npm run verify:analytics`, `npm run build` and the Python tests.
