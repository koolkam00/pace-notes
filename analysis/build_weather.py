"""Screen three predeclared weather associations; emit edition aggregates only.

This standalone calculation does not refresh existing packs or the release pin.
The publication gate was agreed before inspecting any outcome associations.
"""
import argparse
import hashlib
import json
import math
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import duckdb
from source_quality import source_quality_report, METHOD as SOURCE_QUALITY_METHOD
import numpy as np

from build_pacing import COMMON_METHOD, prepare, records

VERSION = 1
SEED = 20260911
BOOTSTRAP_DRAWS = 6000
EXPOSURES = [
    {"id": "humidity", "key": "dewpoint_c", "label": "Start dew point", "unit": "°C",
     "title": "Do runners slow down more on humid days?"},
    {"id": "warming", "key": "warming_c", "label": "First-four-hours temperature change", "unit": "°C",
     "title": "What happens when race day gets warmer?"},
    {"id": "wind", "key": "wind_mps", "label": "Start wind speed", "unit": "m/s",
     "title": "How do windy and calm races compare?"},
]
GATE = {
    "locked_before_outcomes": True,
    "minimum_finishes_per_edition": 100,
    "minimum_editions": 30,
    "minimum_courses": 10,
    "minimum_courses_with_half_iqr_range": 10,
    "maximum_vif": 10,
    "minimum_valid_bootstrap_fraction": 0.95,
    "bootstrap_draws": BOOTSTRAP_DRAWS,
    "bootstrap_seed": SEED,
    "family_comparisons": 3,
    "confidence": 1 - 0.05 / 3,
    "practical_difference_pp": 1.0,
    "association": "Interval excludes zero, absolute IQR estimate at least 1 percentage point, and every leave-one-course-out estimate has the same sign.",
    "precise_null": "Entire interval lies strictly inside ±1 percentage point and every leave-one-course-out estimate is also strictly inside ±1 percentage point.",
}
METHODS = [
    "The outcome is each edition's median individual percentage pace change from 0–20 km to 20–40 km: 100 × ((time at 40 km − time at 20 km) / time at 20 km − 1). Positive is slowing. These are equal-distance blocks, not measured half-marathon splits; the last 2.195 km is excluded.",
    "Each city/year must identify exactly one race and one weather row with a valid same-year race date. Keep at least 100 complete eligible finishes per edition and weight each retained edition equally. The number of finishes is not the number of independent weather observations.",
    "Use the producer's observed_at archive hour only when it is within 30 minutes of the supplied scheduled local start; either nearest hour is accepted at an exact half-hour tie. One reviewed exception is accepted by name: Chicago 2025 uses the 07:00 archive hour for its 07:35 scheduled start, 35 minutes earlier. Temperature, dew point, humidity and wind must agree with that hour. Warming is temperature exactly four hourly readings later minus temperature at that start hour; no runner's finish time determines the window. Supplied start times may be approximate or refer to elite rather than mass starts.",
    "Fit one prespecified joint linear model of edition median pace change, with course fixed effects, a centered linear calendar-year term, centered start temperature and its square, start dew point, first-four-hours temperature change and start wind speed. Course denotes the supplied city, not a verified historical route. Course fixed effects are removed by within-course centering.",
    "Report each weather coefficient multiplied by that exposure's observed edition interquartile range (75th minus 25th percentile). This is a conditional regression contrast, not a prediction that sets dew point beyond the physically supported temperature range. The other modeled variables are held constant.",
    "Uncertainty resamples whole courses with replacement, keeping every edition within the drawn course and recomputing the model. The fixed seed is 20260911; 6,000 draws produce percentile intervals at 98.333333% confidence, an approximate Bonferroni adjustment for the three screened exposures. At least 95% of draws must have full rank. Repeated runners across courses are not separately clustered.",
    "Before seeing outcomes, require 30 editions, 10 courses, within-course exposure ranges at least half the overall IQR in at least 10 courses, and variance inflation factor no more than 10. A supported association additionally needs an interval excluding zero, an absolute IQR estimate of at least 1 percentage point and unchanged direction in every leave-one-course-out refit. A precise null requires the entire interval and every leave-one-course-out estimate strictly inside ±1 percentage point. This 1-point threshold is a prespecified practical publication threshold, not a physiological boundary or a claim that smaller changes never matter to runners. All three screen results remain in the audit, including withheld candidates.",
    "This is an exploratory, adjusted edition-level association among eligible finishers. It does not establish a weather penalty, an individual forecast or a causal effect. Field composition, fitness, opening congestion, race organization, route changes and unmeasured conditions remain possible explanations. The opening 0–20 km baseline can itself be affected by weather and congestion. Runners who did not finish or lack valid splits are not represented.",
    "Relative humidity changes with temperature. Dew point is the modeled moisture exposure; the raw humidity percentage is retained for context. Wind speed gives no runner-specific headwind or tailwind without a valid historical route, direction and personal exposure timeline. Scheduled-start weather is not personal wave-start weather.",
] + COMMON_METHOD[:2]


