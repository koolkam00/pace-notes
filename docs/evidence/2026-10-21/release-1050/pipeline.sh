#!/bin/bash
# Full rebuild for private-export-20261021-1050. Stops at the first failure.
set -euo pipefail
cd /home/user/wt/r0829
F=/home/user/data/1050-full
C=/home/user/data/1050-core
B=/home/user/data/out-1050
L=$B/logs
LIVE=2026-10-17T03:53:53Z
TAG=private-20261021-1050
step() { local name=$1; shift; echo "$(date -u +%H:%M:%S) START $name"; local t0=$(date +%s); "$@" > $L/$name.log 2>&1 || { echo "$(date -u +%H:%M:%S) FAIL $name (see $L/$name.log)"; tail -5 $L/$name.log; exit 1; }; echo "$(date -u +%H:%M:%S) OK $name $(( $(date +%s)-t0 ))s"; }
step pacing python analysis/build_pacing.py --input $F --output $B/aggregates --live-as-of $LIVE
step weather python analysis/build_weather.py --input $F --output $B/weather/evidence.json
step extended python analysis/build_extended.py --input $F --output $B/aggregates --personalized-output $B/personalized --live-as-of $LIVE
step findings python analysis/write_findings.py --output $B/aggregates
step zip bash -c "cd $B/aggregates && rm -f ../pacing-aggregate-packs.zip && zip -qr ../pacing-aggregate-packs.zip . && cd ../personalized && rm -f ../pacing-personalized-aggregates.zip && zip -qr ../pacing-personalized-aggregates.zip ."
step packs-check python analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG --check-only
step personalized-check python analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG --check-only
step packs-import python analysis/import_packs.py --archive $B/pacing-aggregate-packs.zip --expected-export $TAG
step personalized-import python analysis/import_personalized.py --archive $B/pacing-personalized-aggregates.zip --expected-export $TAG
step weather-copy cp $B/weather/evidence.json public/data/weather/evidence.json
step weather-verify node scripts/verify-weather.cjs
step explorer python analysis/build_public_explorer.py --input $F --output $B/explorer
step explorer-import python analysis/import_public_explorer.py --input $B/explorer
step context python analysis/build_runner_context.py --input $F --output $B/runner-context --runners public/data/runners
step context-check python analysis/import_runner_context.py --input $B/runner-context --check-only
step context-import python analysis/import_runner_context.py --input $B/runner-context
step fast-start python analysis/build_fast_start.py --runners public/data/runners --output $B/fast-start/evidence.json
step fast-start-verify node scripts/verify-fast-start.cjs --input $B/fast-start/evidence.json
step fast-start-all python analysis/build_fast_start_all.py --runners public/data/runners --output $B/fast-start/all-finishers.json
step fast-start-all-verify node scripts/verify-fast-start-all.cjs --input $B/fast-start/all-finishers.json
step fast-start-copy cp $B/fast-start/evidence.json $B/fast-start/all-finishers.json public/data/fast-start/
step afc python analysis/build_all_finisher_context.py --runners public/data/runners --context public/data/runner-context --output $B/all-finisher-context/evidence.json
step afc-verify node scripts/verify-all-finisher-context.cjs --input $B/all-finisher-context/evidence.json
step afc-copy cp $B/all-finisher-context/evidence.json public/data/all-finisher-context/evidence.json
rm -rf $B/insights && mkdir -p $B/insights
step insights python analysis/build_insights.py --output $B/insights
step geometry python analysis/build_course_geometry.py --profiles $C/course_profiles.parquet --output $B/insights/course-geometry.json
step insights-manifest python analysis/build_insights.py --output $B/insights --only manifest
step insights-verify node scripts/verify-insights.cjs --input $B/insights
step insights-copy bash -c "rm -rf public/data/insights && cp -a $B/insights public/data/insights && diff -rq public/data/insights $B/insights"
echo "$(date -u +%H:%M:%S) PIPELINE DONE"
