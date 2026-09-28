"""Synthetic fixtures only. These are not Berlin marathon race records."""
import copy
import csv
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

import package_berlin as subject


def synthetic_row(participant="SYNTHETIC_TEST_1"):
    row = dict.fromkeys(subject.FIELDS)
    row.update(source_result_id=participant, event_id=subject.EVENT, city="Berlin",
               race="Berlin Marathon", year=2026, runner="SYNTHETIC TEST ONLY",
               bib="TEST", sex="F", age_group="W35", nationality="SYNTHETIC",
               status="Finished", source_url=subject.SOURCE + "?event=" + subject.EVENT + "&idp=" + participant,
               observed_at="2026-09-27T18:00:00Z", provisional=True,
               halfway="01:45:00", finish_gun="03:31:00")
    for field, timing in zip(subject.SPLITS, ["00:25:00", "00:50:00", "01:15:00", "01:40:00",
                                             "02:05:00", "02:30:00", "02:55:00", "03:20:00", "03:30:00"]):
        row[field] = timing
    return row


def write_rows(path, rows):
    path.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")


def make_snapshot(path, trigger=False, extra_required=False):
    with sqlite3.connect(path) as db:
        declarations = []
        for field in subject.RAW_FIELDS:
            kind = "INTEGER" if field == "year" else "REAL" if field == "age" else "TEXT"
            declarations.append(subject.quote(field) + " " + kind)
        if extra_required:
            declarations.append("unreviewed_required TEXT NOT NULL")
        db.execute("CREATE TABLE race_records(id INTEGER PRIMARY KEY," + ",".join(declarations) + ")")
        db.execute("CREATE TABLE sources(id INTEGER PRIMARY KEY," + ",".join(subject.quote(field) +
                   (" INTEGER" if field == "year" else " TEXT") for field in subject.SOURCE_FIELDS) + ")")
        if not extra_required:
            db.execute("INSERT INTO race_records(id,race,year,city,runner) VALUES(40,'Earlier race',2025,'Elsewhere','EARLIER SYNTHETIC RECORD')")
        db.execute("INSERT INTO sources(id,race,year,city,url) VALUES(3,'Earlier race',2025,'Elsewhere','https://example.test/')")
        db.execute("CREATE TABLE feature_sentinel(record_id INTEGER PRIMARY KEY,value TEXT)")
        db.execute("INSERT INTO feature_sentinel VALUES(40,'existing feature stays untouched')")
        if trigger:
            db.execute("CREATE TRIGGER unexpected AFTER INSERT ON race_records BEGIN UPDATE race_records SET runner='CHANGED' WHERE id=40; END")


class ValidationTests(unittest.TestCase):
    def test_exact_age_cannot_be_inferred_from_group(self):
        row = synthetic_row()
        self.assertIsNone(subject.validate_row(row)["age"])
        row["age"] = 35
        with self.assertRaisesRegex(subject.ValidationError, "age must remain null"):
            subject.validate_row(row)

    def test_missing_splits_and_source_status_preserved(self):
        row = synthetic_row()
        row.update(status="DNF", split_35km=None, split_40km=None, split_42_2km=None, finish_gun=None)
        self.assertEqual(subject.validate_row(row)["status"], "DNF")
        self.assertEqual(subject.quality_flags(row), ["missing_checkpoint"])

    def test_actual_half_is_not_substituted_for_20km(self):
        row = synthetic_row()
        row["split_20km"] = None
        subject.validate_row(row)
        self.assertIsNone(row["split_20km"])
        self.assertEqual(row["halfway"], "01:45:00")

    def test_inconsistent_source_timings_are_preserved_with_quality_flag(self):
        row = synthetic_row()
        row["split_20km"] = "00:40:00"
        self.assertIn("non_increasing_checkpoint", subject.quality_flags(subject.validate_row(row)))
        self.assertEqual(row["split_20km"], "00:40:00")

    def test_wrong_event_url_and_malformed_times_are_rejected(self):
        for field, value in [("event_id", "WRONG"), ("year", 2025), ("source_result_id", "WRONG"),
                             ("split_5km", "23:61"), ("observed_at", "2026-09-27T18:00:00"),
                             ("status", "invented"), ("provisional", False)]:
            with self.subTest(field=field):
                row = synthetic_row()
                row[field] = value
                with self.assertRaises(subject.ValidationError):
                    subject.validate_row(row)
        self.assertEqual(subject.seconds("125:10.5"), 7510.5)


class ArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.input = self.root / "input.jsonl"
        self.snapshot = self.root / "snapshot.sqlite"
        write_rows(self.input, [synthetic_row()])

    def tearDown(self):
        self.temp.cleanup()

    def test_package_roundtrip_preserves_null_unicode_and_extra_source_fields(self):
        row = synthetic_row()
        row.update(runner="SYNTHETIC Ä, 'quote' TEST", split_20km=None,
                   source_fields={"arbitrary nested": [None, "", False, 2], "Name": "Original source label"})
        write_rows(self.input, [row, row])
        output = self.root / "package"
        manifest = subject.write_package(self.input, output)
        self.assertEqual(manifest["audit"]["unique_records"], 1)
        self.assertEqual(manifest["audit"]["identical_duplicate_input_rows"], 1)
        self.assertEqual(manifest["audit"]["coverage_status"], "unreconciled")
        self.assertFalse(manifest["canonical_record_ids"])
        self.assertEqual(json.loads((output / "berlin-2026.jsonl").read_text()), row)
        with (output / "berlin-2026.csv").open(newline="", encoding="utf-8") as f:
            decoded = {key: json.loads(value) for key, value in next(csv.DictReader(f)).items()}
        self.assertEqual(decoded, row)
        with sqlite3.connect(output / "berlin-2026.sqlite") as db:
            payload, split = db.execute("SELECT source_payload_json,split_20km FROM results").fetchone()
            self.assertEqual(json.loads(payload), row)
            self.assertIsNone(split)
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO results SELECT * FROM results")
        for name, asset in manifest["assets"].items():
            self.assertEqual(subject.sha256_file(output / name), asset["sha256"])

    def test_conflicting_duplicate_fails_without_package(self):
        row = synthetic_row()
        conflict = copy.deepcopy(row)
        conflict["split_42_2km"] = "03:32:00"
        write_rows(self.input, [row, conflict])
        output = self.root / "package"
        with self.assertRaisesRegex(subject.ValidationError, "Conflicting duplicate"):
            subject.write_package(self.input, output)
        self.assertFalse(output.exists())

    def test_collector_report_must_match_input_hash_edition_and_counts(self):
        report = {"event_id": subject.EVENT, "year": 2026, "status": "complete", "listing_complete": True,
                  "normalized_sha256": subject.sha256_file(self.input), "listed_count": 1,
                  "fetched_count": 1, "missing_details": 0, "final_official_field_verified": False}
        report_path = self.root / "collection-audit.json"
        for key, value in [("event_id", "WRONG"), ("normalized_sha256", "0" * 64),
                           ("fetched_count", 2), ("listed_count", 2), ("listing_complete", False)]:
            with self.subTest(field=key):
                invalid = dict(report, **{key: value})
                report_path.write_text(json.dumps(invalid))
                with self.assertRaises(subject.ValidationError):
                    subject.write_package(self.input, self.root / "invalid", report_path)
                self.assertFalse((self.root / "invalid").exists())
        report_path.write_text(json.dumps(report))
        manifest = subject.write_package(self.input, self.root / "valid", report_path)
        self.assertEqual(manifest["audit"]["coverage_status"], "listed-field-reconciled")
        self.assertIn("collector-report.json", manifest["assets"])

    def test_append_is_idempotent_and_preserves_old_ids_values_features_and_source(self):
        make_snapshot(self.snapshot)
        checksum = subject.sha256_file(self.snapshot)
        output = self.root / "merged.sqlite"
        report = subject.merge_copy(self.input, self.snapshot, checksum, output)
        self.assertEqual(subject.sha256_file(self.snapshot), checksum)
        self.assertEqual(report["inserted"], 1)
        self.assertFalse(report["features_regenerated"])
        with sqlite3.connect(output) as db:
            self.assertEqual(db.execute("SELECT id,runner FROM race_records ORDER BY id").fetchall(),
                             [(40, "EARLIER SYNTHETIC RECORD"), (41, "SYNTHETIC TEST ONLY")])
            self.assertEqual(db.execute("SELECT * FROM feature_sentinel").fetchall(), [(40, "existing feature stays untouched")])
            self.assertEqual(db.execute("SELECT age,age_group,age_or_group FROM race_records WHERE id=41").fetchone(), (None, "W35", "W35"))
        later_row = synthetic_row()
        later_row["observed_at"] = "2026-09-27T23:00:00Z"
        write_rows(self.input, [later_row])
        second = self.root / "second.sqlite"
        again = subject.merge_copy(self.input, output, subject.sha256_file(output), second)
        self.assertEqual((again["inserted"], again["unchanged"], again["output_records"]), (0, 1, 2))
        with sqlite3.connect(second) as db:
            self.assertEqual(db.execute("SELECT count(*) FROM sources").fetchone()[0], 2)
            self.assertEqual(db.execute("SELECT record_id FROM berlin_2026_source_records").fetchone()[0], 41)
            self.assertEqual(db.execute("SELECT ingested_at FROM race_records WHERE id=41").fetchone()[0], synthetic_row()["observed_at"])

    def test_changed_result_aborts_and_leaves_snapshot_untouched(self):
        make_snapshot(self.snapshot)
        first = self.root / "first.sqlite"
        subject.merge_copy(self.input, self.snapshot, subject.sha256_file(self.snapshot), first)
        changed = synthetic_row()
        changed["split_42_2km"] = "03:29:00"
        write_rows(self.input, [changed])
        checksum = subject.sha256_file(first)
        output = self.root / "failed.sqlite"
        with self.assertRaisesRegex(subject.ValidationError, "Source result changed"):
            subject.merge_copy(self.input, first, checksum, output)
        self.assertFalse(output.exists())
        self.assertEqual(subject.sha256_file(first), checksum)

    def test_checksum_in_place_wal_triggers_and_unknown_required_columns_rejected(self):
        make_snapshot(self.snapshot)
        checksum = subject.sha256_file(self.snapshot)
        with self.assertRaisesRegex(subject.ValidationError, "new path"):
            subject.merge_copy(self.input, self.snapshot, checksum, self.snapshot)
        with self.assertRaisesRegex(subject.ValidationError, "checksum mismatch"):
            subject.merge_copy(self.input, self.snapshot, "0" * 64, self.root / "bad.sqlite")
        Path(str(self.snapshot) + "-wal").touch()
        with self.assertRaisesRegex(subject.ValidationError, "journal/WAL"):
            subject.merge_copy(self.input, self.snapshot, checksum, self.root / "bad.sqlite")
        for flag, message in [("trigger", "triggers"), ("extra_required", "required column")]:
            path = self.root / (flag + ".sqlite")
            make_snapshot(path, **{flag: True})
            with self.assertRaisesRegex(subject.ValidationError, message):
                subject.merge_copy(self.input, path, subject.sha256_file(path), self.root / "bad.sqlite")
        self.assertFalse((self.root / "bad.sqlite").exists())

    def test_preexisting_source_url_is_adopted_without_duplicate(self):
        make_snapshot(self.snapshot)
        row = synthetic_row()
        raw = subject.raw_values(row)
        with sqlite3.connect(self.snapshot) as db:
            db.execute("INSERT INTO race_records(id," + ",".join(subject.RAW_FIELDS) + ") VALUES(99," +
                       ",".join("?" for _ in subject.RAW_FIELDS) + ")", [raw[field] for field in subject.RAW_FIELDS])
        output = self.root / "adopted.sqlite"
        report = subject.merge_copy(self.input, self.snapshot, subject.sha256_file(self.snapshot), output)
        self.assertEqual((report["inserted"], report["adopted_existing"]), (0, 1))
        with sqlite3.connect(output) as db:
            self.assertEqual(db.execute("SELECT record_id FROM berlin_2026_source_records").fetchone()[0], 99)


if __name__ == "__main__":
    unittest.main()
