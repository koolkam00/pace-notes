# Terrain-split validation, October 23, 2026

Dated evidence for which courses got terrain splits. **Nothing in this folder enters any page figure**, and none of it
runs in CI. The model itself is never fitted to these finishes: this was a check, not an input.

- Release: `private-export-20261021-1050` (the adopted release), the pace band's own tool cohort (start-offset and
  shifted-mat-grid editions removed, as in `analysis/insights_tools_common.py`).
- Steady group: finishes on the course whose pace from 20K to the finish was within ±3% of their pace from 0 to 20K,
  in a window from G − 10:00 to G + 9:59 around each goal G, published only with at least 100 such finishes from at
  least 3 editions, at goals from 3:00 to 6:00. These finishes are chosen by how their race went, so the comparison
  does not show that the splits produce a finish time.
- Model: `terrain_model.py` here is the reference model (Strava 2017 quadratic, with a `sens` grade scale used only
  for the sensitivity scan). `analysis/terrain_model.py` is its port without `sens`; the two give identical numbers.

| File | What it holds |
|---|---|
| `measure/prep.py`, `measure/measure.py`, `measure/variants.py`, `measure/analyse.py`, `measure/finalize.py` | Build the steady-finisher cells from the release (the intermediate `cells.pkl` and cohort arrays are not committed) |
| `validate.py` | Model against steady finishers on the raw and corrected profiles: `model_shapes.json` (not committed), `comparison.json`, `ny_515.json` |
| `asym.py` → `asymmetry.json` | Share of the model's uphill cost and downhill gain the steady finishers took |
| `sensitivity.py` → `ny_sensitivity.json` | New York 5:15 under scaled grades |
| `ny_plan.py` → `ny_515.json` | The visitor's New York 5:15 plan, raw against corrected profile, beside the steady groups |
| `summarise.py` → `results.json` | The summary the course choice was made from |

Headline results (recorded in `docs/TOOLS.md`, never on a page): terrain correlation against steady finishers 0.754 on
the 12 class a and b courses with corrected profiles (0.627 on the raw profiles), 0.242 on class c; New York −0.51 raw
and +0.79 corrected; slope 0.67 (90% CI 0.58–0.79); steady finishers took 0.73 of the uphill cost (0.53–0.89) and 0.64
of the downhill gain (0.58–0.79). A calibrated grade scale was rejected (it varies by course and goal, lowers mean
terrain error only from 0.50 to 0.42 percentage points, and would fit the model to outcome-selected Pace Notes data).
Warsaw (model worse than no terrain) and Oslo (last 2.2 km off by 4.0 points) are held at even pace. These figures
chose the ten courses; they were not pre-registered.

The scripts read and write the research workspace paths written into them and are kept unchanged as a record.
