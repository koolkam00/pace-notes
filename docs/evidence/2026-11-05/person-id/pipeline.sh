#!/bin/bash
# The person-id run of November 5, 2026 (UTC), on branch feat/person-id-identity: every owned marathon output rebuilt and
# imported from the folders adapter version 2 wrote (person_id as the cross-race key; New York 2026 dated). Stops at the
# first failure. Same order as pipeline-m2.sh (docs/evidence/2026-11-04/release-master-20261103b), with the half after.
# Order as docs/OPERATIONS.md binds it. The weather evidence is copied before the Top 100 charts, which bind it by hash;
# verify-weather renders pages that read the all-finisher context and the stories, so it runs after them.
# Usage: pipeline.sh [first-step]   (resume from a named step after a failure; earlier steps are skipped)
set -euo pipefail
cd /home/user/wt/pid
F=/home/user/data/m1105-input/full
C=/home/user/data/m1105-input/core
B=/home/user/data/m1105-out
L=$B/logs
LIVE=2026-11-04T14:30:12Z   # production /data/live.json as_of, read 2026-11-05 (master-20261103b, b35789b8/3bc2b26e)
TAG=master-20261103b        # EXPORT_ID: the private-export- replacement leaves a master tag unchanged
export PACE_NOTES_EXTENDED_MEMORY=${PACE_NOTES_EXTENDED_MEMORY:-11GB}
mkdir -p $L
FROM=${1:-}
step() {
  local name=$1; shift
  if [ -n "$FROM" ]; then [ "$name" = "$FROM" ] && FROM= || { echo "skip $name"; return 0; }; fi
  echo "$(date -u +%H:%M:%S) START $name"; local t0=$(date +%s)
  "$@" > $L/$name.log 2>&1 || { echo "$(date -u +%H:%M:%S) FAIL $name (see $L/$name.log)"; tail -15 $L/$name.log; exit 1; }
  echo "$(date -u +%H:%M:%S) OK $name $(( $(date +%s)-t0 ))s; free $(df --output=avail -BM /home/user | tail -1)"
}
step tests python3 -m unittest discover -s analysis -p 'test_*.py'
step pacing python3 -s analysis/build_pacing.py --input $F --output $B/aggregates --live-as-of $LIVE
step weather python3 -s analysis/build_weather.py --input $F --output $B/weather/evidence.json
step extended python3 -s analysis/build_extended.py --input $F --output $B/aggregates --personalized-output $B/personalized --live-as-of $LIVE
step extended-clean rm -rf $F/extended-temp
step findings python3 -s analysis/write_findings.py --output $B/aggregates
step zip bash -c "cd $B/aggregates && rm -f ../pacing-aggregate-packs.zip && zip -qr ../pacing-aggregate-packs.zip . && cd ../personalized && rm -f ../pacing-personalized-aggregates.zip && zip -qr ../pacing-personalized-aggregates.zip ."
step packs-check python3 -s analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG --check-only
step personalized-check python3 -s analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG --check-only
step packs-import python3 -s analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG
step personalized-import python3 -s analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG
step explorer python3 -s analysis/build_public_explorer.py --input $F --output $B/explorer
step explorer-import python3 -s analysis/import_public_explorer.py --input $B/explorer
step context python3 -s analysis/build_runner_context.py --input $F --output $B/runner-context --runners public/data/runners
step context-check python3 -s analysis/import_runner_context.py --input $B/runner-context --check-only
step context-import python3 -s analysis/import_runner_context.py --input $B/runner-context
step fast-start python3 -s analysis/build_fast_start.py --runners public/data/runners --output $B/fast-start/evidence.json
step fast-start-verify node scripts/verify-fast-start.cjs --input $B/fast-start/evidence.json
step fast-start-all python3 -s analysis/build_fast_start_all.py --runners public/data/runners --output $B/fast-start/all-finishers.json
step fast-start-all-verify node scripts/verify-fast-start-all.cjs --input $B/fast-start/all-finishers.json
step fast-start-copy cp $B/fast-start/evidence.json $B/fast-start/all-finishers.json public/data/fast-start/
step afc python3 -s analysis/build_all_finisher_context.py --runners public/data/runners --context public/data/runner-context --output $B/all-finisher-context/evidence.json
step afc-verify node scripts/verify-all-finisher-context.cjs --input $B/all-finisher-context/evidence.json
step afc-copy cp $B/all-finisher-context/evidence.json public/data/all-finisher-context/evidence.json
step insights-fresh bash -c "rm -rf $B/insights && mkdir -p $B/insights"
step insights python3 -s analysis/build_insights.py --output $B/insights
step geometry python3 -s analysis/build_course_geometry.py --profiles $C/course_profiles.parquet --output $B/insights/course-geometry.json
step terrain python3 -s analysis/build_course_terrain.py --profiles $C/course_profiles.parquet --corrections analysis/course_terrain/corrections.json --output $B/insights/tools/course-terrain.json
step insights-manifest python3 -s analysis/build_insights.py --output $B/insights --only manifest
step insights-verify node scripts/verify-insights.cjs --input $B/insights
step insights-copy bash -c "rm -rf public/data/insights && cp -a $B/insights public/data/insights && diff -rq public/data/insights $B/insights"
step weather-copy cp $B/weather/evidence.json public/data/weather/evidence.json
step charts python3 -s analysis/build_charts.py --output public/data/charts
step charts-verify node scripts/verify-charts.cjs
step weather-verify node scripts/verify-weather.cjs
step live-json python3 -c "import json; l=json.load(open('public/data/live.json')); assert l['release_tag']=='$TAG', l; print(json.dumps(l, indent=2))"
echo "$(date -u +%H:%M:%S) PIPELINE DONE"