# Reviewed exceptions to the 30-minute start check: (city, year) -> the exact producer observed_at and scheduled
# start_local each one accepts, so a row that changes either field fails the check again. Owner decision, October 22,
# 2026, verbatim: "you can use the early Chicago weather data". Chicago 2025's start moved to the official 07:35 wave-1
# time while the producer's reading stayed on the 07:00 archive hour.
ACCEPTED_EARLY_HOURS = {("Chicago", 2025): ("2025-10-12T07:00", "07:35")}


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def weather_observation(row):
    """Validate one supplied weather row; never interpolate or fetch replacements."""
    try:
        date = datetime.strptime(str(row["race_date"]), "%Y-%m-%d")
        if date.year != int(row["year"]):
            raise ValueError("race date year mismatch")
        start = datetime.fromisoformat(f'{row["race_date"]}T{row["start_local"]}')
        hourly = json.loads(row["hourly_json"])
        times = [datetime.fromisoformat(v) for v in hourly["time"]]
        if len(set(times)) != len(times) or any(t.date() != date.date() for t in times):
            raise ValueError("ambiguous hourly dates")
        observed = datetime.fromisoformat(row["observed_at"])
        accepted = ACCEPTED_EARLY_HOURS.get((row["city"], int(row["year"]))) == (row["observed_at"], row["start_local"])
        if abs((observed - start).total_seconds()) > 1800 and not (accepted and observed < start):
            raise ValueError("observed hour differs from scheduled start by more than 30 minutes")
        indices = [times.index(target) for target in (observed, observed + timedelta(hours=4))]
        if times[indices[1]] - times[indices[0]] != timedelta(hours=4):
            raise ValueError("hourly window is not four hours")
        columns = {"temp_c": "temperature_2m", "dewpoint_c": "dewpoint_2m",
                   "humidity_pct": "relative_humidity_2m", "wind_mps": "windspeed_10m"}
        result = {"city": row["city"], "year": int(row["year"]), "weather_race": row["race"], "date": row["race_date"],
                  "scheduled_start": row["start_local"], "start_hour": times[indices[0]].isoformat(timespec="minutes"),
                  "four_hour": times[indices[1]].isoformat(timespec="minutes")}
        for column, hourly_column in columns.items():
            values = hourly[hourly_column]
            if len(values) != len(times) or not finite_number(row[column]) or not finite_number(values[indices[0]]):
                raise ValueError("missing weather measurement")
            if abs(row[column] - values[indices[0]]) > 0.011:
                raise ValueError("start field disagrees with nearest hour")
            result[column] = float(row[column])
        end = hourly["temperature_2m"][indices[1]]
        if not finite_number(end):
            raise ValueError("missing four-hour temperature")
        result["warming_c"] = float(end) - result["temp_c"]
        if not 0 <= result["humidity_pct"] <= 100 or result["wind_mps"] < 0 or result["dewpoint_c"] > result["temp_c"] + .2:
            raise ValueError("physically invalid weather measurement")
        return result, None
    except (KeyError, ValueError, TypeError, IndexError) as exc:
        return None, str(exc)


