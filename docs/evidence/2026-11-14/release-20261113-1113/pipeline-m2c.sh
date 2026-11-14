#!/bin/bash
# The M2-C run of November 14, 2026 (UTC), step 1b, on branch claude/release-20261113: the final inputs of this adoption.
# One adaptation with the lead's rulings on the M2-A result (adoption plan D27 to D29, D33, D38 and the label ruling),
# then the edition policy, the record status file, the identity file and the marathon cohort issued again, and the
# outputs of M2-A rebuilt on them. Each numbered step ran under the machine's heavy-job lock, one at a time.
#   D27  Los Angeles 2026 dated 2026-03-08 from a cited external source (analysis/reviewed-race-dates.json, `evidence: external`)
#   D28  HALF_ROW_RULE: the half rows that take no part in the identity rule (951); the identity file is final
#   D29  the Warsaw series note in the race registry; `series` on the cohort manifest's edition rows
#   D33  three rows of London 2026 written by reviewed exception (analysis/reviewed-row-exceptions.json)
#   D38  the class of each record's link in the cohort's edition files; the linkage counts on high links alone
#   labels: 63 reviewed labels and six reviewed joins more (805 races), two reviewed flags; tiers on the manifest's other editions
set -euo pipefail
D=/home/user/pn-data
REL=$D/rel-20261113-1113; CORE=$D/core-20261113-1113/pace-notes-marathon-half-20261113-1113
BASE=$D/base-1050/core; IN=$D/in-20261113-1113; NEW=$D/in-new; B=$D/m2c-out
E=docs/evidence/2026-11-14/release-20261113-1113
TAG=pace-notes-marathon-half-20261113-1113
LIVE=2026-11-05T16:39:47Z   # production /data/live.json as_of, read 2026-11-14 (its release_tag: master-20261103b)

# 1. The race registry, frozen before the adaptation from the written editions (M2-A's, with London 2026's three rows
#    of D33 added: the adapter rebuilds the registry from the rows it writes and stops on any difference).
# python3 -I analysis/race_registry.py --editions <written editions> --tag $TAG --write --reviewed <22 joins, 13 flags, 99 labels, 1 series>   (once, 2026-11-14)

# 2. Adapt (FULL) into a new folder, check the registry against it, then put it in the place of the M2-A input.
PACE_NOTES_ADAPT_MEMORY=5GB python3 -I analysis/adapt_combined.py --output $NEW/full --bundle FULL --from-dir $REL --core-dir $CORE --baseline-dir $BASE
python3 -I analysis/race_registry.py --input $NEW/full
mv $IN/full $D/in-old-full && mv $NEW/full $IN/full && rm -rf $D/in-old-full $NEW
cp $IN/full/RECONCILIATION.json $E/adapter-reconciliation.json

# 3. The screens and the edition policy, frozen again (the labels of 64 races changed; the same 201 editions are counted).
python3 -I docs/evidence/2026-10-21/release-0829/screen.py $IN/full $E/edition-screen.csv
# python3 -I $E/policy.py $IN/full $E/edition-screen.csv --write        (once, 2026-11-14; then POLICY_FILE_SHA256_20261113_1113)
python3 -I $E/policy.py $IN/full $E/edition-screen.csv --review $E/edition-policy-review.json

# 4. The three pipeline files every later builder reads, and the cohort's verifiers.
python3 -s analysis/build_record_status.py --input $IN/full --output $IN/record-status.parquet
python3 -s analysis/build_identity.py --input $IN/full --output $IN/identity.parquet
python3 -s analysis/build_cohort.py --input $IN/full --status $IN/record-status.parquet --identity $IN/identity.parquet --output analysis/marathon-cohort
python3 -s analysis/verify_cohort.py --cohort analysis/marathon-cohort --status $IN/record-status.parquet --identity $IN/identity.parquet --input $IN/full
node scripts/verify-cohort.cjs

# 5. The outputs that depend only on the adapted input and the identity file, in the order of pipeline-m2a.sh.
python3 -s analysis/build_edition_policy.py --input $IN/full --output $B/edition-policy.json
cp $B/edition-policy.json public/data/edition-policy.json
python3 -s analysis/build_pacing.py --input $IN/full --output $B/aggregates --live-as-of $LIVE
python3 -s analysis/build_weather.py --input $IN/full --output $B/weather/evidence.json
PACE_NOTES_EXTENDED_MEMORY=8GB python3 -s analysis/build_extended.py --input $IN/full --output $B/aggregates --personalized-output $B/personalized --live-as-of $LIVE --identity $IN/identity.parquet
rm -rf $IN/full/extended-temp
python3 -s analysis/write_findings.py --output $B/aggregates
(cd $B/aggregates && zip -qr ../pacing-aggregate-packs.zip . && cd ../personalized && zip -qr ../pacing-personalized-aggregates.zip .)
python3 -s analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG --check-only
python3 -s analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG --check-only
python3 -s analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG
python3 -s analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG
cp $B/weather/evidence.json public/data/weather/evidence.json

# 6. The evidence of this folder that is counted from the final input.
python3 -I $E/row-exceptions.py $IN/full $IN/record-status.parquet $E/row-exceptions.json
python3 -s $E/cohort.py $IN/full $E/edition-policy-review.json $E/cohort.json --previous $E/cohort-previous-master-20261103b.json --sensitivity $E/cohort-sensitivity.json
python3 -I $E/new-editions-review.py $IN/full $E/new-editions-review.json
python3 -I $E/directory.py $IN/full $E/edition-screen.csv $E/edition-directory.json $E/race-registry-review.json
# release-contract.json, schema-coverage.json, expanded-audit.json and edition-policy-decisions.json are still the M2-A
# run's (they need the previous release adapted again as the audit baseline); pipeline-m2a.sh step 4 repeats them.

# 7. The checks.
python3 -m unittest discover -s analysis -p 'test_*.py'    # the ten test_half tests that bind the half to master-20261103b fail until the half is rebuilt
npx tsc --noEmit
node scripts/verify-cohort.cjs
node scripts/verify-personalized.cjs
