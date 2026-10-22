"""Hand-checkable weather contracts and statistical failure modes."""
import copy
import json
import unittest

import numpy as np

from build_weather import GATE, model_arrays, screen_candidates, weather_observation


def sample_weather(observed_hour=10):
    values = [float(h) for h in range(24)]
    return {"city": "Test", "race": "Test Marathon", "year": 2020, "race_date": "2020-01-01", "start_local": "09:30",
            "observed_at": f"2020-01-01T{observed_hour:02}:00", "temp_c": values[observed_hour],
            "dewpoint_c": values[observed_hour] - 2, "humidity_pct": 60, "wind_mps": 3,
            "hourly_json": json.dumps({"time": [f"2020-01-01T{h:02}:00" for h in range(24)],
                "temperature_2m": values, "dewpoint_2m": [v - 2 for v in values],
                "relative_humidity_2m": [60] * 24, "windspeed_10m": [3] * 24})}


def synthetic_editions():
    rng = np.random.default_rng(14)
    rows = []
    for course in range(12):
        for year in range(16):
            temperature = rng.uniform(5, 25)
            dewpoint = rng.uniform(-5, 5)
            warming = rng.uniform(-2, 10)
            wind = rng.uniform(.5, 8)
            outcome = (course * 3 + .08 * year + .4 * temperature + .02 * temperature ** 2
                       + 1.4 * dewpoint)
            rows.append({"city": f"Course {course:02}", "year": 2000 + year, "n": 100 + course * 100,
                         "temp_c": temperature, "dewpoint_c": dewpoint, "warming_c": warming,
                         "wind_mps": wind, "pace_change_pct": outcome})
    return rows


class WeatherTests(unittest.TestCase):
    def test_both_half_hour_ties_keep_producer_observed_hour(self):
        for hour in (9, 10):
            observation, error = weather_observation(sample_weather(hour))
            self.assertIsNone(error)
            self.assertEqual(observation["temp_c"], hour)
            self.assertEqual(observation["warming_c"], 4)
            self.assertIn(f"T{hour + 4:02}:00", observation["four_hour"])

    def test_scheduled_start_mismatch_is_excluded_not_repaired(self):
        row = sample_weather(10)
        row["start_local"] = "15:00"
        observation, error = weather_observation(row)
        self.assertIsNone(observation)
        self.assertIn("more than 30 minutes", error)

    def test_reviewed_early_hour_is_accepted_only_as_named(self):
        def chicago(observed="2025-10-12T07:00", start="07:35", city="Chicago", year=2025):
            row = sample_weather(7)
            date = observed[:10]
            data = json.loads(row["hourly_json"])
            data["time"] = [f"{date}T{h:02}:00" for h in range(24)]
            row.update(city=city, year=year, race_date=date, start_local=start, observed_at=observed,
                       temp_c=float(int(observed[11:13])), dewpoint_c=float(int(observed[11:13])) - 2,
                       hourly_json=json.dumps(data))
            return row
        observation, error = weather_observation(chicago())
        self.assertIsNone(error)
        self.assertEqual((observation["start_hour"], observation["scheduled_start"]), ("2025-10-12T07:00", "07:35"))
        # The same 35 minutes is still refused anywhere else, and the named edition is refused once either field changes.
        for row in (chicago(city="Boston"), chicago(year=2024, observed="2024-10-12T07:00"),
                    chicago(start="07:40"), chicago(observed="2025-10-12T06:00")):
            self.assertIn("more than 30 minutes", weather_observation(row)[1])

    def test_missing_four_hour_measurement_and_scalar_disagreement(self):
        row = sample_weather()
        data = json.loads(row["hourly_json"])
        data["temperature_2m"][14] = None
        row["hourly_json"] = json.dumps(data)
        self.assertIn("missing four-hour", weather_observation(row)[1])
        row = sample_weather()
        row["wind_mps"] = 10.8  # Reject unconverted km/h next to an m/s archive.
        self.assertIn("disagrees", weather_observation(row)[1])

    def test_ambiguous_hour_and_wrong_year_are_excluded(self):
        row = sample_weather()
        data = json.loads(row["hourly_json"])
        data["time"][11] = data["time"][10]
        row["hourly_json"] = json.dumps(data)
        self.assertIn("ambiguous", weather_observation(row)[1])
        row = sample_weather()
        row["year"] = 2021
        self.assertIn("year mismatch", weather_observation(row)[1])

    def test_joint_model_recovers_known_effect_and_precise_nulls(self):
        rows = synthetic_editions()
        before = copy.deepcopy(rows)
        result = screen_candidates(rows, draws=100)
        self.assertEqual(rows, before)
        self.assertEqual([v["status"] for v in result], ["ready"] * 3)
        self.assertEqual([v["takeaway_type"] for v in result], ["association", "precise_null", "precise_null"])
        self.assertAlmostEqual(result[0]["effect"]["estimate"] / result[0]["exposure"]["iqr"], 1.4, places=9)
        for candidate in result:
            self.assertEqual(candidate["support"]["valid_bootstrap_draws"], 100)
            self.assertEqual(candidate["support"]["courses"], 12)
            self.assertEqual(len(candidate["leave_course_out"]), 12)

    def test_finish_counts_and_course_offsets_do_not_weight_estimates(self):
        rows = synthetic_editions()
        baseline = screen_candidates(rows, draws=30)
        changed = copy.deepcopy(rows)
        for row in changed:
            row["n"] *= 10 ** (int(row["city"][-2:]) % 4)
            row["pace_change_pct"] += int(row["city"][-2:]) * 1000
        updated = screen_candidates(changed, draws=30)
        for first, second in zip(baseline, updated):
            self.assertAlmostEqual(first["effect"]["estimate"], second["effect"]["estimate"], places=9)

    def test_collinear_weather_fails_gate_even_with_large_effect(self):
        rows = synthetic_editions()
        for row in rows:
            old_dewpoint = row["dewpoint_c"]
            row["dewpoint_c"] = row["temp_c"] * .9 + old_dewpoint * .001
            row["pace_change_pct"] += 1.4 * (row["dewpoint_c"] - old_dewpoint)
        result = screen_candidates(rows, draws=40)[0]
        self.assertEqual(result["status"], "withheld")
        self.assertGreater(result["support"]["vif"], 10)
        self.assertTrue(any("VIF" in reason for reason in result["reasons"]))

    def test_insufficient_courses_withheld_even_for_exact_effect(self):
        rows = [r for r in synthetic_editions() if int(r["city"][-2:]) < 5]
        result = screen_candidates(rows, draws=40)
        self.assertTrue(all(v["status"] == "withheld" for v in result))
        self.assertIn("Fewer than 10 courses", result[0]["reasons"])

    def test_three_comparison_interval_is_prespecified(self):
        self.assertAlmostEqual(GATE["confidence"], 1 - .05 / 3)
        self.assertEqual(GATE["bootstrap_seed"], 20260911)
        self.assertTrue(GATE["locked_before_outcomes"])

    def test_zero_within_course_variation_rejected(self):
        rows = synthetic_editions()
        for row in rows:
            row["wind_mps"] = 5
        with self.assertRaisesRegex(ValueError, "no within-course variation"):
            model_arrays(rows)


if __name__ == "__main__":
    unittest.main()
