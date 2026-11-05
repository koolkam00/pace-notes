#!/bin/bash
# The M1 run of November 4, 2026 (UTC), on branch feat/half-v4: adapt, audit and count; no pack, story or runner file.
# Inputs: the pinned master-20261103b assets (sha256sum -c SHA256SUMS: all OK), the dataset-20261103-0706 marathon CSVs
# (curl from github.com release URLs with no token; sha256sum -c against 0706 SHA256SUMS d9f37a77...) and the 1050 CORE
# (download_release.py --bundle CORE --tag private-export-20261021-1050; archive b594fb6c..., then deleted).
set -euo pipefail
M=/home/user/data/master-20261103b; O=/home/user/data/m1103-0706; B=/home/user/data/m1103-1050/core
IN=/home/user/data/m1103-input; W=/home/user/data/m1103-work; E=docs/evidence/2026-11-04/release-master-20261103b
# 1. Adapt (FULL, then CORE; both write the same SHA256SUMS.txt). Without --from-dir/--baseline-dir the adapter downloads.
python3 -I analysis/adapt_master.py --output $IN/full --bundle FULL --from-dir $M --from-dir $O --baseline-dir $B
python3 -I analysis/adapt_master.py --output $IN/core --bundle CORE --from-dir $M --from-dir $O --baseline-dir $B
cp $IN/full/RECONCILIATION.json $E/adapter-reconciliation.json
# 2. Inspect and audit (the audit's --previous is the 1050 CORE folder).
python3 -s analysis/inspect_export.py --input $IN/full --output $W/inspection
python3 -s analysis/audit_expanded.py --input $IN/full --output $W/inspection
python3 -s analysis/audit_release.py --input $IN/full --core $IN/core --previous $B --output $W/inspection/release-contract.json
cp $W/inspection/release-contract.json $E/
# 3. The 1652 review's three screens, and the cohort under the reviewed policy (build_pacing.prepare only).
python3 -I docs/evidence/2026-10-21/release-0829/screen.py $IN/full $E/edition-screen.csv
python3 -s $E/cohort.py $IN/full $W/cohort.json && cp $W/cohort.json $E/
