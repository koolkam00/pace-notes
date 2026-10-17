"""Small source fixtures for runner weather and course-context publication."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import duckdb

from build_pacing import POINTS
from runner_environment import build_environment, runner_terrain, runner_weather
from test_weather import sample_weather


def weather_fixture(hour=10):
    row = sample_weather(hour)
    row.update(source="open-meteo", timezone="UTC", lat=1.0, lon=2.0,
               notes="Supplied approximate start; source race calendar.",
               source_url="https://archive-api.open-meteo.com/v1/archive?latitude=1&longitude=2&start_date=2020-01-01&end_date=2020-01-01&timezone=UTC&windspeed_unit=ms")
    hourly = json.loads(row["hourly_json"])
    values = {
        "feels_like_c": ("apparent_temperature", 10),
        "wind_dir_deg": ("winddirection_10m", 270),
        "precip_mm": ("precipitation", .2),
        "cloud_pct": ("cloudcover", 50),
        "pressure_hpa": ("pressure_msl", 1010),
        "weather_code": ("weathercode", 3),
    }
    for key, (source_key, value) in values.items():
        row[key] = value
        hourly[source_key] = [value] * 24
    row["hourly_json"] = json.dumps(hourly)
    return row


def terrain_fixture(distance=42.161):
    profile = dict(city="Test", race="Test Marathon", course_key="test-current",
        source="gpx:test+smooth800m", source_url="https://example.com/course.gpx",
        distance_km=distance, elev_gain_m=11.0, elev_loss_m=15.0,
        elev_min_m=10.0, elev_max_m=14.0, valid_from_year=None, valid_to_year=None,
        notes="Source thresholded ascent; historical validity not provided.",
        points_json=json.dumps([dict(d_km=0, elev_m=14.0), dict(d_km=distance, elev_m=10.0)]))
    sections, embedded = [], []
    for start, end in zip([0, *POINTS[:-1]], POINTS):
        sections.append(dict(city="Test", race="Test Marathon", course_key="test-current",
            source=profile["source"], seg_from_km=start, seg_to_km=end,
            elev_gain_m=4.7, elev_loss_m=6.7, elev_net_m=-.5))
        embedded.append(dict(km_from=start, km_to=end, elev_gain_m=4.7, elev_loss_m=6.7, elev_net_m=-.5))
    profile["segments_json"] = json.dumps(embedded)
    return profile, sections


class RunnerEnvironmentTests(unittest.TestCase):
    def test_weather_has_five_exact_hours_and_source_units(self):
        for hour in (9, 10):
            result, reason = runner_weather(weather_fixture(hour))
            self.assertIsNone(reason)
            self.assertEqual(result["temp_c"], hour)
            self.assertEqual(result["warming_c"], 4)
            self.assertEqual([row["time"] for row in result["hours"]], [f"2020-01-01T{h:02}:00" for h in range(hour, hour + 5)])
            self.assertEqual(result["wind_mps"], 3)
            self.assertEqual(result["precip_mm"], .2)
            self.assertIn("preceding hour", result["precipitation_note"])
            self.assertFalse(result["personal_exposure"])
            self.assertFalse(result["start_time_independently_verified"])
            self.assertEqual(result["field_issues"], {})

    def test_start_time_disagreement_is_absent_with_reason(self):
        row = weather_fixture()
        row["start_local"] = "15:00"
        result, reason = runner_weather(row)
        self.assertIsNone(result)
        self.assertIn("more than 30 minutes", reason)

    def test_does_not_interpolate_a_missing_or_invalid_intermediate_hour(self):
        for change in ("missing", "invalid"):
            row = weather_fixture()
            hourly = json.loads(row["hourly_json"])
            if change == "missing":
                for values in hourly.values():
                    values.pop(12)
            else:
                hourly["relative_humidity_2m"][12] = 101
            row["hourly_json"] = json.dumps(hourly)
            result, reason = runner_weather(row)
            self.assertIsNone(result, change)
            self.assertIn("failed validation", reason)

    def test_optional_disagreement_is_visible_as_missing_not_zero(self):
        row = weather_fixture()
        row["precip_mm"] = .9
        result, reason = runner_weather(row)
        self.assertIsNone(reason)
        self.assertIsNone(result["precip_mm"])
        self.assertTrue(all(h["precip_mm"] is None for h in result["hours"]))
        self.assertIn("disagrees", result["field_issues"]["precip_mm"])
        self.assertEqual(result["humidity_pct"], 60)

    def test_unit_date_timezone_and_location_conflicts_are_rejected(self):
        original = weather_fixture()
        for url in (
            original["source_url"].replace("windspeed_unit=ms", "windspeed_unit=kmh"),
            original["source_url"] + "&wind_speed_unit=mph",
            original["source_url"] + "&temperature_unit=fahrenheit",
            original["source_url"] + "&precipitation_unit=inch",
            original["source_url"].replace("timezone=UTC", "timezone=Europe/Berlin"),
            original["source_url"].replace("end_date=2020-01-01", "end_date=2020-01-02"),
            original["source_url"].replace("latitude=1", "latitude=5"),
        ):
            row = {**original, "source_url": url}
            result, reason = runner_weather(row)
            self.assertIsNone(result, url)
            self.assertIn("failed validation", reason)

    def test_core_hourly_physics_and_invalid_timezone_are_rejected(self):
        row = weather_fixture()
        hourly = json.loads(row["hourly_json"])
        hourly["dewpoint_2m"][12] = 13
        row["hourly_json"] = json.dumps(hourly)
        result, reason = runner_weather(row)
        self.assertIsNone(result)
        self.assertIn("dew point exceeds", reason)
        row = weather_fixture()
        row["timezone"] = "not-a-zone"
        row["source_url"] = row["source_url"].replace("timezone=UTC", "timezone=not-a-zone")
        self.assertIsNone(runner_weather(row)[0])

    def test_terrain_preserves_independent_net_short_final_and_profile_difference(self):
        result, reason = runner_terrain(*terrain_fixture())
        self.assertIsNone(reason)
        self.assertEqual(result["distance_km"], 42.195)
        self.assertEqual(result["profile_distance_km"], 42.161)
        self.assertEqual(result["sections"][-1]["start_km"], 40)
        self.assertAlmostEqual(result["sections"][-1]["distance_km"], 2.195)
        self.assertAlmostEqual(result["gain_m"], 42.3)
        self.assertAlmostEqual(result["loss_m"], 60.3)
        self.assertEqual(result["net_m"], -4.5)
        self.assertNotEqual(result["gain_m"] - result["loss_m"], result["net_m"])
        self.assertEqual(result["reported_profile_gain_m"], 11)
        self.assertEqual(result["profile_endpoint_net_m"], -4)
        self.assertEqual(result["points"][-1]["distance_km"], 42.161)
        self.assertFalse(result["historical_validity_known"])
        self.assertIn("not been rescaled", result["profile_distance_note"])

    def test_duplicate_missing_noncontiguous_or_conflicting_sections_are_rejected(self):
        original, original_sections = terrain_fixture()
        for kind in ("duplicate", "missing", "gap", "wrong-race", "wrong-source", "conflict", "negative-gain"):
            profile, sections = copy.deepcopy(original), copy.deepcopy(original_sections)
            if kind == "duplicate":
                sections[1] = sections[0]
            elif kind == "missing":
                sections.pop()
            elif kind == "gap":
                sections[1]["seg_from_km"] = 6
            elif kind == "wrong-race":
                sections[1]["race"] = "Other marathon"
            elif kind == "wrong-source":
                sections[1]["source"] = "other"
            elif kind == "conflict":
                sections[1]["elev_net_m"] = 999
            else:
                sections[1]["elev_gain_m"] = -1
            result, reason = runner_terrain(profile, sections)
            self.assertIsNone(result, kind)
            self.assertIn("failed validation", reason)

    def test_bad_profile_points_are_rejected_without_extrapolation(self):
        profile, sections = terrain_fixture()
        profile["distance_km"] = 42.195
        result, reason = runner_terrain(profile, sections)
        self.assertIsNone(result)
        self.assertIn("point distances", reason)

    def build_fixture(self, weather, profiles, sections, editions):
        with tempfile.TemporaryDirectory() as directory, duckdb.connect() as db:
            source = Path(directory)
            for name, rows in (("race_conditions", weather), ("course_profiles", profiles), ("course_segments", sections)):
                if rows:
                    columns = list(rows[0])
                    types = {key: "VARCHAR" if isinstance(rows[0][key], str) else "DOUBLE" for key in columns}
                    db.execute("CREATE TABLE " + name + " (" + ",".join(key + " " + types[key] for key in columns) + ")")
                    db.executemany("INSERT INTO " + name + " VALUES (" + ",".join("?" for _ in columns) + ")",
                                   [[row[key] for key in columns] for row in rows])
                    db.execute("COPY " + name + " TO ? (FORMAT PARQUET)", [str(source / (name + ".parquet"))])
            return build_environment(db, source, editions)

    def test_exact_edition_join_does_not_require_a_statistical_cohort(self):
        weather = weather_fixture()
        profile, sections = terrain_fixture()
        editions = [dict(city="Test", year=2020, race=" Test MARATHON "), dict(city="Absent", year=2020, race="Test Marathon")]
        result = self.build_fixture([weather], [profile], sections, editions)
        self.assertIsNotNone(result["Test", 2020, " Test MARATHON "]["weather"])
        self.assertIsNotNone(result["Test", 2020, " Test MARATHON "]["terrain"])
        self.assertIn("No weather", result["Absent", 2020, "Test Marathon"]["weather_reason"])
        self.assertIn("No course", result["Absent", 2020, "Test Marathon"]["terrain_reason"])
        json.dumps(list(result.values()), allow_nan=False)

    def test_supplied_route_validity_years_are_respected(self):
        # Warsaw's profile is supplied as valid from 2019; its 2015-2018 editions were another race and route.
        profile, sections = terrain_fixture()
        profile["valid_from_year"] = 2019
        editions = [dict(city="Test", year=2018, race="Test Marathon"), dict(city="Test", year=2019, race="Test Marathon")]
        result = self.build_fixture([], [profile], sections, editions)
        self.assertIsNone(result["Test", 2018, "Test Marathon"]["terrain"])
        self.assertIn("applies from 2019 only", result["Test", 2018, "Test Marathon"]["terrain_reason"])
        terrain = result["Test", 2019, "Test Marathon"]["terrain"]
        self.assertEqual((terrain["valid_from_year"], terrain["valid_to_year"], terrain["historical_validity_known"]), (2019, None, False))
        profile["valid_from_year"], profile["valid_to_year"] = None, 2018
        result = self.build_fixture([], [profile], sections, editions)
        self.assertIsNotNone(result["Test", 2018, "Test Marathon"]["terrain"])
        self.assertIn("until 2018", result["Test", 2019, "Test Marathon"]["terrain_reason"])

    def test_ambiguous_weather_raw_editions_profiles_and_names_remain_absent(self):
        weather = weather_fixture()
        profile, sections = terrain_fixture()
        editions = [dict(city="Test", year=2020, race="Test Marathon")]
        result = self.build_fixture([weather, weather], [profile, profile], sections, editions)
        self.assertIn("Multiple weather", result["Test", 2020, "Test Marathon"]["weather_reason"])
        self.assertIn("Multiple course", result["Test", 2020, "Test Marathon"]["terrain_reason"])
        editions.append(dict(city="Test", year=2020, race="Other Race"))
        result = self.build_fixture([weather], [profile], sections, editions)
        self.assertTrue(all(v["weather"] is None for v in result.values()))
        self.assertIn("unambiguous", result["Test", 2020, "Test Marathon"]["weather_reason"])
        result = self.build_fixture([weather], [profile], sections, editions[1:])
        self.assertIn("does not match", result["Test", 2020, "Other Race"]["weather_reason"])
        self.assertIn("does not match", result["Test", 2020, "Other Race"]["terrain_reason"])


if __name__ == "__main__":
    unittest.main()
