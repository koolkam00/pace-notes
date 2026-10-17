"""Validate supplied edition weather and current-route context for runner views.

This module does not estimate personal exposure, correct a finish time, or infer
that a current GPX route was used in a historical edition. It reads overlays from
the same immutable FULL source directory used by the runner lookup builder.
"""
import json
import math
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from zoneinfo import ZoneInfo

from build_pacing import POINTS, records
from build_weather import finite_number, weather_observation


WEATHER_CONTEXT = (
    "Modeled weather near the supplied scheduled start, not a runner's personal "
    "wave or conditions along the course. Start times and race dates are supplied "
    "by the data producer and have not been independently verified."
)
PRECIPITATION_NOTE = (
    "Each precipitation value is the total rain, showers and snow during the "
    "preceding hour; it is not an instantaneous rainfall rate or a race total."
)
TERRAIN_CONTEXT = (
    "Supplied current-route elevation proxy. The route used in this historical "
    "edition has not been verified; these figures do not adjust the runner's time."
)
TERRAIN_METHOD = (
    "Gain, loss and net change are separate sums of the nine supplied section "
    "values from 0 to 42.195 km. Source processing applies ascent/descent thresholds, "
    "so gain minus loss need not equal net change. Whole-profile totals use a "
    "different distance and processing and are retained separately."
)
WEATHER_FIELDS = {
    "temp_c": "temperature_2m", "feels_like_c": "apparent_temperature",
    "dewpoint_c": "dewpoint_2m", "humidity_pct": "relative_humidity_2m",
    "wind_mps": "windspeed_10m", "wind_dir_deg": "winddirection_10m",
    "precip_mm": "precipitation", "cloud_pct": "cloudcover",
    "pressure_hpa": "pressure_msl", "weather_code": "weathercode",
}
CORE_WEATHER_FIELDS = {"temp_c", "dewpoint_c", "humidity_pct", "wind_mps"}


def same_name(left, right):
    return (isinstance(left, str) and isinstance(right, str) and bool(left.strip())
            and left.strip().casefold() == right.strip().casefold())


def public_url(value):
    parsed = urlparse(value or "")
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("missing or invalid public source URL")
    return parsed


def weather_units(row):
    """Validate units from the archived request, never a newly fetched response."""
    parsed = public_url(row.get("source_url"))
    if row.get("source") != "open-meteo" or parsed.hostname != "archive-api.open-meteo.com" or parsed.path != "/v1/archive":
        raise ValueError("weather source has no supported unit contract")
    query = parse_qs(parsed.query)

    def parameter(names, default=None):
        values = [value for name in names for value in query.get(name, [])]
        if len(values) > 1:
            raise ValueError("ambiguous weather request parameter: " + names[0])
        return values[0] if values else default

    if parameter(["windspeed_unit", "wind_speed_unit"], "kmh") != "ms":
        raise ValueError("weather source wind unit is not meters per second")
    if parameter(["temperature_unit"], "celsius") != "celsius" or parameter(["precipitation_unit"], "mm") != "mm":
        raise ValueError("weather source temperature or precipitation unit mismatch")
    if parameter(["timeformat"], "iso8601") != "iso8601":
        raise ValueError("weather source time format mismatch")
    if not row.get("timezone") or parameter(["timezone"]) != row["timezone"]:
        raise ValueError("weather source timezone mismatch")
    ZoneInfo(row["timezone"])
    if any(parameter([key]) != row["race_date"] for key in ("start_date", "end_date")):
        raise ValueError("weather source request date mismatch")
    for key, limit, query_key in (("lat", 90, "latitude"), ("lon", 180, "longitude")):
        if not finite_number(row.get(key)) or abs(row[key]) > limit or abs(float(parameter([query_key])) - row[key]) > 1e-5:
            raise ValueError("weather source location mismatch")


def valid_weather_value(key, value):
    if not finite_number(value):
        return False
    if key in ("humidity_pct", "cloud_pct"):
        return 0 <= value <= 100
    if key in ("wind_mps", "precip_mm"):
        return value >= 0
    if key == "wind_dir_deg":
        return 0 <= value <= 360
    if key == "pressure_hpa":
        return value > 0
    if key == "weather_code":
        return value == int(value) and 0 <= value <= 99
    return True


