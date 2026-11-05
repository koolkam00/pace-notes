# Public export access

Updated November 5, 2026 for **`master-20261103b`**, the release every page uses on the branch `feat/half-v4` (draft PR #89; not merged: production still uses `private-export-20261021-1050`, whose section is [below](#the-1050-release-october-21-2026-historical); production state is recorded in the [project handoff](../docs/PROJECT_HANDOFF.md)). Full source records, recorded names, overlays and the producer's documents are public research material. Files are compressed or plain, never encrypted. Public snapshot access does not imply a connection to the running ingestion database. `/methodology#downloads` links here as "how to open them", so this top section is rewritten at every adoption.

## Open the full records

- [`master-20261103b` and all assets](https://github.com/koolkam00/pace-notes/releases/tag/master-20261103b) (published 2026-11-03 23:10:56 UTC): one results table for the marathon and the half, the edition table and the producer's QA files. It has no hourly weather and no course routes, so those come from
- [`dataset-20261103-0706`](https://github.com/koolkam00/pace-notes/releases/tag/dataset-20261103-0706) (published 2026-11-03 12:27:45 UTC), the producer's snapshot of the same morning: `marathon-race_conditions.csv.zst`, `marathon-course_profiles.csv.zst`, `marathon-course_segments.csv.zst`, `marathon-edition_meta.csv.zst`, `marathon-record_flags.csv.zst` and `marathon-sources.csv.zst` (its `SHA256SUMS` `d9f37a77…2d62`), value-equal to 1050's own tables where they overlap ([refresh record](../docs/REFRESH_20261103b.md#why-an-adapter)).

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| [`master_results_FULL.parquet`](https://github.com/koolkam00/pace-notes/releases/download/master-20261103b/master_results_FULL.parquet) (every result of both distances, one row each (`distance` marathon or half); the marathon rows are the analyses' source) | 537,011,922 | `41d575cde127c94a9acf4242cc4d385701bb1e7568ba2e8ee65e4341e15b69db` |
| [`master_results_CORE.parquet`](https://github.com/koolkam00/pace-notes/releases/download/master-20261103b/master_results_CORE.parquet) (the same without the rows the producer leaves out of the release (not read by the pipeline)) | 535,914,531 | `a260bd777f757e30e0f30955744b4cf1f6b546440aa6d1d0156c846aa4c4d249` |
| [`editions.csv`](https://github.com/koolkam00/pace-notes/releases/download/master-20261103b/editions.csv) (one row per edition: counts, status and the producer's reasons) | 6,385,105 | `3522002d59f6a9df660b6c541c33f8da5e702e7dd05b1d43d36d3cfc4b15279b` |
| [`marathon_record_flags_detail.parquet`](https://github.com/koolkam00/pace-notes/releases/download/master-20261103b/marathon_record_flags_detail.parquet) (the marathon record flags) | 684,278 | `ed2f7a033cd195c2baade469d01d80163cb1c0bdf293b7380369b70467d69378` |
| [`SHA256SUMS`](https://github.com/koolkam00/pace-notes/releases/download/master-20261103b/SHA256SUMS) (the release's checksums) | 1,503 | `b2dc190ed25a59c1a2175a46661db0cb3d2abf5e3814e98eb8eb9ceddf2c2065` |

Every other pinned digest (the README, data dictionary, changelog, QA report, `MANIFEST_editions.csv`, `NYC2026_rows_missing_splits.csv`, `sources.csv` and the six 0706 files) is in [`analysis/release.json`](release.json).

Steps, with standard tools:

1. Download the files you want and the release's `SHA256SUMS` into one folder; check them with `sha256sum -c --ignore-missing SHA256SUMS` (on macOS, `shasum -a 256 -c --ignore-missing SHA256SUMS`).
2. Read the results with DuckDB: `SELECT * FROM 'master_results_FULL.parquet' WHERE distance = 'marathon' LIMIT 10;` (or PyArrow). `DATA_DICTIONARY.md` describes the columns; `source_record_id` is the canonical marathon record id, the same id 1050 used.
3. Decompress a 0706 CSV with `zstd -d marathon-race_conditions.csv.zst`.

Or let the repository build the folder the analysis commands read: `analysis/download_release.py` hands this pin to `analysis/adapt_master.py`, which downloads every pinned file from github.com with no token, checks each against the pin and the releases' own `SHA256SUMS`, reconciles them and writes the input folder (its own documents are labelled as adapter outputs, not producer claims).

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --output /path/to/master-20261103b-input
python analysis/download_release.py --bundle CORE --output /path/to/master-20261103b-core
```

**Anonymous access (checked November 5, 2026, 06:20:02–06:20:21 UTC):** with `GH_TOKEN` and `GITHUB_TOKEN` removed from the environment and no Authorization header, a ranged GET (`curl -sSL -r 0-0 -o /dev/null -w '%{http_code}' URL`) on the github.com download URL of every asset of both releases (14 of `master-20261103b`, 28 of `dataset-20261103-0706`) and of 1050's CORE archive, the adapter's baseline, answered 206 ([list](../docs/evidence/2026-11-04/release-master-20261103b/anonymous-access-2026-11-05.txt)). The adapter never calls api.github.com.

| Verification | Value |
| --- | --- |
| Marathon rows (FULL; CORE, the analyses' input) | 5,389,399; 5,388,605 |
| Raw coverage | 34 cities; 299 city/year editions (Amsterdam 2020, a virtual race, is out of CORE) |
| Eligible finishes under the reviewed policy | 4,222,246 in 218 editions and 27 cities |

The audit, the identity contract, the edition policy and the delta against 1050 (61,101 records added, none removed, 16,013 changed in place) are in [the refresh record](../docs/REFRESH_20261103b.md). Downloading a release does not change either pin, the website or the ingestion database.

## Half-marathon releases (October 31, 2026)

The half-marathon pages (`/half`, the half-to-full story and the tools' half panels) read the owner's public half releases in the same repository, under CC BY 4.0, pinned by sha256 in [`analysis/half-release.json`](half-release.json) (schema 3). This is the pin of the branch `feat/half-v4`, measured and reviewed on October 31, 2026 and not merged; `main` and production still read the first pin, [below](#half-marathon-releases-october-30-2026-historical). Contract, rules and evidence: [half marathons](../docs/HALF_MARATHON.md#sources-and-access).

- [`half-dataset-20261030-1904`](https://github.com/koolkam00/pace-notes/releases/tag/half-dataset-20261030-1904) (published 2026-10-30 23:52 UTC; `immutable: false` on GitHub; no DOI is stated for it): the half snapshot of October 30, 2026, 19:04 ET, and the producer's person IDs v4, which link half and marathon records, with the release's README, comma-separated tables and [`SHA256SUMS`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/SHA256SUMS) (1,383 bytes, itself pinned: sha256 `9a9759bf6aff47a2dbc5c53f97d295dd55d440392e492cca9fec6a1bc06d9446`). The pages use:

  | Asset | Bytes | SHA-256 |
  | --- | ---: | --- |
  | [`half-20261030-1904.sqlite.zst.part00`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/half-20261030-1904.sqlite.zst.part00) (the results, the only part, reassembled to `platform_half.sqlite`, 4,474,351,616 bytes, sha256 `c8f31c59b4446482c14626717eabadcecbf6dfacffab42d63bf7881181342b91`; a WAL-mode SQLite) | 480,393,114 | `748a33d2d1605da3c42be8cbaf9776713796cc4131442d1f26eea5da14819892` |
  | [`csv-edition_meta.csv.zst`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/csv-edition_meta.csv.zst) (the edition metadata, checked equal to the snapshot's `edition_meta` on every build) | 636,190 | `a0f48f1501fe1a17a669c98f0e497d16a7e52722b61c7dad3936e056724a9abe` |
  | [`README.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/README.md) (the release's README, pinned with the data) | 3,182 | `8747dc6431a5842572a2dc8b589f2a67090d7546213ba4e358d7dee0280baec1` |
  | [`race_results_linked.parquet`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/race_results_linked.parquet) (the person IDs: one row per half or marathon result; the links extract's source) | 677,175,967 | `07c5d13c39886a31ee03d0b2de3847bf00a03022a7629d223950c4bd2884cf77` |
  | [`persons.parquet`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/persons.parquet) (one row per person) | 131,547,990 | `7c95d07c48959eff3d22a2aaffc65cfa67db9ee698acb24ce2886ca862d1ed8d` |
  | [`MATCHING_V4.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/MATCHING_V4.md) (the linking rules R1–R23 and the producer's hand review) | 4,997 | `ab53ce56c491858cbc6a69b8ee5fa2b919ab7990f1b9da0e1c6e6a30f23364dd` |
  | [`COLUMNS_V4.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/COLUMNS_V4.md) (the columns of the two parquet files) | 1,192 | `684f9bbf21fc1bef9ab8850e06f5d328eadcd064510bb1c91ad4a8b5a6a205fd` |
  | [`checks.txt`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/checks.txt) (the producer's integrity checks) | 2,304 | `ccf75c8756158172209f7e981a07b4ed8c9c8c680a055479b24c14b35d3803c3` |
  | [`code.tgz`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/code.tgz) (the scripts that built the person IDs) | 13,883 | `d4ebc559b240c16aa21a710c39cdead1d5611132aa1b9ec8b2330e07e5147d50` |

  Not used by the pages: `person_ids_v4.sqlite.zst` (1,034,478,984 bytes, sha256 `b2747de3a0c448b7e4cae0b343474ad5d4046190152802c050cfa6a7198daedc`), the same person IDs as SQLite, which holds no `name_norm` or sex, so `ns_keys` cannot be rebuilt from it; `csv-race_records_nodup.csv.zst` (200,585,924 bytes, `d26d18d8ed0f374f0ca2c4b92e0e6d4a1f2b54b3d62aa5c68f8638c6415c285c`) and the release's other tables (`csv-race_conditions`, `csv-record_flags`, `csv-sources`, each in `SHA256SUMS`). Cited only: [`MATCHING_HALF.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/MATCHING_HALF.md) (4,637 bytes, `7acb6ce59ba58140d44b8f84282158a6739fea56e5ebf9a8e22692023a48f030`, the v1 method, the same file as in `half-dataset-20261029-1202`) and [`split_rates.txt`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261030-1904/split_rates.txt) (1,688 bytes, `ed99365f06f73a4b596b47b0d9723bdb8fff3ab74eb5de6fdf44a3ab024695fb`).
- [`half-dataset-20261029-2157`](https://github.com/koolkam00/pace-notes/releases/tag/half-dataset-20261029-2157), doi:[10.6084/m9.figshare.34858428.v2](https://doi.org/10.6084/m9.figshare.34858428.v2) (the 1904 README's name for it), is the **stamp reference**: [`csv-edition_meta.csv.zst`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-2157/csv-edition_meta.csv.zst) (582,494 bytes, sha256 `2b8ad1106a6ee8845147ebd4563b5dcb64a2a8fe9a9044b83a0f1e34f681e842`), the producer's corrected edition metadata of October 29, 2026, with its [`README.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-2157/README.md) (4,065 bytes, `3ba5ed96096bab048da5d81d3bd0428962661ccc494aa99963efa505e7506332`) and [`SHA256SUMS`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-2157/SHA256SUMS) (824 bytes, pinned: `fe72490f32557e4464cb5fa9577726b663a8d7c125f7456944bad6a84e4051b6`). The 1904 snapshot carries this correction natively; the build checks every stamp against the file, so it is a cross-check, not an overlay. It supersedes figshare version 1 (doi:10.6084/m9.figshare.34858428.v1), whose edition metadata overstated the verified editions.

Steps, with standard tools: download the 1904 files above and that release's `SHA256SUMS` into one folder, check them (`sha256sum -c --ignore-missing SHA256SUMS`), then decompress the snapshot (`zstd -d half-20261030-1904.sqlite.zst.part00 -o platform_half.sqlite`) and open it read-only (it is a WAL-mode SQLite, so open it as `file:platform_half.sqlite?mode=ro&immutable=1`), or read the parquet files with DuckDB. Download the three 2157 files into a folder of their own, `half-dataset-20261029-2157/` (the layout the downloader uses), and check them there: both releases ship a `csv-edition_meta.csv.zst`, a `README.md` and a `SHA256SUMS` under the same names with different digests. Or let the downloader do it, checking every asset against its release's `SHA256SUMS` (whose own digest the pin holds) and the pin, reassembling `platform_half.sqlite` with an integrity check and cutting the links extract the builders read (`links-v4.sqlite`, 260,952,064 bytes; the parquet files are deleted afterwards unless `--keep-v4`):

```bash
python -m pip install -r analysis/requirements.txt
PACE_HALF_DIR=/path/to/half-1904 python3 -I analysis/download_half.py [--work /a/larger/disk]
```

**Anonymous access** (checked October 31, 2026, 11:30:07 to 11:30:14 UTC, from a build session, a ranged GET of each github.com download URL, `curl -sS -L -r 0-0`, with every token variable unset). Every asset answered 206 after one redirect, and every `Content-Range` total equals the asset's size:

| Release | Asset | Result | Bytes (`Content-Range`) |
| --- | --- | --- | ---: |
| `half-dataset-20261030-1904` | `half-20261030-1904.sqlite.zst.part00` | 206 | 480,393,114 |
| | `csv-edition_meta.csv.zst` | 206 | 636,190 |
| | `README.md` | 206 | 3,182 |
| | `SHA256SUMS` | 206 | 1,383 |
| | `race_results_linked.parquet` | 206 | 677,175,967 |
| | `persons.parquet` | 206 | 131,547,990 |
| | `MATCHING_V4.md` | 206 | 4,997 |
| | `COLUMNS_V4.md` | 206 | 1,192 |
| | `checks.txt` | 206 | 2,304 |
| | `code.tgz` | 206 | 13,883 |
| | `split_rates.txt` | 206 | 1,688 |
| | `MATCHING_HALF.md` | 206 | 4,637 |
| `half-dataset-20261029-2157` | `csv-edition_meta.csv.zst` | 206 | 582,494 |
| | `README.md` | 206 | 4,065 |
| | `SHA256SUMS` | 206 | 824 |

In the same run the release page of `half-dataset-20261030-1904` answered 200, `https://doi.org/10.6084/m9.figshare.34858428.v2` answered 302, and the control, `half-snapshot-20261029-1133/half-20261029-1133.sqlite.zst.part00` in the private `koolkam00/pace-notes-db-backup`, answered 404. The same assets had answered 206 at the fetch (about 02:23 UTC) and in the specification review (03:53:34 UTC), and the workflow's `source` job steps downloaded them on this machine with no credentials (07:52 UTC; [half marathons](../docs/HALF_MARATHON.md#evidence-measured-october-31-2026)). The private releases `person-ids-v4-20261030-1150` (the same digests as the public v4 assets, compared October 31, 2026) and `half-snapshot-20261030-1356` (an earlier snapshot, not used) are provenance only.

## Half-marathon releases (October 30, 2026, historical)

> Historical (October 31, 2026): the first half pin, which `main` and production still read; the branch `feat/half-v4` replaces it with `half-dataset-20261030-1904` ([above](#half-marathon-releases-october-31-2026)). This section is kept as written on October 30, 2026; its heading gained "historical".

The half-marathon pages (`/half`, the half-to-full story and the tools' half panels) read the owner's public half releases in the same repository, under CC BY 4.0, pinned by sha256 in [`analysis/half-release.json`](half-release.json). Contract, rules and evidence: [half marathons](../docs/HALF_MARATHON.md#sources-and-access).

- [`half-dataset-20261029-1202`](https://github.com/koolkam00/pace-notes/releases/tag/half-dataset-20261029-1202), archived as doi:[10.6084/m9.figshare.34858428.v1](https://doi.org/10.6084/m9.figshare.34858428.v1): the half results and the links between half and marathon records, with the release's own README, comma-separated tables and `SHA256SUMS`. The pages use:

  | Asset | Bytes | SHA-256 |
  | --- | ---: | --- |
  | [`half-20261029-1133.sqlite.zst.part00`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-1202/half-20261029-1133.sqlite.zst.part00) (the results, reassembled to `platform_half.sqlite`, 3,744,944,128 bytes, sha256 `655a2d7efcdb6078f1743968bc4d4a2d2e020322855513aa633e153f6fa3673a`) | 392,995,892 | `59043a603ee5938d2143f233adbdebcdbdc83244de0aa52eb4c8070bffcb68a4` |
  | [`runner_links-20261029-1156.sqlite.zst.part00`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-1202/runner_links-20261029-1156.sqlite.zst.part00) (the links, 5.3 GB once decompressed) | 839,334,549 | `7195eba8eac3aa3a1d85ffd28b38f04ca0abff448afccc4ec59d4aa5eb8de9d7` |
  | [`MATCHING_HALF.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-1202/MATCHING_HALF.md) (how the links are built, their tiers and audit) | 4,637 | `7acb6ce59ba58140d44b8f84282158a6739fea56e5ebf9a8e22692023a48f030` |
  | [`linking-scripts-20261029-1156.tar.gz`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-1202/linking-scripts-20261029-1156.tar.gz) (the scripts that built the links) | 4,364 | `29c1ca0cc1cc37a55e62ea6639c93e90d547ce238e4a471be2003e826ee930d3` |
  | [`README.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-1202/README.md) (the release's README, pinned with the data) | 3,623 | `1cf9cbd05eaf53c138cfe3611c6f2afda438c5ef5ecd544ce9806a515bba9585` |

- [`half-dataset-20261029-2157`](https://github.com/koolkam00/pace-notes/releases/tag/half-dataset-20261029-2157), the corrected edition metadata: version 1's metadata (in the DOI above) overstated the verified editions, so the pages take verified status from [`csv-edition_meta.csv.zst`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-2157/csv-edition_meta.csv.zst) (582,494 bytes, sha256 `2b8ad1106a6ee8845147ebd4563b5dcb64a2a8fe9a9044b83a0f1e34f681e842`; its [`README.md`](https://github.com/koolkam00/pace-notes/releases/download/half-dataset-20261029-2157/README.md), 4,065 bytes, sha256 `3ba5ed96096bab048da5d81d3bd0428962661ccc494aa99963efa505e7506332`, explains the correction; both digests are in the pin's `metadata_correction`). An edition is verified only when it is stamped in both (the pin's rule: "verified = stamped in both"). That release's newer results are not in the pages yet.

Steps, with standard tools: download the 1202 parts and that release's `SHA256SUMS` into one folder, check them (`sha256sum -c --ignore-missing SHA256SUMS`), then decompress (`zstd -d half-20261029-1133.sqlite.zst.part00 -o platform_half.sqlite`, the same for the links) and open the SQLite with `sqlite3` or DuckDB. Then download `csv-edition_meta.csv.zst`, `README.md` and `SHA256SUMS` from `half-dataset-20261029-2157` into a folder of their own, such as `half-dataset-20261029-2157/` (the layout the downloader uses), and check them there the same way: both releases ship a `csv-edition_meta.csv.zst`, a `README.md` and a `SHA256SUMS` under the same names with different digests (1202's lists the overstated metadata as `a6990b17…`, 2157's the correction as `2b8ad110…`), so one folder for both fails the check or overwrites a file. Take verified status from that corrected file, not from the snapshot's own edition metadata. Or let the downloader do it, checking every asset against its release's `SHA256SUMS` and the pin, reassembling `platform_half.sqlite` with an integrity check and cutting the links extract the builders read (`links-slim.sqlite`, about 45 MB; the 5.3 GB links SQLite is deleted afterwards unless `--keep-links-sqlite`):

```bash
python -m pip install -r analysis/requirements.txt
PACE_HALF_DIR=/path/to/half-1133 python3 -I analysis/download_half.py [--links-work /a/larger/disk]
```

**Anonymous access** (checked October 30, 2026, 17:02 UTC, requests with no GitHub credentials, and again at 19:30 UTC for the assets above and both `SHA256SUMS`, whose `Content-Range` totals give the byte counts in the table): both release pages answered 200 and every pinned asset and both `SHA256SUMS` answered a ranged GET (`curl -sSL -r 0-0 -o /dev/null -w '%{http_code}' URL`) with 206 after one redirect; `https://doi.org/10.6084/m9.figshare.34858428.v1` redirected (302) to the figshare record. The asset host answers HEAD with 401 (measured from the build sessions, through their proxy), so HEAD is not a valid test, and api.github.com requests from the project's build sessions carry injected credentials, so they prove nothing. Re-checked October 30, 2026 at 23:31 UTC with the same result ([below](#how-access-was-checked)). The first, private copies (`half-snapshot-20261029-1133`, `runner-links-20261029-1156` in `koolkam00/pace-notes-db-backup`) stay as provenance; their names are the identities the policy and counts are keyed by, not access labels.

## How access was checked

**The method.** The project's build sessions reach the internet through an HTTPS proxy that adds GitHub credentials to requests for `api.github.com`, so nothing read from the GitHub API there shows what a visitor without an account can do: on October 30, 2026 at 23:41 UTC, a request with no token in the command (`env -u GH_TOKEN -u GITHUB_TOKEN curl`) read the asset list of a release in the private `koolkam00/pace-notes-db-backup` from the API with HTTP 200. Release downloads from `github.com` carry no such credentials, so the anonymous test is a ranged GET of each asset's download URL with the token variables unset:

```bash
env -u GH_TOKEN -u GITHUB_TOKEN curl -sS -L -r 0-0 -o /dev/null -D - -w '%{http_code}\n' \
  https://github.com/koolkam00/pace-notes/releases/download/<tag>/<asset>
```

A 206 (or 200) after the redirect to the asset host means anyone can download the bytes, and the `Content-Range` header gives the asset's full size; an asset in a private repository answers 404. A HEAD request is not a test: the asset host answers HEAD with 401 even for a public asset (measured from the build sessions, through their proxy). A 302 from `https://doi.org/<doi>` shows only that the DOI resolves; figshare's own pages answer scripted clients with a 202 challenge (measured from the build sessions, through their proxy). Stronger evidence is a CI job with no token, or a browser with no sign-in: the Half marathon workflow's `source` job downloaded every pinned half asset from these URLs with no token on October 30, 2026 (run 41126215052, on the merge of #85). The procedure is in [operations](../docs/OPERATIONS.md#access-checks); the current result also goes in the handoff's [Current state](../docs/PROJECT_HANDOFF.md#current-state).

**The check of October 30, 2026, 23:31 UTC** (23:31:24 to 23:31:37), from a build session, with no credentials in any request. Every asset this page lists answered 206 after one redirect, and every `Content-Range` total equals the size GitHub lists for the asset:

| Release | Asset | Result | Bytes (`Content-Range`) |
| --- | --- | --- | ---: |
| `private-export-20261021-1050` | `pace-notes-CORE-20261021-1050.tar.gz` | 206 | 189,403,111 |
| | `pace-notes-FULL-20261021-1050.tar.gz.part-00` | 206 | 790,000,000 |
| | `pace-notes-FULL-20261021-1050.tar.gz.part-01` | 206 | 780,523,364 |
| | `RELEASE-SHA256SUMS-20261021-1050.txt` | 206 | 428 |
| `half-dataset-20261029-1202` | `half-20261029-1133.sqlite.zst.part00` | 206 | 392,995,892 |
| | `runner_links-20261029-1156.sqlite.zst.part00` | 206 | 839,334,549 |
| | `MATCHING_HALF.md` | 206 | 4,637 |
| | `linking-scripts-20261029-1156.tar.gz` | 206 | 4,364 |
| | `README.md` | 206 | 3,623 |
| | `SHA256SUMS` | 206 | 935 |
| `half-dataset-20261029-2157` | `csv-edition_meta.csv.zst` | 206 | 582,494 |
| | `README.md` | 206 | 4,065 |
| | `SHA256SUMS` | 206 | 824 |
| `htw-db-2026-10-16-1652` (historical) | `htw-db-CORE-20261016-1652.tar.gz` | 206 | 189,872,267 |
| | `htw-db-FULL-20261016-1652.tar.gz` | 206 | 1,465,415,183 |
| | `race_records.parquet` | 206 | 240,181,546 |
| | `features.parquet` | 206 | 1,291,757,672 |
| | `_snapshot_platform_20261016-1652-freeze.sqlite.gz` | 206 | 679,318,522 |
| | `RELEASE-SHA256SUMS-20261016-1652.txt` | 206 | 1,410 |
| | `SHA256SUMS.txt` | 206 | 1,096 |
| | `EDITIONS.json` | 206 | 36,950 |
| | `CHANGE-REPORT.md` | 206 | 1,676 |

In the same run: the release pages of `private-export-20261021-1050`, `half-dataset-20261029-1202`, `half-dataset-20261029-2157`, `htw-db-2026-10-16-1652` and `private-export-20260912-0934` answered 200; `https://doi.org/10.6084/m9.figshare.33965155.v3` and `https://doi.org/10.6084/m9.figshare.34858428.v1` answered 302 to their figshare records; a HEAD request for the 1050 release checksums answered 401. The control, `half-snapshot-20261029-1133/half-20261029-1133.sqlite.zst.part00` in the private `koolkam00/pace-notes-db-backup` (an asset the proxied API lists), answered 404 to the same ranged GET, which shows the test does not carry the proxy's credentials.

## The 1050 release (October 21, 2026, historical)

The top of this file as it stood for `private-export-20261021-1050` until November 5, 2026, kept word for word (its headings demoted one level):

Updated October 22, 2026 for **`private-export-20261021-1050`**, the release every page uses (on `main` since PR #78, `39f3057`; production state is recorded in the [project handoff](../docs/PROJECT_HANDOFF.md)); access re-checked October 30, 2026. Full source records, recorded names, supplied features, overlays and the producer's documents are public research material. Archives are compressed, not encrypted. Public snapshot access does not imply a connection to the running ingestion database. `/methodology#downloads` links here as "how to open them", so this top section is rewritten at every adoption ([operations](../docs/OPERATIONS.md#release-intake)). The half-marathon releases have their own sections: [the v4 pin](#half-marathon-releases-october-31-2026) (branch `feat/half-v4`, October 31, 2026) and [the first pin](#half-marathon-releases-october-30-2026-historical), which `main` reads. Every asset this page lists was checked anonymously on October 30, 2026; the method and the results are in [how access was checked](#how-access-was-checked).

### Open the full records

- [1050 release and all assets](https://github.com/koolkam00/pace-notes/releases/tag/private-export-20261021-1050), also on Figshare (DOI [10.6084/m9.figshare.33965155.v3](https://doi.org/10.6084/m9.figshare.33965155.v3))
- [CORE archive](https://github.com/koolkam00/pace-notes/releases/download/private-export-20261021-1050/pace-notes-CORE-20261021-1050.tar.gz) (189,403,111 bytes): the race records, weather, routes, flags and the producer's documents, 17 members
- FULL archive in two parts, [part 00](https://github.com/koolkam00/pace-notes/releases/download/private-export-20261021-1050/pace-notes-FULL-20261021-1050.tar.gz.part-00) (790,000,000 bytes) and [part 01](https://github.com/koolkam00/pace-notes/releases/download/private-export-20261021-1050/pace-notes-FULL-20261021-1050.tar.gz.part-01) (780,523,364 bytes): every CORE member plus `features.parquet`, which carries the producer's cross-race `runner_id` (rules in `MATCHING.md`)
- [Release checksums](https://github.com/koolkam00/pace-notes/releases/download/private-export-20261021-1050/RELEASE-SHA256SUMS-20261021-1050.txt) (428 bytes), listing CORE, the joined FULL and both parts

Steps, with standard tools:

1. Download CORE, or both FULL parts, and the release checksums into one folder.
2. Join FULL's parts in order: `cat pace-notes-FULL-20261021-1050.tar.gz.part-00 pace-notes-FULL-20261021-1050.tar.gz.part-01 > pace-notes-FULL-20261021-1050.tar.gz`.
3. Check what you downloaded: `sha256sum -c --ignore-missing RELEASE-SHA256SUMS-20261021-1050.txt` (on macOS, `shasum -a 256 -c --ignore-missing RELEASE-SHA256SUMS-20261021-1050.txt`). Each file you downloaded prints OK; the others are skipped.
4. Unpack: `tar -xzf pace-notes-FULL-20261021-1050.tar.gz` (or the CORE archive). It unpacks into a folder named `private-export-20261021-1050/`, whose `SHA256SUMS.txt` lists the data files' digests (CORE's copy also lists `features.parquet`, which only FULL holds, so check it with `--ignore-missing` too).
5. From inside that folder, read the Parquet tables with DuckDB (`SELECT * FROM 'race_records.parquet' LIMIT 10;`) or PyArrow. `MANIFEST.json`, `ID-CONTRACT.md`, `FEATURE-FIELD-NOTES.md` and `MATCHING.md`, in the same folder, describe the fields.

Or let `analysis/download_release.py` do steps 1 to 4: it streams FULL's parts in order, checks each part's size and digest, refuses a joined archive whose SHA-256 is not in the release checksums, and writes every file straight into `--output` (no subfolder), which is the layout the analysis commands expect.

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag private-export-20261021-1050 --output /path/to/1050-input
python analysis/download_release.py --bundle CORE --tag private-export-20261021-1050 --output /path/to/1050-core
```

No account, password or decryption key is required: the repository is public and the release is published, not a draft (GitHub API, October 22, 2026: `private: false`, `visibility: public`; release `draft: false`, `prerelease: false`). The same day at 16:44 UTC the release's asset list (HTTP 200), the release checksums (HTTP 200, 428 bytes) and the first kilobyte of FULL part 00 (HTTP 206, 1,024 bytes) were fetched with curl from the project's build container. That container's HTTPS proxy authenticates GitHub requests (GitHub answered with a 15,000-request limit, not the anonymous 60), so this shows the files are there, not that a client without an account reached them; a check from a browser with no sign-in, or a CI job with no token, would measure that.

**Correction (October 30, 2026):** the anonymous check has since been made. With no credentials in the request, CORE, both FULL parts and the release checksums each answered a ranged GET on their github.com download URL with 206, and their `Content-Range` totals equal the sizes above (October 30, 2026, 23:31 UTC; [how access was checked](#how-access-was-checked)). `download_release.py` reads the asset list from api.github.com before it downloads, so a run of it from these build sessions still does not show anonymous access by itself.

| Verification | Value |
| --- | --- |
| CORE archive SHA-256 | `b594fb6c79663962b31562ca27b53d83a7466ee9d2ea4403010502a2ebe60de8` |
| FULL archive SHA-256 (joined) | `6df47d5538023003271a89c289332e964aa136e34b3770ecffd2e704cc8490e5` |
| FULL part 00 SHA-256 | `07788e3d11abf529e4a4930bfe2082f066ff811bd35b0fab8ac7bbb08e4bd4cc` |
| FULL part 01 SHA-256 | `9a67ce12c6d14776826249727373895b3ac776cfb366595286164c24a5ad6b09` |
| Release checksums SHA-256 | `a1307f35940b517142780f1e9ba19cd0eb4cb7515fb3a1e1bbc96056ab2d742f` |
| Raw records and features | 5,327,504 each |
| Raw coverage | 34 cities; 298 city/year editions |

The audit, the identity contract, the edition policy and the delta against 1652 (412,943 records added, 794 removed, none changed) are in [the 1050 refresh record](../docs/REFRESH_20261021_1050.md#verified-source). Downloading a release does not change either pin, the website or the ingestion database.


## The 1652 release (October 16, 2026, historical)

> Historical (October 30, 2026): 1652 was adopted on `main` by PR #70 (`77356bf`) and superseded by `private-export-20261021-1050` (PR #78, `39f3057`, October 22, 2026). This section is kept as written on October 16, 2026, with one dated correction below.

Updated October 16, 2026 for **`htw-db-2026-10-16-1652`**, the release the analyses on branch `feat/release-1652` are rebuilt from (repository state; not deployed until that branch is merged and production is checked). Full source records, recorded names, supplied features, overlays and consistent database backups are public research material. Archives are compressed, not encrypted. Public snapshot access does not imply a connection to the running ingestion database.

### Download the audited source

The release lives in the renamed repository `koolkam00/pace-notes`.

- [1652 release and all assets](https://github.com/koolkam00/pace-notes/releases/tag/htw-db-2026-10-16-1652)
- [CORE archive](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/htw-db-CORE-20261016-1652.tar.gz) (190 MB)
- [FULL archive](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/htw-db-FULL-20261016-1652.tar.gz) (1.47 GB)
- [Standalone race records](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/race_records.parquet) and [features](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/features.parquet)
- [SQLite snapshot](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/_snapshot_platform_20261016-1652-freeze.sqlite.gz) (679 MB)
- [Release checksums](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/RELEASE-SHA256SUMS-20261016-1652.txt), [member checksums](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/SHA256SUMS.txt), [per-edition counts](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/EDITIONS.json) and the [change report](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/CHANGE-REPORT.md)

No account, password or decryption key is required. On October 16, 2026 the release's asset list was read from the GitHub API without a token, and `SHA256SUMS.txt` and the first kilobyte of the SQLite snapshot were downloaded anonymously (the signed asset host answers GET; a HEAD request to it returns 401, which is not an access restriction). Standard gzip/tar tools open the archives; DuckDB or PyArrow reads Parquet. The `private` wording that the release README and MANIFEST still carry is stale producer text, not an access restriction.

**Correction (October 30, 2026):** an API read from the project's build sessions carries credentials added by their proxy, so the asset-list read above does not show anonymous access. The assets listed above answered a ranged GET with no credentials with 206 on October 30, 2026 ([how access was checked](#how-access-was-checked)).

Both archives were downloaded with `analysis/download_release.py` and checked against their release sizes and SHA-256 digests. CORE has its 12 expected members and FULL its 14. The twelve members they share match byte for byte, and every line of both copies of `SHA256SUMS.txt` matches its extracted file (CORE's copy also lists the two FULL-only files). `EDITIONS.json` and `races_summary.json` match the parquet in all 287 editions, including the counts with a 5 km split. The SQLite snapshot was not downloaded in full or opened for this refresh (disk space); its digest is listed below. See [the refresh record](../docs/REFRESH_20261016_1652.md) for calculation and import status.

| Verification | Value |
| --- | --- |
| CORE archive SHA-256 | `c747b2a46bcd69279cf6394a4eecbb16faaf2cd6d71f16af2d7dcfcac7e9ab90` |
| FULL archive SHA-256 | `c0e2e63fc826a60994cb30b28e2c2fcd57e99ffca5706d876d83c08be773215a` |
| Manifest SHA-256 | `c21298e62ea0780c9c1237aa0fc11ef7025e3ac84c186990968bf5d9e8fe40c6` |
| `race_records.parquet` SHA-256 | `4347e9ea53843ee4c7debe956dc0c878c126ab7b51434c53185f0ce94d742063` |
| `features.parquet` SHA-256 | `0ed43f6253d3b6933b45e702e747bea1c324e11832545461e5deac8162bddf86` |
| Compressed SQLite SHA-256 (release digest, not re-downloaded) | `759b717cbeb83dd482efaa5a01afee620c31e6c3b8f0f97e14bc1c121fcf0300` |
| Raw records and features | 4,915,355 each |
| Raw coverage | 34 cities; 287 city/year editions |
| Records with a 5 km split | 4,831,672 (83,683 without; 71,867 of those have a finish) |
| Latest included ingestion | `2026-10-16T20:51:53Z` |
| Manifest creation | `2026-10-16T20:55:30Z` |
| Change from 0934 | 569,263 added; 116,287 deleted; 242,649 changed raw records |
| Weather rows | 288 unique city/year rows (287 editions with records but Amsterdam 2020; Tokyo 2025 and Chicago 2021 have weather and no records) |
| Course profiles | 33; only Warsaw's has a validity bound (from 2019) |

The release is not append-only, unlike 0934 against 1107. The 116,287 deleted IDs are all of Chicago 2018 (51,967), Chicago 2019 (51,807) and Frankfurt 2019 (12,513), reloaded with new IDs: the Chicago copies of the 2024 field and the Frankfurt rows that were the 2025 race filed under 2019 are gone. Records changed in place: Paris 2014–2018 (203,026 rows' 10–40 km strings), Valencia 2022–2024 (15,702 rows from no recorded gender to F, each with a recorded F- category label), Warsaw 2015–2018 (23,919 rows relabelled to the Orlen race) and two Chicago 2024 rows. `CHANGE-REPORT.md` lists edition row counts only, so it does not show the reloads or the in-place changes. The producer's `ID-CONTRACT.md` and `FEATURE-FIELD-NOTES.md` still name the 1107 freeze; the identity contract below was verified at run time instead.

### Record and identity contract

Raw `id` and feature `record_id` are unique, non-null and have identical sets in 1652. Edition labels, recorded names and age agree exactly; all nine comparable cumulative timings agree within 1 ms after converting feature minutes to seconds (largest difference 7.3e-12 s). Raw `X` gender is normalized to null in 701 feature rows. Feature `age_group` is an engine banding, not the recorded label. Row order is not a join key.

The history builder enables canonical IDs only for the explicitly reviewed 1107, 0934 and 1652 releases, rechecking ID sets and labels before joining and matching all nine section durations plus finish time. Supplied cross-race identities must still pass ambiguity, gender/birth-year and duplicate-edition checks. Eleven names are null; they are not invented. A verified record join does not independently prove that a supplied cross-race identity belongs to one person.

Raw elapsed strings remain authoritative for site timing calculations. Feature `valid_splits` identifies 4,007,503 rows; this is not the website's raw-timing/source-quality cohort of 3,871,767. The complete export retains invalid, missing and excluded rows for audit. Missing ages remain missing (3,263,720 raw null ages); every feature race date is still null. Unique weather-overlay dates supply edition context, not personal start or exact within-year race chronology.

### Reproduce and inspect

```bash
python -m pip install -r analysis/requirements.txt
python analysis/download_release.py --bundle FULL --tag htw-db-2026-10-16-1652 --output /path/to/1652-input
python analysis/download_release.py --bundle CORE --tag htw-db-2026-10-16-1652 --output /path/to/1652-core
python analysis/inspect_export.py --input /path/to/1652-input --output /path/to/1652-inspection
python analysis/audit_expanded.py --input /path/to/1652-input --output /path/to/1652-inspection
python analysis/audit_release.py --input /path/to/1652-input --core /path/to/1652-core --previous /path/to/0934-input --output /path/to/1652-inspection/release-contract.json
```

`--previous` reproduces the raw-record delta, in total, by edition and by column. Follow [the analysis README](README.md) and [operations](../docs/OPERATIONS.md) for complete calculations and validated imports. Downloading a release does not change either pin, the website or the ingestion database.

## The 0934 release (September 12, 2026, historical)

An earlier adopted release (superseded by `htw-db-2026-10-16-1652` in PR #70, then by `private-export-20261021-1050` in PR #78), [`private-export-20260912-0934`](https://github.com/koolkam00/pace-notes/releases/tag/private-export-20260912-0934), keeps its assets and its [refresh record](../docs/REFRESH_20260912_0934.md): 4,462,379 raw and feature rows, 34 cities, 256 editions, FULL `cb4e0ab7432010de29755ec5d75ca3b370e64e481eda5b20c44b359f39552204`, manifest `a6f534d40bac291e0a1bc2eeb70633660acd00a710a090320876736de9c30f4d`, SQLite database `b5da2f6557eec5bf382f291f86c040cf50302cbaa55aa248f076c723f9cd822f` (opened read-only, `PRAGMA integrity_check` ok). Its CORE has eight members and FULL nine. Its eligible cohort was 3,517,336 finishes; those numbers stay as historical evidence.

## Historical compatibility evidence

The September 11 0336 export repaired the September 10 archive and name/edition-column blockers. Its standalone weather results preceded the complete 1107 refresh. The earlier successful [0336 workflow run](https://github.com/koolkam00/htw-live-study/actions/runs/34560607862) used older personalized target-range code and must not be substituted for a current calculation.

The September 10 export had matching CORE/FULL IDs but extra in-archive sidecars and missing `race`/`runner_name` history columns. Its [failed run](https://github.com/koolkam00/htw-live-study/actions/runs/34490423926) failed during archive selection, before those extraction/schema issues. These are historical findings, not current 1107 blockers. Preserve the [archive](../docs/evidence/2026-09-11/archive-members-audit.json), [ID](../docs/evidence/2026-09-11/id-contract-audit.json) and [timing](../docs/evidence/2026-09-11/timing-unit-contract-audit.json) audit files with their vintage labels.

September 7 CORE had 3,451,055 raw rows versus 3,382,000 feature rows, and its numeric record IDs belong to incompatible namespaces. Reproduce that vintage with the legacy one-to-one edition/name/full-timing join; never apply the 1107 contract retroactively. Its historical linked cohort was 2,366,740 finishes, with 373,955 recent benchmarks and 383,860 cross-year pairs. [Earlier public-access evidence](../docs/evidence/2026-09-11/public-access-audit.json) also retains its original date and counts.
