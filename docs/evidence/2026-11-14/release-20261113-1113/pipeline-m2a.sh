#!/bin/bash
# The M2-A run of November 14, 2026 (UTC), on branch claude/release-20261113: the lead's rulings on the first
# reconciliation (adoption plan: R2, R4, R5, R7, R8, D19, D24) applied, the release adapted again, the edition policy
# and the race registry frozen again, the audit and the cohort counted again, and the outputs that depend only on the
# adapted input rebuilt and imported. The runner lookup, the supporting study, runner context, fast start, the
# all-finisher views, the stories, the charts and the half are NOT rebuilt here.
#
# Each numbered step ran under the machine's heavy-job lock (mkdir $D/heavy.lock ... rmdir), one at a time. The
# release assets ($REL) and the unpacked CORE archive ($CORE) are the lead's verified intake, as in pipeline.sh.
set -euo pipefail
D=/home/user/pn-data
REL=$D/rel-20261113-1113; CORE=$D/core-20261113-1113/pace-notes-marathon-half-20261113-1113
BASE=$D/base-1050/core; PREV=$D/prev-master-20261103b; IN=$D/in-20261113-1113; W=$D/m2a-work; B=$D/m2a-out
E=docs/evidence/2026-11-14/release-20261113-1113
TAG=pace-notes-marathon-half-20261113-1113
LIVE=2026-11-05T16:39:47Z   # production /data/live.json as_of, read 2026-11-14 (its release_tag: master-20261103b)

# 1. The race registry, frozen before the adaptation. The adapter writes each race's label as `city`, so it needs the
#    registry of the rows it is about to write: a first run dumps those editions (and the row-rule counts to read),
#    the registry is frozen from them with the reviewed joins, flags and labels, and every later run rebuilds it and
#    stops on any difference.
python3 -I analysis/adapt_combined.py --output $W/reg --from-dir $REL --core-dir $CORE --baseline-dir $BASE --registry-editions $W/written-editions.json
# python3 -I analysis/race_registry.py --editions $W/written-editions.json --tag $TAG --write --reviewed <the reviewed joins, flags and labels>   (once, 2026-11-14)

# 2. Adapt (FULL, then CORE; both list the same member digests), into a new folder that then replaced $IN.
python3 -I analysis/adapt_combined.py --output $IN/full --bundle FULL --from-dir $REL --core-dir $CORE --baseline-dir $BASE
python3 -I analysis/adapt_combined.py --output $IN/core --bundle CORE --from-dir $REL --core-dir $CORE --baseline-dir $BASE
cmp $IN/full/SHA256SUMS.txt $IN/core/SHA256SUMS.txt
cp $IN/full/RECONCILIATION.json $E/adapter-reconciliation.json
python3 -I analysis/race_registry.py --input $IN/full          # the registry rebuilt from release_keys.parquet equals the frozen file

# 3. The screens and the edition policy. The screen script imports build_pacing, which loads the frozen policy; while
#    that file was still in the earlier schema (no own_record), the unchanged script was run from an archive of the
#    pushed commit cc8e66a6a (git archive ... analysis docs/evidence/2026-10-21/release-0829/screen.py). From now on it
#    runs from the checkout, before the policy file is frozen again and its digest pinned.
python3 -I docs/evidence/2026-10-21/release-0829/screen.py $IN/full $E/edition-screen.csv
# python3 -I $E/policy.py $IN/full $E/edition-screen.csv --write        (once, 2026-11-14; then POLICY_FILE_SHA256_20261113_1113)
python3 -I $E/policy.py $IN/full $E/edition-screen.csv --review $E/edition-policy-review.json

# 4. The previously adopted input again (the audit baseline), then inspect and audit.
PACE_NOTES_ADAPT_MEMORY=5GB python3 -I analysis/adapt_master.py --pin analysis/release-master-20261103b.json --output $PREV/full --bundle FULL --baseline-dir $BASE
python3 -s analysis/inspect_export.py --input $IN/full --output $W/inspection
python3 -s analysis/audit_expanded.py --input $IN/full --output $W/inspection
python3 -s analysis/audit_release.py --input $IN/full --core $IN/core --previous $PREV/full --output $W/inspection/release-contract.json
cp $W/inspection/release-contract.json $W/inspection/schema-coverage.json $W/inspection/expanded-audit.json $E/

# 5. The cohort under the policy and its readings (build_pacing.prepare only), the reviews and the directory.
python3 -s $E/cohort.py $PREV/full - $E/cohort-previous-master-20261103b.json
python3 -s $E/cohort.py $IN/full $E/edition-policy-review.json $E/cohort.json --previous $E/cohort-previous-master-20261103b.json --sensitivity $E/cohort-sensitivity.json
python3 -I $E/new-editions-review.py $IN/full $E/new-editions-review.json
python3 -I $E/review.py $E/edition-policy-review.json $E/release-contract.json $E/cohort.json $E/edition-policy-decisions.json
python3 -I $E/directory.py $IN/full $E/edition-screen.csv $E/edition-directory.json $E/race-registry-review.json

# 6. The three pipeline files every later builder reads: record status, identity (both distances), the cohort.
python3 -s analysis/build_record_status.py --input $IN/full --output $IN/record-status.parquet
python3 -s analysis/build_identity.py --input $IN/full --output $IN/identity.parquet
python3 -s analysis/build_cohort.py --input $IN/full --status $IN/record-status.parquet --identity $IN/identity.parquet --output analysis/marathon-cohort
python3 -s analysis/verify_cohort.py --cohort analysis/marathon-cohort --status $IN/record-status.parquet --identity $IN/identity.parquet
node scripts/verify-cohort.cjs

# 7. The outputs that depend only on the adapted input, in the order of the master adoption's pipeline-m2.sh.
python3 -s analysis/build_edition_policy.py --input $IN/full --output $B/edition-policy.json
cp $B/edition-policy.json public/data/edition-policy.json
python3 -s analysis/build_pacing.py --input $IN/full --output $B/aggregates --live-as-of $LIVE
python3 -s analysis/build_weather.py --input $IN/full --output $B/weather/evidence.json
PACE_NOTES_EXTENDED_MEMORY=10GB python3 -s analysis/build_extended.py --input $IN/full --output $B/aggregates --personalized-output $B/personalized --live-as-of $LIVE
rm -rf $IN/full/extended-temp
python3 -s analysis/write_findings.py --output $B/aggregates
(cd $B/aggregates && zip -qr ../pacing-aggregate-packs.zip . && cd ../personalized && zip -qr ../pacing-personalized-aggregates.zip .)
python3 -s analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG --check-only
python3 -s analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG --check-only
python3 -s analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG
python3 -s analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG
cp $B/weather/evidence.json public/data/weather/evidence.json

# 8. The checks that these outputs allow today.
python3 -m unittest discover -s analysis -p 'test_*.py'    # the ten test_half tests that bind the half to master-20261103b fail until the half is rebuilt
npx tsc --noEmit
node scripts/verify-personalized.cjs
node scripts/verify-css.cjs
# verify-research, verify-units and verify-ten-analyses stop at the supporting study and the stories of the previous
# release; verify-weather passes every check of the evidence and stops at its first page render (all-finisher context).
