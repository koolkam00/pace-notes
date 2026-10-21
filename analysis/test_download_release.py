"""Public-download behavior using tiny synthetic archives and no network."""
import contextlib
import hashlib
import io
import json
import os
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import HTTPRedirectHandler, Request

import download_release


TAG = "private-export-20260907-1318"
REPO = "example/marathon-study"


def archive_bytes(members):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        for name, content in members:
            member = tarfile.TarInfo(name)
            member.size = len(content)
            archive.addfile(member, io.BytesIO(content))
    return output.getvalue()


def release_asset(payload, name="marathon-FULL-20260907.tar.gz", tag=TAG):
    return {
        "id": 123,
        "name": name,
        "size": len(payload),
        "digest": "sha256:" + hashlib.sha256(payload).hexdigest(),
        "browser_download_url": f"https://github.com/{REPO}/releases/download/{tag}/{name}",
    }


class PublicReleaseDownloads(unittest.TestCase):
    def run_export(self, checkout, payload, tag=TAG, bundle="FULL", prefix="marathon", sums=None, parts=None):
        analysis = checkout / "analysis"
        analysis.mkdir(exist_ok=True)
        (analysis / "release.json").write_text(json.dumps({"repository": REPO, "tag": tag}))
        name = f"{prefix}-{bundle}-20260907.tar.gz"
        asset = release_asset(payload, name, tag)
        if parts is None:
            assets = [asset]
            bodies = {asset["browser_download_url"]: payload}
        else:
            # parts: (suffix, bytes) pairs; the joined archive keeps the whole payload's name and digest.
            assets = [release_asset(chunk, name + suffix, tag) for suffix, chunk in parts]
            bodies = {a["browser_download_url"]: chunk for a, (_, chunk) in zip(assets, parts)}
        if sums is not None:
            text = sums(asset).encode()
            sums_asset = release_asset(text, "RELEASE-SHA256SUMS-20260907.txt", tag)
            assets.append(sums_asset)
            bodies[sums_asset["browser_download_url"]] = text
        release = {"assets": assets, "published_at": "2026-09-07T13:18:00Z"}
        requests = []

        def respond(request, timeout):
            requests.append(request)
            if request.full_url == f"https://api.github.com/repos/{REPO}/releases/tags/{tag}":
                return io.BytesIO(json.dumps(release).encode())
            self.assertIn(request.full_url, bodies)
            return io.BytesIO(bodies[request.full_url])

        destination = checkout / "public/data/downloads" / bundle
        with patch.dict(os.environ, {}, clear=True), \
                patch.object(download_release, "__file__", str(analysis / "download_release.py")), \
                patch.object(download_release, "urlopen", side_effect=respond), \
                contextlib.redirect_stdout(io.StringIO()):
            download_release.main(["--output", str(destination), "--bundle", bundle])
        return destination, requests

    def test_htw_db_layouts_carry_their_producer_documents(self):
        # htw-db releases: CORE has the 8 base members plus 4 documents (12); FULL adds features and the feature notes (14).
        tag = "htw-db-2026-10-16-1652"
        core = download_release.EXPECTED | download_release.HTW_DB_DOCS
        full = core | {"features.parquet"} | download_release.HTW_DB_FULL_DOCS
        self.assertEqual((len(core), len(full)), (12, 14))
        for bundle, members in [("CORE", core), ("FULL", full)]:
            with self.subTest(bundle=bundle), tempfile.TemporaryDirectory() as folder:
                payload = archive_bytes([(f"export/{name}", b"synthetic fixture") for name in sorted(members)])
                destination, _ = self.run_export(Path(folder), payload, tag, bundle)
                self.assertTrue(all((destination / name).is_file() for name in members))
                provenance = json.loads((destination / "provenance.json").read_text())
                self.assertEqual((provenance["release_tag"], provenance["bundle"]), (tag, bundle))
        cases = [
            ("CORE without ID-CONTRACT.md", tag, "CORE", core - {"ID-CONTRACT.md"}, "Missing CORE files"),
            ("feature notes inside CORE", tag, "CORE", core | {"FEATURE-FIELD-NOTES.md"}, "Unexpected or duplicate"),
            ("FULL without the feature notes", tag, "FULL", full - {"FEATURE-FIELD-NOTES.md"}, "Missing FULL files"),
            ("htw-db documents in a private-export release", TAG, "FULL", full, "Unexpected or duplicate"),
        ]
        for label, case_tag, bundle, members, message in cases:
            with self.subTest(label), tempfile.TemporaryDirectory() as folder:
                payload = archive_bytes([(f"export/{name}", b"synthetic fixture") for name in sorted(members)])
                with self.assertRaisesRegex(ValueError, message):
                    self.run_export(Path(folder), payload, case_tag, bundle)

    def test_pace_notes_layouts_carry_flags_metadata_and_documents(self):
        # pace-notes-* archives (0829): the 8 base members plus 8 producer files in CORE (16); FULL adds features (17).
        tag = "private-export-20261021-0829"
        core = download_release.EXPECTED | download_release.PACE_NOTES_DOCS
        full = core | {"features.parquet"}
        self.assertEqual((len(core), len(full)), (16, 17))
        listed = lambda asset: f"{asset['digest'][7:]}  {asset['name']}\n"
        for bundle, members in [("CORE", core), ("FULL", full)]:
            with self.subTest(bundle=bundle), tempfile.TemporaryDirectory() as folder:
                payload = archive_bytes([(f"{tag}/{name}", b"synthetic fixture") for name in sorted(members)])
                destination, requests = self.run_export(Path(folder), payload, tag, bundle, "pace-notes", listed)
                self.assertTrue(all((destination / name).is_file() for name in members))
                self.assertTrue(all(request.get_header("Authorization") is None for request in requests))
                provenance = json.loads((destination / "provenance.json").read_text())
                self.assertEqual(provenance["release_checksums"]["asset"], "RELEASE-SHA256SUMS-20260907.txt")
        cases = [
            ("CORE without record flags", "CORE", core - {"record_flags.parquet"}, listed, "Missing CORE files"),
            ("FULL without edition metadata", "FULL", full - {"edition_meta.parquet"}, listed, "Missing FULL files"),
            ("an extra member", "CORE", core | {"snapshot.sqlite"}, listed, "Unexpected or duplicate"),
            ("archive digest not in the release sums", "CORE", core, lambda asset: f"{'0' * 64}  {asset['name']}\n", "release checksum file"),
            ("archive missing from the release sums", "CORE", core, lambda asset: f"{'0' * 64}  other.tar.gz\n", "release checksum file"),
            ("malformed release sums", "CORE", core, lambda asset: "not a checksum line\n", "Malformed release checksum"),
        ]
        for label, bundle, members, sums, message in cases:
            with self.subTest(label), tempfile.TemporaryDirectory() as folder:
                payload = archive_bytes([(f"{tag}/{name}", b"synthetic fixture") for name in sorted(members)])
                with self.assertRaisesRegex(ValueError, message):
                    self.run_export(Path(folder), payload, tag, bundle, "pace-notes", sums)
        # The pace-notes documents never pass in an archive of another layout.
        with tempfile.TemporaryDirectory() as folder:
            payload = archive_bytes([(f"export/{name}", b"synthetic fixture") for name in sorted(full)])
            with self.assertRaisesRegex(ValueError, "Unexpected or duplicate"):
                self.run_export(Path(folder), payload, tag, "FULL")

    def test_split_full_archive_joins_verified_parts(self):
        # 1050: FULL is attached as .part-00 and .part-01 and carries MATCHING.md; the joined archive must match the release sums.
        tag = "private-export-20261021-1050"
        full = download_release.EXPECTED | download_release.PACE_NOTES_DOCS | {"MATCHING.md", "features.parquet"}
        self.assertEqual(len(full), 18)
        payload = archive_bytes([(f"{tag}/{name}", b"synthetic fixture") for name in sorted(full)])
        half = len(payload) // 2
        split = [(".part-00", payload[:half]), (".part-01", payload[half:])]
        listed = lambda asset: f"{asset['digest'][7:]}  {asset['name']}\n"
        with tempfile.TemporaryDirectory() as folder:
            destination, requests = self.run_export(Path(folder), payload, tag, "FULL", "pace-notes", listed, split)
            self.assertTrue(all((destination / name).is_file() for name in full))
            self.assertTrue(all(request.get_header("Authorization") is None for request in requests))
            provenance = json.loads((destination / "provenance.json").read_text())
            self.assertEqual(provenance["asset"], "pace-notes-FULL-20260907.tar.gz")
            self.assertEqual(provenance["asset_sha256"], hashlib.sha256(payload).hexdigest())
            self.assertEqual([p["asset"] for p in provenance["asset_parts"]], ["pace-notes-FULL-20260907.tar.gz.part-00", "pace-notes-FULL-20260907.tar.gz.part-01"])
        swapped = [(".part-00", payload[half:]), (".part-01", payload[:half])]
        cases = [
            ("parts without a release checksum file", split, None, "must publish a release checksum file"),
            ("joined archive not in the release sums", split, lambda asset: f"{'0' * 64}  {asset['name']}\n", "release checksum file"),
            ("parts joined in the wrong order", swapped, listed, "release checksum file"),
            ("a gap in the part numbers", [(".part-00", payload[:half]), (".part-02", payload[half:])], listed, "numbered from 00"),
            ("a single part", [(".part-00", payload)], listed, "numbered from 00"),
        ]
        for label, parts, sums, message in cases:
            with self.subTest(label), tempfile.TemporaryDirectory() as folder:
                with self.assertRaisesRegex(ValueError, message):
                    self.run_export(Path(folder), payload, tag, "FULL", "pace-notes", sums, parts)
        with self.subTest("1050 without MATCHING.md"), tempfile.TemporaryDirectory() as folder:
            short = archive_bytes([(f"{tag}/{name}", b"synthetic fixture") for name in sorted(full - {"MATCHING.md"})])
            with self.assertRaisesRegex(ValueError, "Missing FULL files"):
                self.run_export(Path(folder), short, tag, "FULL", "pace-notes", listed)

    def test_a_corrupt_part_is_rejected_and_removed(self):
        payload = b"0123456789" * 50
        parts = [release_asset(payload[:250], "x-FULL-1.tar.gz.part-00"), release_asset(payload[250:], "x-FULL-1.tar.gz.part-01")]
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / "full.tar.gz"
            with patch.object(download_release, "urlopen", side_effect=[io.BytesIO(payload[:250]), io.BytesIO(b"changed")]):
                with self.assertRaisesRegex(ValueError, "checksum or size mismatch"):
                    download_release.download_archive(parts, destination)
            self.assertFalse(destination.exists())

    def test_other_tag_prefixes_are_refused(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "release tag"):
                self.run_export(Path(folder), b"", "latest")

    def test_anonymous_full_download_inside_checkout(self):
        expected = download_release.EXPECTED | {"features.parquet"}
        payload = archive_bytes([(f"export/{name}", b"synthetic fixture") for name in sorted(expected)])
        with tempfile.TemporaryDirectory() as folder:
            destination, requests = self.run_export(Path(folder), payload)
            self.assertEqual(len(requests), 2)
            self.assertTrue(all(request.get_header("Authorization") is None for request in requests))
            self.assertTrue(all((destination / name).is_file() for name in expected))
            provenance = json.loads((destination / "provenance.json").read_text())
            self.assertEqual(provenance["release_tag"], TAG)
            self.assertEqual(provenance["asset_sha256"], hashlib.sha256(payload).hexdigest())

    def test_optional_token_is_api_only_and_not_redirected(self):
        for variable in ["GH_TOKEN", "GITHUB_TOKEN"]:
            with self.subTest(variable=variable), tempfile.TemporaryDirectory() as folder, \
                    patch.dict(os.environ, {variable: "synthetic-test-token"}, clear=True):
                with patch.object(download_release, "urlopen", return_value=io.BytesIO(b"{}")) as request_api:
                    download_release.read_release(REPO, TAG)
                request = request_api.call_args.args[0]
                self.assertEqual(request.get_header("Authorization"), "Bearer synthetic-test-token")
                redirected = HTTPRedirectHandler().redirect_request(
                    request, None, 302, "Found", {}, "https://release-assets.githubusercontent.com/fixture",
                )
                self.assertIsNone(redirected.get_header("Authorization"))
                payload = b"synthetic fixture"
                with patch.object(download_release, "urlopen", return_value=io.BytesIO(payload)) as request_asset:
                    download_release.download_asset(release_asset(payload), Path(folder) / "asset")
                self.assertIsNone(request_asset.call_args.args[0].get_header("Authorization"))

    def test_token_follows_only_github_api_redirects(self):
        # A renamed repository redirects its old API URL to api.github.com; keep the token there only.
        with patch.dict(os.environ, {"GH_TOKEN": "synthetic-test-token"}, clear=True), \
                patch.object(download_release, "urlopen", return_value=io.BytesIO(b"{}")) as request_api:
            download_release.read_release(REPO, TAG)
        request = request_api.call_args.args[0]
        handler = download_release.GitHubApiRedirect()
        renamed = handler.redirect_request(request, None, 301, "Moved Permanently", {}, "https://api.github.com/repositories/42/releases/tags/" + TAG)
        self.assertEqual(renamed.get_header("Authorization"), "Bearer synthetic-test-token")
        for url in ["https://release-assets.githubusercontent.com/fixture", "http://api.github.com/repos/x", "https://api.github.com.example.org/repos/x"]:
            with self.subTest(url=url):
                self.assertIsNone(handler.redirect_request(request, None, 302, "Found", {}, url).get_header("Authorization"))
        anonymous = Request("https://api.github.com/repos/x", headers={"User-Agent": "test"})
        self.assertIsNone(handler.redirect_request(anonymous, None, 301, "Moved Permanently", {}, "https://api.github.com/repos/y").get_header("Authorization"))

    def test_corrupt_asset_is_rejected_and_removed(self):
        with tempfile.TemporaryDirectory() as folder:
            destination = Path(folder) / "asset"
            with patch.object(download_release, "urlopen", return_value=io.BytesIO(b"changed")):
                with self.assertRaisesRegex(ValueError, "checksum or size mismatch"):
                    download_release.download_asset(release_asset(b"original"), destination)
            self.assertFalse(destination.exists())

    def test_archive_path_traversal_is_still_rejected(self):
        payload = archive_bytes([("../race_records.parquet", b"synthetic fixture")])
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "unsafe member"):
                self.run_export(Path(folder), payload)
            self.assertFalse((Path(folder) / "public/data/race_records.parquet").exists())


if __name__ == "__main__":
    unittest.main()