def runner_weather(row):
    """Reuse study start-hour checks and validate each displayed archived hour."""
    observation, error = weather_observation(row)
    if error:
        return None, "Weather row failed validation: " + error + "."
    try:
        weather_units(row)
        hourly = json.loads(row["hourly_json"])
        times = [datetime.fromisoformat(value) for value in hourly["time"]]
        start = datetime.fromisoformat(observation["start_hour"])
        indices = [times.index(start + timedelta(hours=offset)) for offset in range(5)]
        available, issues = {}, {}
        for key, source_key in WEATHER_FIELDS.items():
            values = hourly.get(source_key)
            if not isinstance(values, list) or len(values) != len(times):
                issues[key] = "Hourly measurements are missing or have the wrong length."
            elif not valid_weather_value(key, row.get(key)) or any(not valid_weather_value(key, values[i]) for i in indices):
                issues[key] = "A supplied measurement is missing or invalid."
            elif abs(row[key] - values[indices[0]]) > .011:
                issues[key] = "Start value disagrees with the archived start hour."
            else:
                available[key] = values
            if key in CORE_WEATHER_FIELDS and key in issues:
                raise ValueError(key + ": " + issues[key])
        if any(available["dewpoint_c"][i] > available["temp_c"][i] + .2 for i in indices):
            raise ValueError("hourly dew point exceeds temperature")
        result = {**observation, "timezone": row["timezone"], "latitude": float(row["lat"]),
                  "longitude": float(row["lon"]), "source": row["source"], "source_url": row["source_url"],
                  "notes": row.get("notes") or "", "updated_at": row.get("updated_at"),
                  "context_label": WEATHER_CONTEXT, "precipitation_note": PRECIPITATION_NOTE,
                  "start_time_independently_verified": False, "personal_exposure": False,
                  "field_issues": issues,
                  "documentation_url": "https://open-meteo.com/en/docs/historical-weather-api"}
        result.update({key: float(row[key]) if key in available else None for key in WEATHER_FIELDS})
        result["hours"] = [dict(time=times[i].isoformat(timespec="minutes"), **{
            key: float(available[key][i]) if key in available else None for key in WEATHER_FIELDS
        }) for i in indices]
        return result, None
    except (KeyError, ValueError, TypeError, IndexError, OverflowError) as exc:
        return None, "Weather row failed validation: " + str(exc) + "."


def runner_terrain(profile, segments):
    """Keep source section distances/net values, with no profile rescaling."""
    try:
        public_url(profile.get("source_url"))
        if not profile.get("course_key") or not profile.get("source"):
            raise ValueError("missing course identifier or source")
        for key in ("distance_km", "elev_gain_m", "elev_loss_m", "elev_min_m", "elev_max_m"):
            if not finite_number(profile.get(key)):
                raise ValueError("missing or invalid profile measurement: " + key)
        if profile["distance_km"] <= 0 or min(profile["elev_gain_m"], profile["elev_loss_m"]) < 0 or profile["elev_min_m"] > profile["elev_max_m"]:
            raise ValueError("invalid profile measurement bounds")
        points = json.loads(profile["points_json"])
        if not isinstance(points, list) or len(points) < 2:
            raise ValueError("missing elevation profile points")
        if any(not finite_number(p.get(key)) for p in points for key in ("d_km", "elev_m")):
            raise ValueError("invalid elevation profile point")
        if abs(points[0]["d_km"]) > 1e-6 or abs(points[-1]["d_km"] - profile["distance_km"]) > 1e-6 or any(b["d_km"] <= a["d_km"] for a, b in zip(points, points[1:])):
            raise ValueError("profile point distances do not match the supplied route")
        bounds = list(zip([0, *POINTS[:-1]], POINTS))
        if len(segments) != len(bounds):
            raise ValueError("expected exactly nine course sections")
        segments = sorted(segments, key=lambda s: s["seg_from_km"])
        embedded = json.loads(profile["segments_json"])
        if not isinstance(embedded, list) or len(embedded) != len(bounds):
            raise ValueError("profile embedded sections are incomplete")
        embedded = sorted(embedded, key=lambda s: s["km_from"])
        sections = []
        for section, stored, (start, end) in zip(segments, embedded, bounds):
            if section["course_key"] != profile["course_key"] or section["city"] != profile["city"] or not same_name(section["race"], profile["race"]) or section["source"] != profile["source"]:
                raise ValueError("course section source or identity mismatch")
            if any(not finite_number(section.get(key)) for key in ("seg_from_km", "seg_to_km", "elev_gain_m", "elev_loss_m", "elev_net_m")):
                raise ValueError("missing or invalid section measurement")
            if abs(section["seg_from_km"] - start) > 1e-6 or abs(section["seg_to_km"] - end) > 1e-6 or min(section["elev_gain_m"], section["elev_loss_m"]) < 0:
                raise ValueError("invalid course section bounds")
            for key, embedded_key in (("seg_from_km", "km_from"), ("seg_to_km", "km_to"), ("elev_gain_m", "elev_gain_m"), ("elev_loss_m", "elev_loss_m"), ("elev_net_m", "elev_net_m")):
                if not finite_number(stored.get(embedded_key)) or abs(section[key] - stored[embedded_key]) > 1e-6:
                    raise ValueError("profile and course-section measurements disagree")
            sections.append(dict(start_km=float(start), end_km=float(end), distance_km=float(end - start),
                                 gain_m=float(section["elev_gain_m"]), loss_m=float(section["elev_loss_m"]),
                                 net_m=float(section["elev_net_m"])))
        result = dict(course_key=profile["course_key"], distance_km=float(POINTS[-1]),
            segment_span_km=float(POINTS[-1]), profile_distance_km=float(profile["distance_km"]),
            gain_m=math.fsum(s["gain_m"] for s in sections), loss_m=math.fsum(s["loss_m"] for s in sections),
            net_m=math.fsum(s["net_m"] for s in sections), sections=sections,
            reported_profile_gain_m=float(profile["elev_gain_m"]), reported_profile_loss_m=float(profile["elev_loss_m"]),
            profile_endpoint_net_m=float(points[-1]["elev_m"] - points[0]["elev_m"]),
            min_elevation_m=float(profile["elev_min_m"]), max_elevation_m=float(profile["elev_max_m"]),
            points=[dict(distance_km=float(p["d_km"]), elevation_m=float(p["elev_m"])) for p in points],
            source=profile["source"], source_url=profile["source_url"], notes=profile.get("notes") or "",
            updated_at=profile.get("updated_at"), valid_from_year=validity_years(profile)[0],
            valid_to_year=validity_years(profile)[1], historical_validity_known=False,
            context_label=TERRAIN_CONTEXT, aggregation_method=TERRAIN_METHOD)
        result["profile_distance_note"] = (
            f"The supplied profile track is {profile['distance_km']:.3f} km; the supplied sections "
            "are labeled through 42.195 km. Distances have not been rescaled, extended or treated "
            "as proof of the historical race route."
        )
        return result, None
    except (KeyError, ValueError, TypeError, IndexError, OverflowError) as exc:
        return None, "Course profile failed validation: " + str(exc) + "."


