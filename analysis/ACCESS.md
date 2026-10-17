# Public export access

Updated October 16, 2026 for **`htw-db-2026-10-16-1652`**, the release the analyses on branch `feat/release-1652` are rebuilt from (repository state; not deployed until that branch is merged and production is checked). Full source records, recorded names, supplied features, overlays and consistent database backups are public research material. Archives are compressed, not encrypted. Public snapshot access does not imply a connection to the running ingestion database.

## Download the audited source

The release lives in the renamed repository `koolkam00/pace-notes`.

- [1652 release and all assets](https://github.com/koolkam00/pace-notes/releases/tag/htw-db-2026-10-16-1652)
- [CORE archive](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/htw-db-CORE-20261016-1652.tar.gz) (190 MB)
- [FULL archive](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/htw-db-FULL-20261016-1652.tar.gz) (1.47 GB)
- [Standalone race records](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/race_records.parquet) and [features](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/features.parquet)
- [SQLite snapshot](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/_snapshot_platform_20261016-1652-freeze.sqlite.gz) (679 MB)
- [Release checksums](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/RELEASE-SHA256SUMS-20261016-1652.txt), [member checksums](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/SHA256SUMS.txt), [per-edition counts](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/EDITIONS.json) and the [change report](https://github.com/koolkam00/pace-notes/releases/download/htw-db-2026-10-16-1652/CHANGE-REPORT.md)

No account, password or decryption key is required. On October 16, 2026 the release's asset list was read from the GitHub API without a token, and `SHA256SUMS.txt` and the first kilobyte of the SQLite snapshot were downloaded anonymously (the signed asset host answers GET; a HEAD request to it returns 401, which is not an access restriction). Standard gzip/tar tools open the archives; DuckDB or PyArrow reads Parquet. The `private` wording that the release README and MANIFEST still carry is stale producer text, not an access restriction.

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

## Record and identity contract

Raw `id` and feature `record_id` are unique, non-null and have identical sets in 1652. Edition labels, recorded names and age agree exactly; all nine comparable cumulative timings agree within 1 ms after converting feature minutes to seconds (largest difference 7.3e-12 s). Raw `X` gender is normalized to null in 701 feature rows. Feature `age_group` is an engine banding, not the recorded label. Row order is not a join key.

The history builder enables canonical IDs only for the explicitly reviewed 1107, 0934 and 1652 releases, rechecking ID sets and labels before joining and matching all nine section durations plus finish time. Supplied cross-race identities must still pass ambiguity, gender/birth-year and duplicate-edition checks. Eleven names are null; they are not invented. A verified record join does not independently prove that a supplied cross-race identity belongs to one person.

Raw elapsed strings remain authoritative for site timing calculations. Feature `valid_splits` identifies 4,007,503 rows; this is not the website's raw-timing/source-quality cohort of 3,871,767. The complete export retains invalid, missing and excluded rows for audit. Missing ages remain missing (3,263,720 raw null ages); every feature race date is still null. Unique weather-overlay dates supply edition context, not personal start or exact within-year race chronology.

## Reproduce and inspect

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

The previous adopted release, [`private-export-20260912-0934`](https://github.com/koolkam00/pace-notes/releases/tag/private-export-20260912-0934), keeps its assets and its [refresh record](../docs/REFRESH_20260912_0934.md): 4,462,379 raw and feature rows, 34 cities, 256 editions, FULL `cb4e0ab7432010de29755ec5d75ca3b370e64e481eda5b20c44b359f39552204`, manifest `a6f534d40bac291e0a1bc2eeb70633660acd00a710a090320876736de9c30f4d`, SQLite database `b5da2f6557eec5bf382f291f86c040cf50302cbaa55aa248f076c723f9cd822f` (opened read-only, `PRAGMA integrity_check` ok). Its CORE has eight members and FULL nine. Its eligible cohort was 3,517,336 finishes; those numbers stay as historical evidence.

## Historical compatibility evidence

The September 11 0336 export repaired the September 10 archive and name/edition-column blockers. Its standalone weather results preceded the complete 1107 refresh. The earlier successful [0336 workflow run](https://github.com/koolkam00/htw-live-study/actions/runs/34560607862) used older personalized target-range code and must not be substituted for a current calculation.

The September 10 export had matching CORE/FULL IDs but extra in-archive sidecars and missing `race`/`runner_name` history columns. Its [failed run](https://github.com/koolkam00/htw-live-study/actions/runs/34490423926) failed during archive selection, before those extraction/schema issues. These are historical findings, not current 1107 blockers. Preserve the [archive](../docs/evidence/2026-09-11/archive-members-audit.json), [ID](../docs/evidence/2026-09-11/id-contract-audit.json) and [timing](../docs/evidence/2026-09-11/timing-unit-contract-audit.json) audit files with their vintage labels.

September 7 CORE had 3,451,055 raw rows versus 3,382,000 feature rows, and its numeric record IDs belong to incompatible namespaces. Reproduce that vintage with the legacy one-to-one edition/name/full-timing join; never apply the 1107 contract retroactively. Its historical linked cohort was 2,366,740 finishes, with 373,955 recent benchmarks and 383,860 cross-year pairs. [Earlier public-access evidence](../docs/evidence/2026-09-11/public-access-audit.json) also retains its original date and counts.