def prepare_editions(db, source):
    counts = prepare(db, source)
    weather_rows = records(db, "SELECT * FROM read_parquet(?)", [str(source / "race_conditions.parquet")])
    weather_keys = Counter((r["city"], r["year"]) for r in weather_rows)
    excluded = Counter()
    weather = {}
    for row in weather_rows:
        key = (row["city"], row["year"])
        if weather_keys[key] != 1:
            excluded["duplicate_weather_key_rows"] += 1
            continue
        observation, error = weather_observation(row)
        if error:
            excluded["invalid_weather_rows"] += 1
            excluded["weather_error: " + error] += 1
        else:
            weather[key] = observation
    # Check race-name uniqueness in all raw deduplicated records, not just finishers.
    ambiguous = {(r["city"], r["year"]) for r in records(db, """SELECT city,year FROM unique_records
      GROUP BY city,year HAVING count(DISTINCT race) != 1 OR count(race) != count(*)""")}
    aggregate = records(db, """SELECT city,year,min(race) AS race,count(*) AS n,
      median(change20) AS pace_change_pct,median(t8)/60 AS finish_minutes,
      100.0*avg((gender='Women')::INTEGER) AS women_pct,
      median(age) FILTER(WHERE age BETWEEN 18 AND 89 AND age=floor(age)) AS median_recorded_age
      FROM eligible GROUP BY city,year ORDER BY city,year""")
    editions = []
    for row in aggregate:
        key = row["city"], row["year"]
        reason = ("ambiguous_race_edition" if key in ambiguous else
                  "no_valid_unique_weather" if key not in weather else
                  "weather_race_name_mismatch" if row["race"].strip().casefold() != weather[key]["weather_race"].strip().casefold() else
                  "fewer_than_100_finishes" if row["n"] < GATE["minimum_finishes_per_edition"] else None)
        if reason:
            excluded[reason + "_editions"] += 1
            excluded[reason + "_finishes"] += row["n"]
        else:
            editions.append({**row, **weather[key]})
    counts.update({"weather_rows": len(weather_rows), "weather_unique_valid_rows": len(weather),
                   "eligible_editions_before_weather": len(aggregate), "weather_analysis_editions": len(editions),
                   "weather_analysis_courses": len({r["city"] for r in editions}),
                   "weather_analysis_finishes": sum(r["n"] for r in editions)})
    assert counts["weather_analysis_finishes"] + sum(v for k, v in excluded.items() if k.endswith("_finishes")) == counts["eligible"]
    return editions, counts, dict(excluded)


def model_arrays(editions):
    """Remove course intercepts exactly, then scale for stable least squares."""
    courses = sorted({r["city"] for r in editions})
    course_ids = np.array([courses.index(r["city"]) for r in editions])
    year = np.array([r["year"] for r in editions], dtype=float)
    temperature = np.array([r["temp_c"] for r in editions], dtype=float)
    temperature -= temperature.mean()
    columns = [year - year.mean(), temperature, temperature ** 2]
    columns += [np.array([r[e["key"]] for r in editions], dtype=float) for e in EXPOSURES]
    x, y = np.column_stack(columns), np.array([r["pace_change_pct"] for r in editions], dtype=float)
    for course_id in range(len(courses)):
        mask = course_ids == course_id
        x[mask] -= x[mask].mean(axis=0)
        y[mask] -= y[mask].mean()
    scales = np.sqrt(np.mean(x ** 2, axis=0))
    if np.any(scales <= 1e-12):
        raise ValueError("A model predictor has no within-course variation")
    x /= scales
    return x, y, scales, course_ids, courses