def validity_years(profile):
    """The supplied validity years as integers (parquet stores them as doubles), or None."""
    years = []
    for key in ("valid_from_year", "valid_to_year"):
        value = profile.get(key)
        if value is not None and (not finite_number(value) or value != int(value)):
            raise ValueError("invalid course validity year")
        years.append(None if value is None else int(value))
    return tuple(years)


def within_validity(profile, year):
    """True unless the profile supplies a validity interval that excludes this edition year."""
    start, end = validity_years(profile)
    return (start is None or year >= start) and (end is None or year <= end)


def validity_reason(profile, year):
    start, end = validity_years(profile)
    span = f"{start}\u2013{end}" if start is not None and end is not None else (f"from {start}" if start is not None else f"until {end}")
    return (f"The supplied course profile applies {span} only, so it is not attached to this {year} edition. "
            "No route for this year was supplied.")


def build_environment(db, source, editions):
    """Return {(city, year, race): context}; preserve reasons for absent overlays."""
    source = Path(source)

    def read_overlay(name):
        path = source / (name + ".parquet")
        return records(db, "SELECT * FROM read_parquet(?)", [str(path)]) if path.is_file() else []

    weather, profiles, sections, raw_names = (defaultdict(list) for _ in range(4))
    for row in read_overlay("race_conditions"):
        weather[row["city"], row["year"]].append(row)
    for row in read_overlay("course_profiles"):
        profiles[row["city"]].append(row)
    for row in read_overlay("course_segments"):
        sections[row["course_key"]].append(row)
    for edition in editions:
        raw_names[edition["city"], edition["year"]].append(edition["race"])
    result, terrain_cache = {}, {}
    for edition in editions:
        city, year, race = edition["city"], edition["year"], edition["race"]
        context = dict(weather=None, weather_reason=None, terrain=None, terrain_reason=None)
        candidates = weather[city, year]
        if len(set(raw_names[city, year])) != 1 or not isinstance(race, str) or not race.strip():
            context["weather_reason"] = "The raw city/year does not identify one unambiguous race."
        elif not candidates:
            context["weather_reason"] = "No weather row was supplied for this race edition."
        elif len(candidates) != 1:
            context["weather_reason"] = "Multiple weather rows were supplied for this city/year."
        elif not same_name(race, candidates[0]["race"]):
            context["weather_reason"] = "The supplied weather race name does not match this recorded edition."
        else:
            context["weather"], context["weather_reason"] = runner_weather(candidates[0])
        candidates = profiles[city]
        if not candidates:
            context["terrain_reason"] = "No course elevation profile was supplied for this city."
        elif len(candidates) != 1:
            context["terrain_reason"] = "Multiple course profiles were supplied; a historical route cannot be selected."
        elif not same_name(race, candidates[0]["race"]):
            context["terrain_reason"] = "The supplied course profile race name does not match this recorded race."
        elif not within_validity(candidates[0], year):
            # A supplied validity interval (Warsaw's profile starts in 2019, when its autumn race began) is
            # respected; a year outside it gets no route rather than another race's course.
            context["terrain_reason"] = validity_reason(candidates[0], year)
        else:
            profile = candidates[0]
            if city not in terrain_cache:
                terrain_cache[city] = runner_terrain(profile, sections[profile["course_key"]])
            context["terrain"], context["terrain_reason"] = terrain_cache[city]
        result[city, year, race] = context
    return result
