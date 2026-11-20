#!/bin/bash
# The M1 run of November 14, 2026 (UTC), on branch claude/release-20261113: adapt, reconcile, audit, screen, freeze the
# edition policy and the race registry, count the cohort. No pack, story, runner file or page is rebuilt.
#
# Inputs on disk before the run (the lead's intake, 2026-11-14): the release assets in $REL
# (sha256sum -c RELEASE-SHA256SUMS-20261113-1113.txt: 19 of 19 OK; the three SQLite parts checked, then deleted) and the
# unpacked CORE archive in $CORE (its SHA256SUMS.txt: 22 of 22 OK). Nothing of the new release is downloaded here.
# Each numbered step ran under the machine's heavy-job lock (mkdir $D/heavy.lock ... rmdir), one at a time.
set -euo pipefail
D=/home/user/pn-data
REL=$D/rel-20261113-1113; CORE=$D/core-20261113-1113/pace-notes-marathon-half-20261113-1113
BASE=$D/base-1050/core; PREV=$D/prev-master-20261103b; IN=$D/in-20261113-1113; W=$D/m1-work
E=docs/evidence/2026-11-14/release-20261113-1113

# 1. The previously adopted input, rebuilt the documented way (the audit baseline). The 1050 CORE archive is the master
#    pin's baseline and the source of the three weather and course members both adapters keep byte for byte. The master
#    pin is analysis/release-master-20261103b.json, the bytes of analysis/release.json on main (fbe41078).
python3 -s analysis/download_release.py --bundle CORE --tag private-export-20261021-1050 --output $BASE
PACE_NOTES_ADAPT_MEMORY=5GB python3 -I analysis/adapt_master.py --pin analysis/release-master-20261103b.json --output $PREV/full --bundle FULL --baseline-dir $BASE
PACE_NOTES_ADAPT_MEMORY=5GB python3 -I analysis/adapt_master.py --pin analysis/release-master-20261103b.json --output $PREV/core --bundle CORE \
  --from-dir $PREV/full/master-assets --from-dir $PREV/full/overlay-assets --baseline-dir $BASE
# Measured: both manifests 55f5f5a0...58fb8, the input_manifest_sha256 of public/data/runners/manifest.json on main.

# 2. Adapt the combined release (FULL, then CORE; both list the same member digests in SHA256SUMS.txt).
python3 -I analysis/adapt_combined.py --output $IN/full --bundle FULL --from-dir $REL --core-dir $CORE --baseline-dir $BASE
python3 -I analysis/adapt_combined.py --output $IN/core --bundle CORE --from-dir $REL --core-dir $CORE --baseline-dir $BASE
cmp $IN/full/SHA256SUMS.txt $IN/core/SHA256SUMS.txt
cp $IN/full/RECONCILIATION.json $E/adapter-reconciliation.json

# 3. Inspect and audit; --previous is the rebuilt master-20261103b input.
python3 -s analysis/inspect_export.py --input $IN/full --output $W/inspection
python3 -s analysis/audit_expanded.py --input $IN/full --output $W/inspection
python3 -s analysis/audit_release.py --input $IN/full --core $IN/core --previous $PREV/full --output $W/inspection/release-contract.json
cp $W/inspection/release-contract.json $W/inspection/schema-coverage.json $W/inspection/expanded-audit.json $E/

# 4. The three screens of the October 16 review on every edition, then the edition policy: frozen once from the rule and
#    the reviewed exceptions (--write; the exceptions were the 39 rules of RULES_MASTER_20261103B, two reworded, plus
#    Honolulu 2021-2025), then recounted, with every edition's facts.
python3 -I docs/evidence/2026-10-21/release-0829/screen.py $IN/full $E/edition-screen.csv
# python3 -I $E/policy.py $IN/full $E/edition-screen.csv --write --exceptions <the reviewed exception list>   (once, 2026-11-14)
python3 -I $E/policy.py $IN/full $E/edition-screen.csv --review $E/edition-policy-review.json

# 5. The race registry: frozen once from the rule and the reviewed joins and flags (--write), then rebuilt and compared.
# python3 -I analysis/race_registry.py --input $IN/full --write --reviewed <the reviewed joins and flags>      (once, 2026-11-14)
python3 -I analysis/race_registry.py --input $IN/full

# 6. The cohort under the policy and its two sensitivity readings (build_pacing.prepare only); the previous input under
#    its own policy first, which must give the published 4,222,246 eligible finishes and 1,298,524 sustained slowdowns.
python3 -s $E/cohort.py $PREV/full - $W/cohort-previous.json
python3 -s $E/cohort.py $IN/full $E/edition-policy-review.json $W/cohort.json --previous $W/cohort-previous.json
cp $W/cohort.json $E/cohort.json; cp $W/cohort-previous.json $E/cohort-previous-master-20261103b.json

# 7. The reviews and the first edition directory.
python3 -I $E/new-editions-review.py $IN/full $E/new-editions-review.json
python3 -I $E/review.py $E/edition-policy-review.json $E/release-contract.json $E/cohort.json $E/edition-policy-decisions.json
python3 -I $E/directory.py $IN/full $E/edition-screen.csv $E/edition-directory.json $E/race-registry-review.json

# 8. The tests.
python3 -m unittest discover -s analysis -p 'test_*.py'