def full_rank_fit(xtx, xty):
    if np.linalg.matrix_rank(xtx) != len(xty):
        return None
    return np.linalg.solve(xtx, xty)


def screen_candidates(editions, draws=BOOTSTRAP_DRAWS):
    """One joint model, all three outcomes reported, no outcome-driven refitting."""
    x, y, scales, groups, courses = model_arrays(editions)
    xtx, xty = x.T @ x, x.T @ y
    fit = full_rank_fit(xtx, xty)
    if fit is None:
        raise ValueError("Joint weather model is rank deficient")
    beta = fit / scales
    pieces_x = np.array([x[groups == g].T @ x[groups == g] for g in range(len(courses))])
    pieces_y = np.array([x[groups == g].T @ y[groups == g] for g in range(len(courses))])
    rng = np.random.default_rng(SEED)
    bootstrap, failures = [], 0
    for _ in range(draws):
        selected = rng.integers(0, len(courses), size=len(courses))
        fitted = full_rank_fit(pieces_x[selected].sum(axis=0), pieces_y[selected].sum(axis=0))
        if fitted is None or not np.all(np.isfinite(fitted)):
            failures += 1
        else:
            bootstrap.append(fitted / scales)
    leave_out = []
    for g in range(len(courses)):
        fitted = full_rank_fit(xtx - pieces_x[g], xty - pieces_y[g])
        leave_out.append(None if fitted is None else fitted / scales)
    samples = np.array(bootstrap)
    output = []
    alpha = .05 / len(EXPOSURES)
    for offset, exposure in enumerate(EXPOSURES, start=3):
        values = np.array([r[exposure["key"]] for r in editions])
        q25, q75 = np.quantile(values, [.25, .75])
        iqr = float(q75 - q25)
        if iqr <= 0:
            raise ValueError("A weather exposure has zero IQR")
        estimate = float(beta[offset] * iqr)
        interval = [float(v * iqr) for v in np.quantile(samples[:, offset], [alpha / 2, 1 - alpha / 2])] if bootstrap else [None, None]
        low, high = interval
        other = np.delete(x, offset, axis=1)
        residual = x[:, offset] - other @ np.linalg.lstsq(other, x[:, offset], rcond=None)[0]
        vif = float(np.sum(x[:, offset] ** 2) / np.sum(residual ** 2))
        course_ranges = [float(np.ptp(values[groups == g])) for g in range(len(courses))]
        variable_courses = sum(v >= iqr / 2 for v in course_ranges)
        loo = [float(v[offset] * iqr) for v in leave_out if v is not None]
        reasons = []
        if len(editions) < GATE["minimum_editions"]: reasons.append("Fewer than 30 eligible editions")
        if len(courses) < GATE["minimum_courses"]: reasons.append("Fewer than 10 courses")
        if variable_courses < GATE["minimum_courses_with_half_iqr_range"]: reasons.append("Fewer than 10 courses span half the exposure IQR")
        if vif > GATE["maximum_vif"]: reasons.append("Exposure cannot be separated reliably from the other modeled variables (VIF above 10)")
        if len(bootstrap) < draws * GATE["minimum_valid_bootstrap_fraction"]: reasons.append("Fewer than 95% of course bootstrap draws had full rank")
        if len(loo) != len(courses): reasons.append("A leave-one-course-out model was rank deficient")
        association = (low is not None and (low > 0 or high < 0) and abs(estimate) >= 1
                       and len(loo) == len(courses) and all(v * estimate > 0 for v in loo))
        precise_null = (low is not None and low > -1 and high < 1 and len(loo) == len(courses)
                        and all(abs(v) < 1 for v in loo))
        takeaway = "association" if association else "precise_null" if precise_null else None
        if takeaway is None:
            reasons.append("The adjusted estimate is too small, uncertain or course-sensitive for a supported practical takeaway")
        ready = not reasons
        summary = (f"An interquartile increase in {exposure['label'].lower()} was associated with {abs(estimate):.1f} percentage points {'more' if estimate > 0 else 'less'} slowing between the two 20 km blocks."
                   if ready and association else
                   "No material difference was detected in this pacing measure across the observed interquartile weather contrast."
                   if ready else "This comparison does not yet support a sufficiently clear, stable takeaway.")
        output.append({"id": exposure["id"], "title": exposure["title"], "status": "ready" if ready else "withheld",
            "takeaway_type": takeaway if ready else None, "summary": summary, "reasons": reasons,
            "exposure": {**{k: v for k, v in exposure.items() if k not in ("id", "title")},
                         "q25": float(q25), "q75": float(q75), "iqr": iqr,
                         "min": float(values.min()), "max": float(values.max())},
            "effect": {"estimate": estimate, "low": low, "high": high, "confidence": GATE["confidence"], "unit": "percentage points"},
            "support": {"editions": len(editions), "courses": len(courses), "finishes": sum(r["n"] for r in editions),
                        "vif": vif, "courses_with_half_iqr_range": variable_courses,
                        "valid_bootstrap_draws": len(bootstrap), "failed_bootstrap_draws": failures,
                        "leave_course_out_min": min(loo) if loo else None, "leave_course_out_max": max(loo) if loo else None,
                        "failed_leave_course_out_fits": len(courses) - len(loo)},
            "leave_course_out": [{"omitted_course": course, "estimate": None if value is None else float(value[offset] * iqr)}
                                 for course, value in zip(courses, leave_out)]})
    return output


