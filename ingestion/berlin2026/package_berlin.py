#!/usr/bin/env python3
"""Validate/package source results; optionally append to a new verified SQLite copy.

No network, third-party dependencies, in-place updates, or inferred runner ages.
The existing producer's feature tables are deliberately not regenerated here.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
from urllib.parse import parse_qs, urlsplit

EVENT = "BML_HCH3C0OH37C"
SOURCE = "https://berlin.r.mikatiming.com/2026/"
SPLITS = [f"split_{km}km" for km in (5, 10, 15, 20, 25, 30, 35, 40)] + ["split_42_2km"]
TIMES = SPLITS + ["halfway", "finish_gun"]
FIELDS = ["source_result_id", "event_id", "city", "race", "year", "runner", "bib", "sex",
          "age", "age_group", "nationality"] + SPLITS + ["halfway", "finish_gun", "status",
          "source_url", "observed_at", "provisional"]
RAW_FIELDS = ["race", "year", "city", "runner", "sex", "age", "age_group"] + SPLITS + [
    "source_url", "ingested_at", "age_or_group"]
SOURCE_FIELDS = ["race", "year", "city", "paper_city", "url", "url_scope", "url_as_published",
                 "timing_vendor", "format", "last_ingested", "has_5km_splits", "corpus", "notes"]
STATUSES = {"finished", "dnf", "dns", "dsq", "started", "not started", "running", "not finished",
            "did not finish", "did not start", "disqualified", "unknown", "withdrawn"}


class ValidationError(ValueError):
    pass


def json_text(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def sha256_file(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def seconds(value):
    if value is None:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"(?:\d+:[0-5]\d:[0-5]\d|\d+:[0-5]\d)(?:\.\d+)?", value):
        raise ValidationError(f"Invalid elapsed timing string: {value!r}")
    parts = value.split(":")
    return sum(float(part) * (60 ** index) for index, part in enumerate(reversed(parts)))


def source_identity(url):
    if not isinstance(url, str):
        raise ValidationError("source_url must be a string")
    p = urlsplit(url)
    if p.scheme != "https" or p.netloc != "berlin.r.mikatiming.com" or p.path.rstrip("/") != "/2026":
        raise ValidationError("source_url must be an HTTPS Berlin 2026 mika:timing URL")
    query = parse_qs(p.query)
    if len(query.get("idp", [])) != 1 or len(query.get("event", [])) != 1:
        raise ValidationError("source_url must include one event and one idp")
    return query["event"][0], query["idp"][0]


def validate_row(row):
    if not isinstance(row, dict):
        raise ValidationError("Each input line must be a JSON object")
    missing = set(FIELDS) - row.keys()
    if missing:
        raise ValidationError(f"Missing fields (use JSON null for unavailable values): {sorted(missing)}")
    if (row["event_id"], row["city"], row["race"], row["year"]) != (EVENT, "Berlin", "Berlin Marathon", 2026):
        raise ValidationError("Unexpected edition: only Berlin Marathon 2026 running event is supported")
    if not isinstance(row["source_result_id"], str) or not re.fullmatch(r"[A-Za-z0-9_-]+", row["source_result_id"]):
        raise ValidationError("source_result_id must be a nonempty source identifier")
    if source_identity(row["source_url"]) != (EVENT, row["source_result_id"]):
        raise ValidationError("source_url participant/event does not match normalized identity")
    if row["age"] is not None:
        raise ValidationError("The source supplies an age group, not an exact age: age must remain null")
    if row["provisional"] is not True:
        raise ValidationError("This race-day source is provisional; provisional must be true")
    for field in ("runner", "bib", "sex", "age_group", "nationality"):
        if row[field] is not None and (not isinstance(row[field], str) or not row[field].strip()):
            raise ValidationError(f"{field} must be a nonempty string or null")
    if row["sex"] not in (None, "M", "W", "F", "X", "D"):
        raise ValidationError("Unsupported recorded sex category; preserve and review source mapping")
    if not isinstance(row["status"], str) or row["status"].casefold() not in STATUSES:
        raise ValidationError(f"Unsupported source status: {row['status']!r}")
    try:
        dt = datetime.fromisoformat(row["observed_at"].replace("Z", "+00:00"))
        if dt.tzinfo is None or dt.utcoffset() is None:
            raise ValueError("timezone missing")
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValidationError("observed_at must be an ISO-8601 timestamp with timezone") from exc
    for field in TIMES:
        seconds(row[field])
    json_text(row)  # Verify extra source fields are losslessly serializable too.
    return row


def semantic_hash(row):
    # Observation time can advance on an unchanged rerun; all other fields stay strict.
    return hashlib.sha256(json_text({k: v for k, v in row.items() if k != "observed_at"}).encode()).hexdigest()


def read_rows(path):
    rows = {}
    duplicates = 0
    with Path(path).open(encoding="utf-8") as f:
        for number, line in enumerate(f, 1):
            if not line.strip():
                continue
            try:
                row = validate_row(json.loads(line))
                key = (row["event_id"], row["source_result_id"])
                if key in rows:
                    if semantic_hash(rows[key]) != semantic_hash(row):
                        raise ValidationError(f"Conflicting duplicate source key {key}")
                    duplicates += 1
                    # Retain the first observed complete source payload unchanged.
                else:
                    rows[key] = row
            except (ValueError, TypeError) as exc:
                raise ValidationError(f"{path}:{number}: {exc}") from exc
    if not rows:
        raise ValidationError("Refusing an empty edition package")
    return [rows[key] for key in sorted(rows)], duplicates


def quality_flags(row):
    flags = []
    if any(row[field] is None for field in SPLITS):
        flags.append("missing_checkpoint")
    ordered = SPLITS[:4] + ["halfway"] + SPLITS[4:]
    values = [seconds(row[field]) for field in ordered if row[field] is not None]
    if any(v <= 0 for v in values) or any(a >= b for a, b in zip(values, values[1:])):
        flags.append("non_increasing_checkpoint")
    finish = seconds(row["split_42_2km"])
    gun = seconds(row["finish_gun"])
    if finish is not None and gun is not None and gun < finish:
        flags.append("gun_before_net_finish")
    if row["status"].casefold() == "finished" and finish is None:
        flags.append("finished_without_finish_time")
    if row["status"].casefold() in {"dns", "did not start", "not started"} and values:
        flags.append("not_started_with_checkpoints")
    return flags


def audit_rows(rows, duplicates):
    flags = Counter(flag for row in rows for flag in quality_flags(row))
    return {
        "unique_records": len(rows), "identical_duplicate_input_rows": duplicates,
        "source_status_counts": dict(sorted(Counter(row["status"] for row in rows).items())),
        "complete_checkpoint_records": sum(all(row[field] is not None for field in SPLITS) for row in rows),
        "quality_flag_counts_overlapping": dict(sorted(flags.items())),
        "exact_age_records": sum(row["age"] is not None for row in rows),
        "provisional": True, "coverage_status": "unreconciled",
        "coverage_note": "An error-free package is not proof of full-field source coverage.",
    }


def validate_collector_report(path, input_path, record_count, duplicate_count):
    report = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(report, dict) or (report.get("event_id"), report.get("year")) != (EVENT, 2026):
        raise ValidationError("Collector report belongs to a different event/year")
    if report.get("normalized_sha256") != sha256_file(input_path):
        raise ValidationError("Collector report normalized_sha256 does not match the input file")
    if report.get("fetched_count") != record_count or duplicate_count:
        raise ValidationError("Collector report count does not match unique input records")
    listed = report.get("listed_count")
    if not isinstance(listed, int) or listed < record_count or report.get("missing_details") != listed - record_count:
        raise ValidationError("Collector report listed/missing counts are inconsistent")
    if report.get("status") not in {"complete", "incomplete"}:
        raise ValidationError("Only a complete or incomplete collection can accompany a dataset")
    if report["status"] == "complete" and (report.get("listing_complete") is not True or listed != record_count):
        raise ValidationError("Collector report claims completeness without reconciling all listed results")
    return report


def write_package(input_path, output_path, collector_report=None):
    rows, duplicates = read_rows(input_path)
    report = (validate_collector_report(collector_report, input_path, len(rows), duplicates)
              if collector_report is not None else None)
    output = Path(output_path)
    output.mkdir(parents=True, exist_ok=False)
    jsonl = output / "berlin-2026.jsonl"
    with jsonl.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json_text(row) + "\n")
    # Every cell is JSON, so CSV null, empty strings and nested extra fields are unambiguous.
    fields = FIELDS + sorted(set().union(*(row.keys() for row in rows)) - set(FIELDS))
    with (output / "berlin-2026.csv").open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        for row in rows:
            writer.writerow([json_text(row.get(field)) for field in fields])
    db = sqlite3.connect(output / "berlin-2026.sqlite")
    try:
        columns = []
        for field in FIELDS:
            kind = "INTEGER" if field in {"year", "provisional"} else "TEXT"
            columns.append(f'{quote(field)} {kind}')
        db.execute("CREATE TABLE results (" + ",".join(columns) +
                   ",source_payload_json TEXT NOT NULL,quality_flags_json TEXT NOT NULL,"
                   "PRIMARY KEY(event_id,source_result_id))")
        for row in rows:
            values = []
            for field in FIELDS:
                value = row.get(field)
                if value is not None and not isinstance(value, (str, int, float)):
                    value = json_text(value)
                values.append(value)
            db.execute("INSERT INTO results VALUES (" + ",".join("?" for _ in range(len(FIELDS) + 2)) + ")",
                       values + [json_text(row), json_text(quality_flags(row))])
        db.commit()
        assert_integrity(db)
    finally:
        db.close()
    audit = audit_rows(rows, duplicates)
    if report is not None:
        (output / "collector-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        if report["status"] == "complete":
            audit["coverage_status"] = "listed-field-reconciled"
            audit["coverage_note"] = "All source-listed records reconcile to collected details; the final official finisher total is not independently established."
    manifest = {
        "schema_version": 1, "edition": {"city": "Berlin", "race": "Berlin Marathon", "year": 2026,
                                           "event_id": EVENT},
        "created_at": utc_now(), "source": SOURCE, "natural_key": ["event_id", "source_result_id"],
        "canonical_record_ids": False, "features_regenerated": False,
        "timing_contract": "Original cumulative elapsed clock strings; null is unobserved. split_42_2km is 42.195 km; halfway is 21.0975 km.",
        "csv_contract": "Every data cell is a JSON value, including quoted string literals and literal null. Decode with json.loads after csv parsing.",
        "input_sha256": sha256_file(input_path), "audit": audit,
        "assets": {file.name: {"bytes": file.stat().st_size, "sha256": sha256_file(file)}
                   for file in sorted(output.iterdir()) if file.is_file()},
    }
    (output / "MANIFEST.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def quote(identifier):
    if not isinstance(identifier, str) or "\x00" in identifier:
        raise ValidationError("Invalid SQL identifier")
    return '"' + identifier.replace('"', '""') + '"'


def assert_integrity(db):
    result = db.execute("PRAGMA integrity_check").fetchall()
    if result != [("ok",)]:
        raise ValidationError(f"SQLite integrity_check failed: {result[:10]}")


def inspect_table(db, table, fields):
    info = db.execute(f"PRAGMA table_info({quote(table)})").fetchall()
    if not info:
        raise ValidationError(f"Missing expected SQLite table {table}")
    by_name = {row[1]: row for row in info}
    if not set(fields + ["id"]) <= by_name.keys():
        raise ValidationError(f"Unsupported {table} schema: missing {sorted(set(fields + ['id']) - by_name.keys())}")
    if (by_name["id"][2].upper() != "INTEGER" or by_name["id"][5] != 1 or
            any(row[5] for row in info if row[1] != "id")):
        raise ValidationError(f"Unsupported {table} id: expected INTEGER PRIMARY KEY")
    for name, entry in by_name.items():
        if name not in fields + ["id"] and entry[3] and entry[4] is None:
            raise ValidationError(f"Unsupported required column: {table}.{name}")
    if db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?", (table,)).fetchone():
        raise ValidationError(f"Review triggers on {table} before adapting this append-only importer")
    if db.execute(f"PRAGMA foreign_key_list({quote(table)})").fetchone():
        raise ValidationError(f"Review foreign keys on {table} before adapting this importer")
    return [row[1] for row in info]


def raw_values(row):
    mapped = {field: row[field] for field in RAW_FIELDS if field in row}
    mapped["ingested_at"] = row["observed_at"]
    mapped["age_or_group"] = row["age_group"]
    return mapped


def digest_table(db, table, fields):
    digest = hashlib.sha256()
    cursor = db.execute("SELECT " + ",".join(quote(f) for f in fields) + " FROM " + quote(table) + " ORDER BY id")
    for row in cursor:
        digest.update(json_text(list(row)).encode())
        digest.update(b"\n")
    return digest.hexdigest()


def append_rows(db, rows):
    raw_schema = inspect_table(db, "race_records", RAW_FIELDS)
    source_schema = inspect_table(db, "sources", SOURCE_FIELDS)
    before_count = db.execute("SELECT count(*) FROM race_records").fetchone()[0]
    old_max = db.execute("SELECT coalesce(max(id),0) FROM race_records").fetchone()[0]
    # Use source URL participant identity to reconcile editions imported outside this helper.
    existing = {}
    for record in db.execute("SELECT id," + ",".join(quote(f) for f in RAW_FIELDS) +
                             " FROM race_records WHERE city='Berlin' AND year=2026"):
        values = dict(zip(["id"] + RAW_FIELDS, record))
        key = source_identity(values["source_url"])
        if key[0] != EVENT or key in existing:
            raise ValidationError("Existing Berlin 2026 source identities are ambiguous; manual mapping required")
        existing[key] = values
    db.execute("""CREATE TABLE IF NOT EXISTS berlin_2026_source_records (
        event_id TEXT NOT NULL, source_result_id TEXT NOT NULL, record_id INTEGER NOT NULL UNIQUE,
        semantic_sha256 TEXT NOT NULL, source_payload_json TEXT NOT NULL,
        first_observed_at TEXT NOT NULL, provisional INTEGER NOT NULL CHECK(provisional=1),
        PRIMARY KEY(event_id,source_result_id), FOREIGN KEY(record_id) REFERENCES race_records(id))""")
    if db.execute("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='berlin_2026_source_records'").fetchone():
        raise ValidationError("Unexpected source ledger trigger; review before appending")
    counts = {"inserted": 0, "unchanged": 0, "adopted_existing": 0}
    for row in rows:
        key = (row["event_id"], row["source_result_id"])
        mapped = raw_values(row)
        ledger = db.execute("SELECT record_id,semantic_sha256 FROM berlin_2026_source_records WHERE event_id=? AND source_result_id=?", key).fetchone()
        previous = existing.get(key)
        if ledger and (not previous or ledger[0] != previous["id"]):
            raise ValidationError(f"Source ledger and raw database disagree for {key}")
        if ledger and ledger[1] != semantic_hash(row):
            raise ValidationError(f"Source result changed for {key}; correction must be reviewed separately")
        if previous:
            compare = [field for field in RAW_FIELDS if field not in {"source_url", "ingested_at"}]
            if any(previous[field] != mapped[field] for field in compare):
                raise ValidationError(f"Existing raw result conflicts for {key}; no overwrite performed")
            record_id = previous["id"]
            counts["unchanged" if ledger else "adopted_existing"] += 1
        else:
            cursor = db.execute("INSERT INTO race_records (" + ",".join(quote(f) for f in RAW_FIELDS) + ") VALUES (" +
                                ",".join("?" for _ in RAW_FIELDS) + ")", [mapped[field] for field in RAW_FIELDS])
            record_id = cursor.lastrowid
            counts["inserted"] += 1
        if ledger is None:
            db.execute("INSERT INTO berlin_2026_source_records VALUES (?,?,?,?,?,?,1)",
                       (*key, record_id, semantic_hash(row), json_text(row), row["observed_at"]))
    source_rows = db.execute("SELECT id,url FROM sources WHERE city='Berlin' AND year=2026").fetchall()
    if source_rows and (len(source_rows) != 1 or source_rows[0][1].rstrip("/") != SOURCE.rstrip("/")):
        raise ValidationError("Existing Berlin 2026 source registry needs manual reconciliation")
    if not source_rows:
        # These registry descriptors match Berlin 2023–2025 in the verified
        # private-export-20260912-0934 sources.parquet; see SCHEMA.md.
        source = dict(zip(SOURCE_FIELDS, ["Berlin Marathon", 2026, "Berlin", "Berlin", SOURCE, "race-year", SOURCE,
                       "mikatiming", "searchable,html-list,html-detail", max(row["observed_at"] for row in rows),
                       "yes", "majors-current", "Provisional 2026 public results. Source-identity and payload ledger: berlin_2026_source_records. Field completeness unreconciled; see edition manifest."]))
        db.execute("INSERT INTO sources (" + ",".join(quote(f) for f in SOURCE_FIELDS) + ") VALUES (" +
                   ",".join("?" for _ in SOURCE_FIELDS) + ")", [source[f] for f in SOURCE_FIELDS])
    after_count = db.execute("SELECT count(*) FROM race_records").fetchone()[0]
    if after_count != before_count + counts["inserted"]:
        raise ValidationError("Row count changed unexpectedly during append")
    return {**counts, "base_records": before_count, "output_records": after_count, "base_max_id": old_max,
            "source_registered": not bool(source_rows), "raw_schema": raw_schema, "source_schema": source_schema}


def merge_copy(input_path, snapshot_path, snapshot_sha256, output_path):
    rows, duplicates = read_rows(input_path)
    source = Path(snapshot_path).resolve()
    output = Path(output_path).resolve()
    if source == output or output.exists():
        raise ValidationError("Output must be a new path, never the input database")
    if not re.fullmatch(r"[0-9a-f]{64}", snapshot_sha256):
        raise ValidationError("Supply the verified uncompressed snapshot SHA-256")
    if any(Path(str(source) + suffix).exists() for suffix in ("-wal", "-journal")):
        raise ValidationError("Input has a journal/WAL: use a frozen SQLite backup, not a live database")
    if sha256_file(source) != snapshot_sha256:
        raise ValidationError("Snapshot checksum mismatch")
    audit_path = Path(str(output) + ".audit.json")
    if audit_path.exists():
        raise ValidationError("Output audit already exists")
    src = sqlite3.connect(source.as_uri() + "?mode=ro&immutable=1", uri=True)
    dest = None
    output_created = False
    try:
        assert_integrity(src)
        raw_schema = inspect_table(src, "race_records", RAW_FIELDS)
        source_schema = inspect_table(src, "sources", SOURCE_FIELDS)
        base_raw_digest = digest_table(src, "race_records", raw_schema)
        base_sources_digest = digest_table(src, "sources", source_schema)
        with output.open("xb"):
            pass
        output_created = True
        dest = sqlite3.connect(output)
        src.backup(dest)
        dest.execute("PRAGMA foreign_keys=ON")
        dest.execute("BEGIN IMMEDIATE")
        report = append_rows(dest, rows)
        # The old row prefix must be byte-for-byte equivalent at the SQL value level.
        dest.execute("CREATE TEMP VIEW old_raw AS SELECT * FROM race_records WHERE id<=%d" % report["base_max_id"])
        if digest_table(dest, "old_raw", raw_schema) != base_raw_digest:
            raise ValidationError("Existing raw records changed")
        old_source_ids = [r[0] for r in src.execute("SELECT id FROM sources ORDER BY id")]
        if old_source_ids:
            dest.execute("CREATE TEMP VIEW old_sources AS SELECT * FROM sources WHERE id<=%d" % max(old_source_ids))
            if digest_table(dest, "old_sources", source_schema) != base_sources_digest:
                raise ValidationError("Existing source registry changed")
        assert_integrity(dest)
        if dest.execute("PRAGMA foreign_key_check").fetchone():
            raise ValidationError("Foreign-key check failed")
        if sha256_file(source) != snapshot_sha256:
            raise ValidationError("Source snapshot changed while copying")
        dest.commit()
        dest.close()
        dest = None
        report.update({"schema_version": 1, "created_at": utc_now(), "base_sha256": snapshot_sha256,
                       "input_sha256": sha256_file(input_path), "output_sha256": sha256_file(output),
                       "base_raw_sql_value_digest": base_raw_digest,
                       "existing_raw_records_preserved": True, "features_regenerated": False,
                       "feature_note": "Existing features/exports remain unchanged and may not cover new IDs. Rebuild the synchronized CORE/FULL and website from this output snapshot.",
                       "audit": audit_rows(rows, duplicates)})
        audit_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        return report
    except Exception:
        if dest is not None:
            dest.rollback()
            dest.close()
        # Remove only this call's newly-created failed output, never the supplied snapshot.
        if output_created:
            output.unlink(missing_ok=True)
        raise
    finally:
        src.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    package = sub.add_parser("package")
    package.add_argument("--input", required=True, type=Path)
    package.add_argument("--output", required=True, type=Path)
    package.add_argument("--collector-report", type=Path)
    merge = sub.add_parser("merge")
    merge.add_argument("--input", required=True, type=Path)
    merge.add_argument("--snapshot", required=True, type=Path)
    merge.add_argument("--snapshot-sha256", required=True)
    merge.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == "package":
            result = write_package(args.input, args.output, args.collector_report)
        else:
            result = merge_copy(args.input, args.snapshot, args.snapshot_sha256, args.output)
    except (ValidationError, FileExistsError, sqlite3.Error) as exc:
        parser.exit(1, f"ERROR: {exc}\n")
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