def run(source, output):
    manifest = json.loads((source / "MANIFEST.json").read_text())
    provenance = json.loads((source / "provenance.json").read_text())
    if sha256(source / "MANIFEST.json") != provenance["manifest_sha256"]:
        raise ValueError("Manifest checksum does not match verified provenance")
    db = duckdb.connect()
    db.execute("SET memory_limit='4GB'")
    db.execute("SET threads=2")
    editions, counts, exclusions = prepare_editions(db, source)
    if counts["raw"] != manifest["n_records"]:
        raise ValueError("Manifest raw count mismatch")
    candidates = screen_candidates(editions)
    quality = source_quality_report(db, source)
    early = []
    for row in editions:
        minutes = (datetime.fromisoformat(f'{row["date"]}T{row["scheduled_start"]}') - datetime.fromisoformat(row["start_hour"])).total_seconds() / 60
        if abs(minutes) > 30:
            early.append({"city": row["city"], "year": row["year"], "start_hour": row["start_hour"],
                          "scheduled_start": row["scheduled_start"], "minutes_early": round(minutes)})
    result = {"schema_version": VERSION, "id": "weather_screen", "as_of": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "input": {**provenance, "as_of": manifest["created_at"], "race_conditions_sha256": sha256(source / "race_conditions.parquet")},
        "calculation": {"script_sha256": sha256(__file__), "pacing_script_sha256": sha256(Path(__file__).with_name("build_pacing.py")),
                        "duckdb_version": duckdb.__version__, "numpy_version": np.__version__, "source_quality_script_sha256": quality['script_sha256']},
        "source_quality": quality,
        "cohort": counts, "exclusions": exclusions, "accepted_early_hours": early, "prespecified_gate": GATE,
        "outcome": {"label": "Median pace change: 20–40 km versus 0–20 km", "unit": "%", "positive_means": "slower second 20 km"},
        "methodology": METHODS + ([SOURCE_QUALITY_METHOD] if quality['reviewed_edition_policy'] else []), "candidates": candidates, "editions": editions}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n")
    print(json.dumps({"output": str(output), "cohort": counts, "exclusions": exclusions,
                      "candidates": [{k: c[k] for k in ("id", "status", "effect", "support", "reasons")} for c in candidates]}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Standalone weather JSON output file")
    args = parser.parse_args()
    run(args.input, args.output)
